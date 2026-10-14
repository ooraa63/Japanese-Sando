// Survei READ-ONLY untuk fitur ulasan: bucket storage, grant fungsi RPC,
// data ulasan yang ada, dan pola halaman admin.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log("=== 1. Bucket storage ===");
const b = await c.query(`
  select id, public, file_size_limit, allowed_mime_types
  from storage.buckets
  order by id
`);
console.table(b.rows);

console.log("");
console.log("=== 2. Grant pada fungsi review ===");
const g = await c.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args,
         coalesce(string_agg(r.role::text || '=' ||
           array_to_string(p.proacl, ',') , ' | '), '(proacl null)') as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join lateral unnest(coalesce(p.proacl, '{}')) as r(role) on true
  where n.nspname = 'public'
    and p.proname in ('list_reviews','submit_review','has_review','admin_list_announcements','admin_save_announcement','admin_delete_announcement')
  group by p.proname, p.pronargs, pg_get_function_identity_arguments(p.oid), p.proacl
  order by p.proname
`);
for (const r of g.rows) console.log(r.proname + "(" + r.args + ")  ->  " + r.acl);

console.log("");
console.log("=== 3. Data ulasan yang ada ===");
const rv = await c.query(`
  select r.id, r.customer_name, r.rating, r.is_visible,
         left(r.comment, 60) as cuplikan, o.order_code, o.status
  from public.order_reviews r
  join public.orders o on o.id = r.order_id
  order by r.created_at desc
`);
console.table(rv.rows);
console.log("total ulasan: " + rv.rows.length);

console.log("");
console.log("=== 4. Kolom tabel order_reviews sekarang ===");
const col = await c.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'order_reviews'
  order by ordinal_position
`);
console.table(col.rows);

console.log("");
console.log("=== 5. Contoh fungsi admin yang sudah ada (pola follows) ===");
const fn = await c.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'admin%'
  order by p.proname
`);
console.log(fn.rows.map((r) => r.proname + "(" + r.args + ")").join("\n"));

await c.end();