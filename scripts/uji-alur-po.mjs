/**
 * UJI ALUR PEMBELI + PENJUAL (end-to-end, tanpa dashboard admin).
 *
 *Skrip ini memakai anon/publishable key persis seperti website, jadi
 * menguji jalur yang sama: RLS, validasi zod-ish di DB, dan `create_order`.
 *
 *   node scripts/uji-alur-po.mjs
 *
 * Catatan: skrip ini BENAR-BENAR membuat pesanan di database produksi.
 * Nama pesanan selalu diawali "TEST STEVEN" biar gampang searched / dihapus.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      if (!process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) {
    pass++;
    console.log(`  OK    ${name}`);
  } else {
    fail++;
    console.log(`  GAGAL ${name} ${extra}`);
  }
}

async function rpc(name, args) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

const p = (s) => console.log(`\n=== ${s} ===`);

p("0. KESIAPAN DATA");
const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const batch = await db.query(
  `select id, pickup_date::text as pickup_date from po_batches
    where is_active and public.po_today() between open_at and close_at
    order by pickup_date limit 1`,
);
if (batch.rows.length === 0) {
  console.log("  TIDAK ADA batch PO yang buka. Hentikan.");
  await db.end();
  process.exit(1);
}
const batchId = Number(batch.rows[0].id);
// `date` diambil langsung sebagai teks (`::text` di SQL). Kalau dibiarkan
// apa adanya, driver pg membuat Date di zona waktu lokal Node, lalu
// dikembalikan lagi sebagai string ISO ber-/Z — tanggalnya geser sehari
// dan create_order menolak dengan `batch_pickup_mismatch`.
const pickupDate = batch.rows[0].pickup_date;
console.log(`  batch: ${batchId}  tanggal ambil: ${pickupDate}`);

const zona = await db.query(
  `select id from delivery_zones where kind = 'pickup' and is_active order by sort_order limit 1`,
);
const pickupZone = zona.rows[0]?.id ?? "pickup";
console.log(`  zona pickup: ${pickupZone}`);

const bundel = await db.query(
  `select b.id, b.name_id, b.required_qty, b.is_fixed,
          (select count(*)::int from bundle_slots s where s.bundle_id = b.id) as n_slot,
          (select coalesce(jsonb_agg(bf.flavor_id order by bf.flavor_id), '[]'::jsonb)
             from bundle_flavors bf where bf.bundle_id = b.id) as flavor_ids
     from bundles b
     join po_batch_bundles pb on pb.bundle_id = b.id and pb.batch_id = $1 and pb.is_active
    where b.is_active
    order by b.sort_order limit 1`,
  [batchId],
);
const bund = bundel.rows[0];
console.log(`  paket: ${bund.name_id} (fixed=${bund.is_fixed}, slot=${bund.n_slot})`);

const stokAwal = await db.query(
  `select stock from po_batch_stock where batch_id = $1 limit 1`,
  [batchId],
);
console.log(`  stok awal: ${stokAwal.rows[0]?.stock}`);

p("1. PEMBELI MEMBUAT PESANAN (create_order, lewat anon key)");
// Paket terkunci: isi diambil dari flavor_ids, persis seperti OrderBundleModal.
const slots = bund.is_fixed
  ? (bund.flavor_ids ?? []).slice(0, bund.required_qty).map((f) => ({ flavor_id: Number(f) }))
  : Array.from({ length: bund.required_qty }, () => ({ flavor_id: 1 }));

const order = await rpc("create_order", {
  p_customer_name: "TEST STEVEN - Uji Alur",
  p_customer_email: null,
  p_instagram: "@teststeven",
  p_phone: "081234567890",
  p_payment_method: "transfer",
  p_delivery_method: "pickup",
  p_delivery_zone: pickupZone,
  p_address: null,
  p_address_note: null,
  p_lat: null,
  p_lng: null,
  p_transfer_method: null,
  p_payment_proof: null,
  p_note: "Pesanan uji otomatis. Boleh dihapus.",
  p_language: "id",
  p_items: [{ flavor_id: 1, quantity: 1 }],
  p_bundles: [{ bundle_id: Number(bund.id), slots }],
  p_user_id: null,
  p_po_batch_id: batchId,
  p_pickup_date: pickupDate,
});

if (!order.ok || !order.body) {
  console.log("  GAGAL create_order:", JSON.stringify(order.body));
  fail++;
} else {
  const kode = order.body.order_code ?? order.body;
  console.log(`  order_code: ${JSON.stringify(kode)}`);
  check("pesanan berhasil dibuat", Boolean(kode));

  p("2. STOK BERKURANG SESUAI ISI PESANAN");
  const stokAkhir = await db.query(
    `select stock from po_batch_stock where batch_id = $1 limit 1`,
    [batchId],
  );
  // 1 pcs satuan + jumlah slot paket terpakai.
  const terpakai = 1 + slots.length;
  const selisih = stokAwal.rows[0].stock - stokAkhir.rows[0].stock;
  check(
    `stok turun ${terpakai} pcs (${stokAwal.rows[0].stock} -> ${stokAkhir.rows[0].stock})`,
    selisih === terpakai,
    `selisih=${selisih}`,
  );

  p("3. PENJUAL MELIHAT PESANAN (data yang akan muncul di /admin/orders)");
  const kodeStr = typeof kode === "string" ? kode : kode.order_code;
  const o = await db.query(
    `select order_code, customer_name, phone, status, subtotal, delivery_fee,
            total_price, item_count, delivery_method, delivery_zone, po_batch_id,
            pickup_date::text as pickup_date, payment_method, created_at
       from orders where order_code = $1`,
    [kodeStr],
  );
  if (o.rows.length === 0) {
    check("pesanan tersimpan di tabel orders", false);
  } else {
    const row = o.rows[0];
    console.table([row]);
    check("status awal = pending", row.status === "pending", `status=${row.status}`);
    check("nama pembeli tersimpan", row.customer_name.includes("TEST STEVEN"));
    check("terikat ke batch PO", Number(row.po_batch_id) === batchId);
    // Dibaca sebagai teks di SQL (`::text`). Kalau kolom `date` dibiarkan apa
// adanya, driver pg mengubahnya jadi Date di zona waktu lokal Node —
// tanggalnya lalu terlihat bergeser sehari padahal isinya benar.
check(
      "tanggal ambil ikut tersimpan",
      row.pickup_date === pickupDate,
      `tersimpan=${row.pickup_date} dikirim=${pickupDate}`,
    );
    check(
      "total = subtotal + ongkir",
      Number(row.total_price) === Number(row.subtotal) + Number(row.delivery_fee),
      `${row.subtotal}+${row.delivery_fee} != ${row.total_price}`,
    );
  }

  p("4. PEMBELI LIHAT INVOICE (public_invoice, tanpa login)");
  const inv = await rpc("public_invoice", { p_code: kodeStr });
  check("public_invoice berhasil", inv.ok && Boolean(inv.body));
  if (inv.ok && inv.body) {
    console.log("  " + JSON.stringify(inv.body).slice(0, 400));
  }

  p("5. VALIDASI PENOLAKAN (pembeli tries hal yang tidak boleh)");
  const zonaNgawur = await rpc("create_order", {
    p_customer_name: "TEST STEVEN - Zona Ngawur",
    p_customer_email: null,
    p_instagram: null,
    p_phone: "081234567890",
    p_payment_method: "transfer",
    p_delivery_method: "delivery",
    p_delivery_zone: "zona-hantu-tidak-ada",
    p_address: "Alamat uji",
    p_address_note: null,
    p_lat: null,
    p_lng: null,
    p_transfer_method: null,
    p_payment_proof: null,
    p_note: null,
    p_language: "id",
    p_items: [{ flavor_id: 1, quantity: 1 }],
    p_bundles: [],
    p_user_id: null,
    p_po_batch_id: batchId,
    p_pickup_date: pickupDate,
  });
  check(
    "zona ngawur ditolak",
    !zonaNgawur.ok,
    `status=${zonaNgawur.status} ${JSON.stringify(zonaNgawur.body)}`,
  );

  const slotKurang = await rpc("create_order", {
    p_customer_name: "TEST STEVEN - Slot Kurang",
    p_customer_email: null,
    p_instagram: null,
    p_phone: "081234567890",
    p_payment_method: "transfer",
    p_delivery_method: "pickup",
    p_delivery_zone: pickupZone,
    p_address: null,
    p_address_note: null,
    p_lat: null,
    p_lng: null,
    p_transfer_method: null,
    p_payment_proof: null,
    p_note: null,
    p_language: "id",
    p_items: [],
    p_bundles: [{ bundle_id: Number(bund.id), slots: [{ flavor_id: 1 }] }],
    p_user_id: null,
    p_po_batch_id: batchId,
    p_pickup_date: pickupDate,
  });
  check(
    "paket dengan slot kurang ditolak",
    !slotKurang.ok,
    `status=${slotKurang.status} ${JSON.stringify(slotKurang.body)}`,
  );

  console.log(`\n  KODE PESANAN UJI: ${kodeStr}`);
}

await db.end();

console.log(`\n=== RINGKASAN ===\n  OK: ${pass}   GAGAL: ${fail}`);
process.exit(fail > 0 ? 1 : 0);