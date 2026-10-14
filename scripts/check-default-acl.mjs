// Kenapa anon punya EXECUTE pada fungsi admin? Cek default privileges.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const d = await c.query(`
  select pg_get_userbyid(d.defaclrole) as pemilik, d.defaclobjtype as jenis, d.defaclacl::text as acl
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public'
`);
console.log("=== default ACL di schema public ===");
console.table(d.rows);

const one = await c.query(`
  select p.proacl::text as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_delete_faq'
`);
console.log("");
console.log("contoh fungsi admin lama (admin_delete_faq) proacl:");
console.log(one.rows[0]?.acl);

const two = await c.query(`
  select has_function_privilege('anon', 'public.admin_delete_faq(bigint)', 'EXECUTE') as anon_boleh
`);
console.log("anon boleh admin_delete_faq yang LAMA: " + two.rows[0].anon_boleh);

await c.end();