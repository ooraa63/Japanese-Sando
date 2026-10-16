// Baca create_order yang TERPASANG di produksi + jumlah baris store_settings.
// READ-ONLY. Menebooksolusi error `orders_delivery_zone_check`.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const n = await c.query("select count(*)::int as n from public.store_settings");
console.log("baris store_settings = " + n.rows[0].n);

const kinds = await c.query(
  "select id, kind from public.store_settings, jsonb_array_elements(delivery_zones) z where true"
).catch(() => null);
if (kinds) console.log(kinds.rows);

const r = await c.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as argumen,
         p.prosrc
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('create_order', 'admin_save_delivery_zone', 'save_delivery_zone')
  order by p.proname, argumen
`);
for (const row of r.rows) {
  console.log("");
  console.log("=".repeat(70));
  console.log("FUNGSI: " + row.proname + "(" + row.argumen + ")");
  console.log("=".repeat(70));
  console.log(row.prosrc);
}

await c.end();