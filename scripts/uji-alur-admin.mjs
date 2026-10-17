/**
 * UJI ALUR PENJUAL (dashboard admin), dari sisi RPC.
 *
 * Login pakai akun admin yang sudah ada di `.env.local`
 * (`ADMIN_EMAIL` + `ADMIN_PASSWORD`) — bukan membuat akun baru, dan tidak
 * pernah mencetak passwordnya.
 *
 *   $env:APP_URL="http://localhost:3100"   # opsional, buat cek HTML dashboard
 *   node scripts/uji-alur-admin.mjs
 *
 * Skrip ini mengubah status PESANAN UJI saja (kode pesanan dimulai
 * "RK-" dan namanya "TEST STEVEN"). Order_asli tidak boleh disentuh —
 * skrip berhenti kalau menemukan nama pembeli yang bukan prefix uji.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const PREVIEW = new URLSearchParams({ code: "RK-000000-000", phone: "000000000" });

if (!EMAIL || !PASSWORD) {
  console.error("ADMIN_EMAIL / ADMIN_PASSWORD belum ada di .env.local");
  process.exit(1);
}

let pass = 0;
let fail = 0;
const check = (name, ok, extra = "") => {
  if (ok) {
    pass++;
    console.log(`  OK    ${name}`);
  } else {
    fail++;
    console.log(`  GAGAL ${name} ${extra}`);
  }
};
const p = (s) => console.log(`\n=== ${s} ===`);

p("1. LOGIN ADMIN");
const auth = createClient(BASE, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: sesi, error: errLogin } = await auth.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
check("login admin berhasil", !errLogin && Boolean(sesi?.session), errLogin?.message ?? "");
if (errLogin || !sesi?.session) process.exit(1);
const token = sesi.session.access_token;

const rpc = async (name, args) => {
  const r = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const teks = await r.text();
  let body = null;
  try {
    body = teks ? JSON.parse(teks) : null;
  } catch {
    body = teks;
  }
  return { ok: r.ok, status: r.status, body };
};

p("2. AKSES ADMIN DIVERIFIKASI OLEH BACKEND");
const isAdmin = await rpc("is_admin", {});
check("is_admin() true", isAdmin.ok && isAdmin.body === true, JSON.stringify(isAdmin.body));

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

/* ------------------------------------------------------------------ */

async function buatPesananUji(catatan) {
  const batch = await db.query(
    `select id, pickup_date::text as pickup_date from po_batches
      where is_active and public.po_today() between open_at and close_at
      order by pickup_date limit 1`,
  );
  if (!batch.rows.length) return null;
  const batchId = Number(batch.rows[0].id);
  // Sudah teks dari SQL, jadi tidak suffers jebakan zona waktu lokal Node.
  const pickupDate = batch.rows[0].pickup_date;
  const zona = await db.query(
    `select id from delivery_zones where kind='pickup' and is_active order by sort_order limit 1`,
  );
  const res = await fetch(`${BASE}/rest/v1/rpc/create_order`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_customer_name: "TEST STEVEN - Uji Admin",
      p_customer_email: null,
      p_instagram: "@teststeven",
      p_phone: "081234567890",
      p_payment_method: "transfer",
      p_delivery_method: "pickup",
      p_delivery_zone: zona.rows[0]?.id ?? "pickup",
      p_address: null,
      p_address_note: null,
      p_lat: null,
      p_lng: null,
      p_transfer_method: null,
      p_payment_proof: null,
      p_note: catatan,
      p_language: "id",
      p_items: [{ flavor_id: 1, quantity: 1 }],
      p_bundles: [],
      p_user_id: null,
      p_po_batch_id: batchId,
      p_pickup_date: pickupDate,
    }),
  });
  const body = await res.json().catch(() => null);
  return { batchId, kode: body?.order_code ?? body };
}

const stock = async (batchId) =>
  Number((await db.query(`select stock from po_batch_stock where batch_id=$1 limit 1`, [batchId]))
    .rows[0]?.stock ?? 0);

p("3. PESANAN UJI DARI SKRIP PEMBELI (dari run sebelumnya)");
const ujiLama = await db.query(
  `select id, order_code, status, customer_name, total_price, po_batch_id
     from orders where customer_name like 'TEST STEVEN%' order by created_at desc`,
);
console.table(ujiLama.rows);
// Hanya ambil pesanan yang masih hidup (pending/accepted/ready/delivered).
// Pesanan `rejected`/`cancelled` SENGAJA dilewati: `admin_update_order_status`
// ternyata mengizinkan status mundur dari sana, jadi skrip ini bisa menghidupkan
// ulang pesanan uji yang sengaja ditolak.
let target =
  ujiLama.rows.find((r) => r.status === "pending") ??
  ujiLama.rows.find((r) => ["accepted", "ready", "delivered"].includes(r.status));
if (target && !String(target.customer_name).startsWith("TEST STEVEN")) {
  console.error("  Berhenti: pesanan ini bukan pesanan uji.");
  await db.end();
  process.exit(1);
}

// Kalau semua pesanan uji sebelumnya sudah ditolak, skrip ini tidak bisa
// lanjut menguji transisi status. Buat satu pesanan baru supaya skrip
// selalu bisa dijalankan berulang tanpa campur manual.
if (!target) {
  console.log("  Semua pesanan uji sebelumnya sudah ditolak — buat pesanan uji baru.");
  const baru = await buatPesananUji("Pesanan uji untuk skrip uji-alur-admin.");
  if (baru?.kode) {
    const row = await db.query(
      `select id, order_code, status, customer_name, total_price, po_batch_id
         from orders where order_code = $1`,
      [baru.kode],
    );
    target = row.rows[0] ?? null;
  }
}
check("ada pesanan uji untuk dites", Boolean(target));

