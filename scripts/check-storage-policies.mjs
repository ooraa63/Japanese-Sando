// READ-ONLY: kebijakan storage.objects yang aktif (pola untuk bucket baru).
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
  select policyname, cmd, qual, with_check, roles
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
  order by policyname
`);

for (const row of r.rows) {
  console.log("--- " + row.policyname);
  console.log("    cmd       : " + row.cmd);
  console.log("    roles     : " + (Array.isArray(row.roles) ? row.roles.join(", ") : row.roles));
  console.log("    qual      : " + row.qual);
  console.log("    with_check: " + row.with_check);
  console.log("");
}

await c.end();