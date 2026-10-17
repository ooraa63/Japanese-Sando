/**
 * Bandingkan angka di `admin_dashboard_stats()` dengan hitungan langsung dari
 * tabel `orders`.
 *
 * Dipakai setelah chip "n pesanan menunggu persetujuan" di layar awal admin
 * terlihat tidak cocok dengan daftar pesanan yang belum selesai.
 *
 *   node scripts/cek-dashboard-stats.mjs
 */
import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const rpc = await c.query(`
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_dashboard_stats'
`);

console.log("Definisi admin_dashboard_stats():\n");
console.log(rpc.rows[0]?.def ?? "(tidak ditemukan)");

const pieces = (rpc.rows[0]?.def ?? "").match(/select count\(\*\)[^;]{0,400}/gi) ?? [];
console.log("\nPotongan perhitungan:");
for (const p of pieces) console.log("  " + p.replace(/\s+/g, " ").slice(0, 300));

console.log("\nHitungan langsung dari tabel orders:");
const langsung = await c.query(
  `select status, count(*)::int as n from public.orders group by status order by status`,
);
for (const r of langsung.rows) console.log("  " + String(r.status).padEnd(16) + " = " + r.n);

console.log("\nRincian pesanan yang dihitung pending:");
const rincian = await c.query(`
  select order_code, status, payment_method, qris_status, total_price, created_at
  from public.orders
  where status in ('pending','accepted','ready')
     or qris_status = 'pending'
  order by created_at desc
  limit 20
`);
for (const r of rincian.rows) {
  console.log(
    "  " + r.order_code + "  status=" + r.status +
    "  bayar=" + r.payment_method +
    "  qris=" + (r.qris_status ?? "-") +
    "  Rp " + Number(r.total_price ?? 0).toLocaleString("id-ID") +
    "  " + String(r.created_at).slice(0, 16),
  );
}
if (rincian.rows.length === 0) console.log("  (tidak ada)");

await c.end();