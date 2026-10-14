// Tampilkan definisi LIVE is_admin() supaya tes migration-58 realistis.
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
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'is_admin'
`);
for (const row of r.rows) {
  console.log("=== " + row.proname + " ===");
  console.log(row.def);
}

const t = await c.query("select auth.uid()::text as uid, auth.role()::text as role");
console.log("");
console.log("konteks koneksi ini: uid=" + t.rows[0].uid + " role=" + t.rows[0].role);

await c.end();