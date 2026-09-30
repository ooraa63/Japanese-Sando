/**
 * Uji alur pre-order end-to-end terhadap Supabase memakai anon key,
 * persis seperti yang dilakukan website (tanpa login).
 *
 *   node scripts/test-flow.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}
loadEnv();

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

let pass = 0;
let fail = 0;

function check(name, ok, extra = "") {
  if (ok) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  GAGAL ${name} ${extra}`);
  }
}

async function rpc(name, args = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
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

async function rest(table, query = "") {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?${query}`, { headers });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

console.log("\n=== 1. Baca data publik (tanpa login) ===");
const flavors = await rest(
  "flavors",
  "select=id,slug,name_id,price,stock,is_active&order=sort_order"
);
check("daftar rasa terbaca publik", flavors.ok && flavors.body.length >= 5,
  JSON.stringify(flavors.body).slice(0, 200));
const settings = await rest("store_settings", "select=id,is_preorder_open,min_order&limit=1");
check("pengaturan toko terbaca", settings.ok && settings.body?.[0]?.id === 1);

console.log("\n=== 2. Validasi create_order menolak input buruk ===");
const anyOrder = await rest("orders", "select=id&limit=1");
check("pesanon TIDAK bisa dibaca anon (privat)", !anyOrder.ok || anyOrder.body.length === 0,
  `status=${anyOrder.status}`);

const bad = await rpc("create_order", {
  p_customer_name: "A",
  p_phone: "123",
  p_items: [],
});
check("nama terlalu pendek ditolak", !bad.ok && /invalid_name/.test(bad.body?.message ?? ""));

const badPhone = await rpc("create_order", {
  p_customer_name: "Budi Test",
  p_phone: "12345",
  p_items: [{ flavor_id: 1, quantity: 1 }],
});
check("telepon tidak valid ditolak", !badPhone.ok && /invalid_phone/.test(badPhone.body?.message ?? ""));

const empty = await rpc("create_order", {
  p_customer_name: "Budi Test",
  p_phone: "081234567890",
  p_items: [],
});
check("keranjang kosong ditolak", !empty.ok && /empty_cart/.test(empty.body?.message ?? ""));

const noProof = await rpc("create_order", {
  p_customer_name: "Budi Test",
  p_phone: "081234567890",
  p_payment_method: "transfer",
  p_items: [{ flavor_id: 1, quantity: 1 }],
});
check("transfer tanpa bukti ditolak", !noProof.ok && /proof_required/.test(noProof.body?.message ?? ""));

const tooMuch = await rpc("create_order", {
  p_customer_name: "Budi Test",
  p_phone: "081234567890",
  p_payment_method: "cash",
  p_items: [{ flavor_id: 1, quantity: 9999 }],
});
check("jumlah melebihi batas ditolak", !tooMuch.ok && /invalid_quantity/.test(tooMuch.body?.message ?? ""));

const fakePrice = await rpc("create_order", {
  p_customer_name: "Budi Test",
  p_phone: "081234567890",
  p_payment_method: "cash",
  // coba kirim harga palsu â€” server harus mengabaikannya
  p_items: [{ flavor_id: 1, quantity: 2, price: 1, unit_price: 1 }],
});
check("harga palsu diabaikan server (harga asli dipakai)",
  fakePrice.ok && fakePrice.body.total_price > 1000,
  JSON.stringify(fakePrice.body));

console.log("\n=== 3. Pesanan COD berhasil dibuat ===");
const stockBefore = (await rest("flavors", "select=id,stock&id=eq.1&limit=1")).body[0].stock;
const created = await rpc("create_order", {
  p_customer_name: "Budi Santoso",
  p_phone: "081234567890",
  p_payment_method: "cash",
  p_delivery_method: "pickup",
  p_note: "Tanpa kemasain, terima kasih",
  p_language: "id",
  p_items: [{ flavor_id: 1, quantity: 2 }],
});
check("pesanan COD berhasil dibuat", created.ok && Boolean(created.body?.order_code),
  JSON.stringify(created.body));
console.log(`       kode pesanan: ${created.body?.order_code}`);
console.log(`       total: Rp${created.body?.total_price}`);

const stockAfter = (await rest("flavors", "select=id,stock&id=eq.1&limit=1")).body[0].stock;
check(`stok berkurang 2 (${stockBefore} -> ${stockAfter})`, stockAfter === stockBefore - 2);

console.log("\n=== 4. Lacak pesanan (kode + telepon) ===");
const tracked = await rpc("track_order", {
  p_code: created.body?.order_code,
  p_phone: "081234567890",
});
check("pesanan bisa dilacak dengan kode + telepon",
  tracked.ok && tracked.body?.order_code === created.body?.order_code);
check("detail item ikut dikembalikan", (tracked.body?.items?.length ?? 0) === 1);
check("total pesanan konsisten",
  tracked.body?.total_price === created.body?.total_price,
  `${tracked.body?.total_price} vs ${created.body?.total_price}`);

const wrongPhone = await rpc("track_order", {
  p_code: created.body?.order_code,
  p_phone: "089999999999",
});
check("telepon salah tidak bisa melihat pesanan", wrongPhone.body === null);

console.log("\n=== 5. Otorisasi admin ditolak untuk anon ===");
const anonList = await rpc("admin_list_orders", {});
check("anon tidak bisa daftar pesanan", !anonList.ok && /not_authorized/.test(anonList.body?.message ?? ""));

const anonStatus = await rpc("admin_update_order_status", {
  p_order_id: 1,
  p_new_status: "accepted",
});
check("anon tidak bisa ubah status", !anonStatus.ok && /not_authorized/.test(anonStatus.body?.message ?? ""));

const anonSettings = await rpc("admin_save_settings", { p_payload: { store_name: "Dibobol" } });
check("anon tidak bisa ubah pengaturan", !anonSettings.ok && /not_authorized/.test(anonSettings.body?.message ?? ""));

const anonStats = await rpc("admin_dashboard_stats", {});
check("anon tidak bisa baca statistik", !anonStats.ok && /not_authorized/.test(anonStats.body?.message ?? ""));

console.log("\n=== 6. Normalisasi nomor telepon ===");
const idPhone = await rpc("track_order", {
  p_code: created.body?.order_code,
  p_phone: "081234567890",
});
check("format 08xx tetap cocok", idPhone.body?.order_code === created.body?.order_code);
const intlPhone = await rpc("track_order", {
  p_code: created.body?.order_code,
  p_phone: "6281234567890",
});
check("format 62xx juga cocok", intlPhone.body?.order_code === created.body?.order_code);

console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`  Pesanan tes: ${created.body?.order_code}`);
console.log(`${"=".repeat(46)}\n`);

process.exit(fail > 0 ? 1 : 0);
