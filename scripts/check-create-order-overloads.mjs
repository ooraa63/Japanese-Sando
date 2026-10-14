// Read-only: hitung KETAT jumlah overload create_order di produksi.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const n = await c.query(
  `select count(*)::int as total from pg_proc where pronamespace='public'::regnamespace and proname='create_order'`
);
console.log("JUMLAH overload create_order:", n.rows[0].total);

const all = await c.query(`
  select p.oid,
         pg_get_function_identity_arguments(p.oid) as ident,
         length(p.prosrc) as body_len
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'create_order'
`);
console.log("baris dikembalikan:", all.rows.length);
for (const r of all.rows) {
  const nArgs = (r.ident.match(/,/g) || []).length + 1;
  console.log(`  oid=${r.oid} args=${nArgs} body=${r.body_len} ada_batch=${/p_po_batch_id/.test(r.ident)}`);
}

await c.end();