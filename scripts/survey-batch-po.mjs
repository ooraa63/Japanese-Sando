// Skema batch PO untuk menyusun uji create_order (READ-ONLY).
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

for (const t of ["po_batches", "po_batch_stock", "po_batch_flavors"]) {
  console.log("=== " + t + " ===");
  const r = await c.query(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema='public' and table_name=$1 order by ordinal_position`,
    [t]
  );
  for (const x of r.rows) {
    console.log("   " + x.column_name.padEnd(24) + x.data_type.padEnd(16) +
      (x.is_nullable === "NO" ? "NOT NULL " : "") + (x.column_default ?? ""));
  }
  const d = await c.query(`select * from public.` + t + ` order by 1 desc limit 3`);
  console.log("   contoh:");
  for (const x of d.rows) console.log("     " + JSON.stringify(x));
}

console.log("");
console.log("=== store_settings: preorder + batch ===");
const s = await c.query("select is_preorder_open from public.store_settings where id = 1");
console.log("   " + JSON.stringify(s.rows[0]));

console.log("");
console.log("=== admins ===");
const a = await c.query(`select user_id::text as u, role from public.admins where is_active limit 3`);
console.log("   " + JSON.stringify(a.rows));

console.log("");
console.log("=== kategori + stok ===");
const k = await c.query(
  `select id, name_id, stock_enabled, stock from public.categories order by id`
);
for (const x of k.rows) console.log("   " + JSON.stringify(x));

await c.end();