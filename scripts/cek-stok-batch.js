// READ-ONLY: cek stok tiap batch PO + status pesanan uji.
//   node scripts/cek-stok-batch.js
// Dipakai setelah menjalankan `uji-alur-po.mjs` / `uji-alur-admin.mjs` supaya
// stok batch benar-benar kembali seperti semula.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const b = await c.query(
    `select b.id, b.label,
            b.open_at::text, b.close_at::text, b.pickup_date::text,
            coalesce(sum(s.stock), 0)::int as stok,
            (public.po_today() between b.open_at and b.close_at) as jendela_terbuka,
            (b.pickup_date >= public.po_today()) as tanggal_aman,
            (public.po_today() between b.open_at and b.close_at
               and b.pickup_date >= public.po_today()) as bisa_dipesan
       from public.po_batches b
       left join public.po_batch_stock s on s.batch_id = b.id
      where b.is_active
      group by b.id, b.label, b.open_at, b.close_at, b.pickup_date
      order by b.id`,
  );
  console.log("== BATCH PO AKTIF ==");
  console.log(JSON.stringify(b.rows, null, 2));
  const o = await c.query(
    `select status, count(*)::int as jumlah
       from public.orders
      where customer_name like 'TEST STEVEN%'
      group by status order by status`,
  );
  console.log("\n== PESANAN UJI ==");
  console.log(o.rows.length ? JSON.stringify(o.rows) : "tidak ada");
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});