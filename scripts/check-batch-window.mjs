import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(
  "select current_date::text as tanggal_db, now()::text as sekarang, current_setting('TimeZone') as zona_waktu",
);
console.log(JSON.stringify(r.rows[0], null, 1));

const b = await c.query(`
  select id, label,
         open_at::text  as buka,
         close_at::text as tutup,
         (current_date between open_at and close_at) as masih_buka_rpc
  from po_batches
  order by id
`);
console.table(b.rows);

await c.end();