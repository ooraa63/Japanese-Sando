/**
 * Batalkan satu pesanan uji (status -> `rejected`) lewat RPC admin.
 *
 * Dipakai setelah menjalankan `uji-alur-po.mjs` supaya tidak meninggalkan
 * pesanan sungguhan di produksi. Stok otomatis kembali ke batch asal.
 * Pesanan TIDAK dihapus — jejaknya tetap kelihatan di /admin/orders.
 *
 *   node scripts/batalkan-pesanan.mjs RK-261017-105
 *   node scripts/batalkan-pesanan.mjs --semua
 *
 * `--semua` membatalkan SEMUA pesanan uji (nama pembeli diawali
 * "TEST STEVEN") yang belum ditolak. Hanya pesanan uji yang tersentuh;
 * pesanan asli akan dilewati dan namanya akan dicetak.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

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

const args = process.argv.slice(2);
const SEMUA = args.includes("--semua");
const kode = args.find((a) => !a.startsWith("--"));
if (!SEMUA && !kode) {
  console.error("Pakai: node scripts/batalkan-pesanan.mjs <KODE>  atau  --semua");
  process.exit(1);
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const auth = createClient(BASE, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: sesi, error: errLogin } = await auth.auth.signInWithPassword({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
if (errLogin || !sesi?.session) {
  console.error("Login admin gagal:", errLogin?.message);
  process.exit(1);
}
const token = sesi.session.access_token;

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const sql = SEMUA
  ? `select id, order_code, customer_name, status, stock_restored
       from orders where customer_name like 'TEST STEVEN%' order by created_at desc`
  : `select id, order_code, customer_name, status, stock_restored
       from orders where upper(order_code) = upper($1)`;
const { rows } = SEMUA
  ? await db.query(sql)
  : await db.query(sql, [kode]);

if (rows.length === 0) {
  console.log(`Tidak ada pesanan cocok${SEMUA ? " uji" : ` untuk ${kode}`}.`);
  await db.end();
  process.exit(0);
}
console.table(rows);

const stokSebelum = await db.query(`select batch_id, stock from po_batch_stock order by batch_id`);
console.log("stok sebelum:", JSON.stringify(stokSebelum.rows));

let batal = 0;
for (const o of rows) {
  if (!String(o.customer_name).startsWith("TEST STEVEN")) {
    console.log(`  LEWATI ${o.order_code}: "${o.customer_name}" bukan pesanan uji.`);
    continue;
  }
  if (o.status === "rejected") {
    console.log(`  lewati ${o.order_code}: sudah ditolak.`);
    continue;
  }
  const r = await fetch(`${BASE}/rest/v1/rpc/admin_update_order_status`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_order_id: o.id,
      p_new_status: "rejected",
      p_admin_note: "Pesanan uji otomatis dari audit alur. Dibatalkan, stok dikembalikan.",
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.ok) {
    batal++;
    console.log(`  OK    ${o.order_code} -> rejected`);
  } else {
    console.error(`  GAGAL ${o.order_code}: ${JSON.stringify(body)}`);
  }
}

const stokSesudah = await db.query(`select batch_id, stock from po_batch_stock order by batch_id`);
console.log("stok sesudah:", JSON.stringify(stokSesudah.rows));
const akhir = await db.query(`
  select order_code, status from orders
   where ${SEMUA ? `customer_name like 'TEST STEVEN%'` : `upper(order_code) = upper($1)`}
   order by created_at desc`, SEMUA ? [] : [kode]);
console.table(akhir.rows);

console.log(`\nDibatalkan: ${batal}. Pesanan tetap ada (tidak dihapus).`);
await db.end();