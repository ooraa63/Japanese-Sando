// Survei keamanan tabel bundle (READ-ONLY): RLS, policy, grant, volatility RPC.
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

console.log("=== A. RLS + policy tabel bundle ===");
for (const t of ["bundles", "bundle_flavors", "bundle_items", "po_batch_bundles"]) {
  const rls = await c.query(
    `select relrowsecurity, relforcerowsecurity
     from pg_class where oid = to_regclass('public.' || $1)`,
    [t],
  );
  console.log("  " + t + ": RLS=" + rls.rows[0].relrowsecurity + " FORCE=" + rls.rows[0].relforcerowsecurity);
  const pol = await c.query(
    `select policyname, cmd, roles::text, qual, with_check
     from pg_policies where schemaname='public' and tablename=$1 order by policyname`,
    [t],
  );
  if (pol.rows.length === 0) console.log("      (tanpa policy)");
  for (const p of pol.rows) {
    console.log("      " + p.policyname + " | " + p.cmd + " | " + p.roles);
    console.log("        using=" + (p.qual ?? "(null)"));
    console.log("        check=" + (p.with_check ?? "(null)"));
  }
}

console.log("");
console.log("=== B. Grant di tabel bundle ===");
const gr = await c.query(`
  select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema='public' and table_name like 'bundle%'
  group by table_name, grantee order by table_name, grantee
`);
for (const r of gr.rows) console.log("  " + r.table_name + " -> " + r.grantee + " : " + r.privs);

console.log("");
console.log("=== C. Sifat RPC bundle (security + volatility) ===");
const fn = await c.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosecdef,
         case p.provolatile when 'v' then 'volatile' when 's' then 'stable' else 'immutable' end as volatil,
         p.prolang::regtype::text as lang,
         l.lanname
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  left join pg_language l on l.oid = p.prolang
  where ns.nspname='public'
    and p.proname in ('public_menu','admin_save_bundle','admin_list_bundles','admin_delete_bundle','create_order')
  order by p.proname
`);
for (const r of fn.rows) {
  console.log(
    "  " + r.proname + "(" + r.args + ") secdef=" + r.prosecdef +
    " volatil=" + r.volatil + " lang=" + r.lanname
  );
}

console.log("");
console.log("=== D. Default privileges schema public ===");
const dp = await c.query(`
  select defaclrole::regrole::text as owner, defaclobjtype, array_to_string(defaclacl, ' | ') as acl
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname='public'
`);
for (const r of dp.rows) console.log("  owner=" + r.owner + " type=" + r.defaclobjtype + " acl=" + r.acl);
if (dp.rows.length === 0) console.log("  (tidak ada default ACL)");

console.log("");
console.log("=== E. Pola DECLARE/CREATE di migration-58 (create or replace) ===");
const fsr = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-58.sql"), "utf8");
const hits = fsr.split("\n").filter((l) => /create\s+(or\s+replace\s+)?function|^\s*language\s|security\s+definer|set\s+search_path/i.test(l));
for (const h of hits.slice(0, 30)) console.log("  " + h.trim());

await c.end();