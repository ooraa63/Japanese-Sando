// Cek cepat: status stok kategori, flavor, dan order QRIS yang menggantung.
// Jalankan: node scripts/check-stock.mjs
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

// pbk atau pbk-cli dengan --project untuk project postgres default
for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const q = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(`\n=== ${label} ===`);
  console.table(rows);
};

await q("Kategori (stok)", `select id, name_id, stock_enabled, stock from categories order by sort_order, id`);
await q(
  "Order QRIS gantung (pending & sudah lewat expiry)",
  `select id, order_code, qris_status, status, qris_expires_at,
          now() as now, (qris_expires_at < now()) as lewat
     from orders
    where payment_method = 'qris_midtrans' and qris_status = 'pending'
    order by created_at desc limit 10`
);
await q("Kolom bundles", `select column_name from information_schema.columns where table_name='bundles' and column_name='compare_price'`);

await client.end();