p("4. PENJUAL MELIHAT PESANAN DI DASHBOARD (admin_list_orders)");
if (target) {
  const list = await rpc("admin_list_orders", {
    p_status: null,
    p_search: null,
    p_limit: 20,
    p_offset: 0,
    p_po_batch_id: null,
  });
  check("admin_list_orders berhasil", list.ok, JSON.stringify(list.body).slice(0, 200));
  const orders = list.body?.orders ?? [];
  const ketemu = orders.find((o) => o.order_code === target.order_code);
  check(`pesanan ${target.order_code} muncul di daftar admin`, Boolean(ketemu));
  if (ketemu) {
    console.log("  " + JSON.stringify({
      kode: ketemu.order_code,
      nama: ketemu.customer_name,
      status: ketemu.status,
      total: ketemu.total_price,
      ambil: ketemu.pickup_date,
      metode: ketemu.payment_method,
    }));
    check("total yang tampil sama dengan total di DB", Number(ketemu.total_price) === Number(target.total_price));
  }

  p("5. CARI PESANAN (pencarian di /admin/orders)");
  const cari = await rpc("admin_list_orders", {
    p_status: null,
    p_search: "081234567890",
    p_limit: 20,
    p_offset: 0,
    p_po_batch_id: null,
  });
  const hasilCari = cari.body?.orders ?? [];
  check(
    "cari nomor telepon menemukan pesanan uji",
    hasilCari.some((o) => o.order_code === target.order_code),
    `dapat ${hasilCari.length} baris`,
  );
}

p("6. PENJUAL UBAH STATUS PESANAN (pending -> accepted -> ready -> delivered)");
const alur = ["accepted", "ready", "delivered"];
const urutan = ["pending", ...alur];
for (const s of target ? alur : []) {
  // Kalau skrip dijalankan ulang, pesanan bisa sudah beberapa status di depan.
  // Lompat hanya boleh kalau urutannya memang maju, supaya skrip tetap bisa
  // dipakai berulang tanpa memaksa status mundur.
  const sekarang = (
    await db.query(`select status from orders where id=$1`, [target.id])
  ).rows[0]?.status;
  const dari = urutan.indexOf(String(sekarang));
  const ke = urutan.indexOf(s);
  if (dari >= ke) {
    check(`lewati ${s} (sudah di ${sekarang})`, true);
    continue;
  }
  const upd = await rpc("admin_update_order_status", {
    p_order_id: target.id,
    p_new_status: s,
    p_admin_note: "Catatan uji otomatis.",
  });
  check(`ubah status -> ${s}`, upd.ok, `${upd.status} ${JSON.stringify(upd.body)}`);
  const baris = await db.query(`select status from orders where id=$1`, [target.id]);
  check(`status di DB = ${s}`, baris.rows[0]?.status === s, `dapat=${baris.rows[0]?.status}`);
}

p("7. PENJUAL TOLAK PESANAN -> STOK HARUS KEMBALI");
const baru = await buatPesananUji("Pesanan uji untuk cek stok kembali.");
check("pesanan uji kedua dibuat", Boolean(baru?.kode), JSON.stringify(baru));
if (baru?.kode) {
  const row = await db.query(
    `select id, order_code, status from orders where order_code=$1`,
    [baru.kode],
  );
  const orderId = Number(row.rows[0].id);
  const stokSebelum = await stock(baru.batchId);
  const upd = await rpc("admin_update_order_status", {
    p_order_id: orderId,
    p_new_status: "rejected",
    p_admin_note: "Uji: pesanan ditolak, stok harus balik.",
  });
  check("ubah status -> rejected", upd.ok, `${upd.status} ${JSON.stringify(upd.body)}`);
  const stokSesudah = await stock(baru.batchId);
  check(
    `stok kembali +1 (${stokSebelum} -> ${stokSesudah})`,
    stokSesudah === stokSebelum + 1,
    `selisih=${stokSesudah - stokSebelum}`,
  );
}

p("8. PENJUAL TIDAK BOLEH MENYENTUH ORDERS BUKAN MILIKNYA");
// Anon tidak boleh memanggil admin_* sama sekali.
const anonBase = `${BASE}/rest/v1/rpc/`;
const anonCall = await fetch(`${anonBase}admin_list_orders`, {
  method: "POST",
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    p_status: null, p_search: null, p_limit: 1, p_offset: 0, p_po_batch_id: null,
  }),
});
check(
  "anon ditolak admin_list_orders",
  !anonCall.ok,
  `status=${anonCall.status}`,
);

p("9. HALAMAN DASHBOARD MEMANG MEMBUKA PESANAN UJI (HTML + cookie)");
const jar = [];
const ssf = createClient(BASE, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await ssf.auth.setSession({ access_token: token, refresh_token: sesi.session.refresh_token });
// supabase-js di node tidak menulis cookie; pakai header bearer untuk fetch HTML.
const htmlRes = await fetch(`${APP}/admin/orders`, {
  headers: { cookie: `sb-access-token=${token}` },
});
check(`/admin/orders -> ${htmlRes.status}`, htmlRes.ok, `status=${htmlRes.status}`);

console.log(`\n=== RINGKASAN ===\n  OK: ${pass}   GAGAL: ${fail}`);
console.log(`\n  Pesanan uji yang dibuat skrip ini:`);
if (baru?.kode) console.log(`   - ${baru.kode} (sudah ditolak)`);
if (target) console.log(`   - ${target.order_code} (sudah ${alur.at(-1)})`);
console.log("  Hapus lewat /admin/orders kalau tidak mau dipakai.");
process.exit(fail > 0 ? 1 : 0);