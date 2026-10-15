// Read-only: daftar order terbaru untuk memastikan tidak ada baris uji/sampah
// yang tertinggal setelah skrip test.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(`
  select id, order_code, customer_name, phone_normalized, status,
         delivery_method, payment_method, total_price, created_at
  from public.orders
  order by created_at desc, id desc
  limit 10
`);
for (const o of r.rows) {
  console.log(
    String(o.id).padStart(4) + "  " + String(o.order_code).padEnd(18) +
    String(o.customer_name).padEnd(16) + String(o.status).padEnd(12) +
    String(o.delivery_method).padEnd(9) + String(o.payment_method).padEnd(10) +
    String(o.total_price).padStart(8) + "  " + String(o.created_at).slice(0, 16)
  );
}

await c.end();