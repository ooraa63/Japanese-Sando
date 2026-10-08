/**
 * Panggil RPC `expire_stale_qris_orders()` langsung ke database.
 *   node scripts/run-qris-expire.js
 *
 * Aman dipanggil: fungsi hanya menyentuh order yang SUDAH lewat masa berlaku
 * (`qris_expires_at < now()`) dan belum dibayar. Kalau tidak ada order
 * seperti itu, hasilnya 0 dan tidak ada yang berubah.
 *
 * Dipakai untuk memastikan job pg_cron `qris-expire` benar-benar bekerja,
 * tanpa harus menunggu satu menit.
 */
const { Client } = require("pg");

function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows: before } = await c.query(
    `select coalesce(sum(stock), 0)::int as total from public.categories`
  );
  const { rows: eligible } = await c.query(
    `select count(*)::int as n
       from public.orders
      where payment_method = 'qris_midtrans'
        and qris_status = 'pending'
        and qris_expires_at is not null
        and qris_expires_at < now()
        and status not in ('rejected','cancelled')
        and stock_restored = false`
  );

  console.log(`Order QRIS yang sudah expired & belum dibayar: ${eligible[0].n}`);
  console.log(`Total stok kategori SEBELUM: ${before[0].total}`);

  const { rows: out } = await c.query(`select public.expire_stale_qris_orders() as restored`);
  console.log(`RPC expire_stale_qris_orders() mengembalikan: ${out[0].restored}`);

  const { rows: after } = await c.query(
    `select coalesce(sum(stock), 0)::int as total from public.categories`
  );
  console.log(`Total stok kategori SESUDAH: ${after[0].total}`);
  console.log(
    after[0].total === before[0].total
      ? "✅ Stok tidak berubah (tidak ada yang perlu di-restock)"
      : `⚠️  Stok bertambah ${after[0].total - before[0].total} (order expired di-restore)`
  );

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});