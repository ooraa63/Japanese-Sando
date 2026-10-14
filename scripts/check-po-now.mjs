// Quick check: status batch PO aktif di database produksi.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log("=== Semua batch PO (termasuk nonaktif) ===");
const all = await c.query(`select id, label, open_at, close_at, pickup_date, is_active, current_date as hari_ini from po_batches order by pickup_date desc, id`);
console.table(all.rows);

console.log("\n=== Batch yang sedang 'buka' menurut RPC (is_active AND current_date BETWEEN open_at AND close_at) ===");
const active = await c.query(`select id, label, open_at, close_at, pickup_date, current_date as hari_ini from po_batches where is_active and current_date between open_at and close_at order by pickup_date`);
console.table(active.rows);

console.log("\n=== Hasil public_po_pickup_dates() (apa yang pembeli lihat) ===");
const r = await c.query(`select public_po_pickup_dates() as payload`);
console.log(JSON.stringify(r.rows[0].payload, null, 2));

console.log("\n=== Stok kategori (fallback mode lama) ===");
const k = await c.query(`select id, name_id, stock_enabled, stock from categories order by sort_order, id`);
console.table(k.rows);

await c.end();