// Survei lanjutan (READ-ONLY): `bundle_items`, `is_fixed`, tier, dan setting.
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

const judul = (s) => {
  console.log("");
  console.log("=== " + s + " ===");
};

judul("A. bundle_items: kolom");
const bi = await c.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'bundle_items'
  order by ordinal_position
`);
for (const r of bi.rows) {
  console.log("    " + r.column_name.padEnd(26) + r.data_type.padEnd(18) + (r.is_nullable === "NO" ? "NOT NULL" : ""));
}
if (bi.rows.length === 0) console.log("    (tabel tidak ada di information_schema)");

judul("B. bundle_items: constraint");
try {
  const cons = await c.query(`
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint where conrelid = 'public.bundle_items'::regclass
    order by conname
  `);
  for (const r of cons.rows) console.log("    " + r.conname + ": " + r.def);
  const idx = await c.query(`select indexdef from pg_indexes where schemaname='public' and tablename='bundle_items'`);
  for (const r of idx.rows) console.log("    IDX " + r.indexdef);
} catch (e) {
  console.log("    error: " + e.message);
}

judul("C. bundle_items: isi");
try {
  const rows = await c.query(`select * from public.bundle_items order by 1, 2 limit 60`);
  console.log("    jumlah: " + rows.rows.length);
  for (const r of rows.rows) console.log("    " + JSON.stringify(r));
} catch (e) {
  console.log("    error: " + e.message);
}

judul("D. bundles: is_fixed & kolom lengkap");
try {
  const b = await c.query(`select * from public.bundles order by id`);
  for (const r of b.rows) console.log("    " + JSON.stringify(r, null, 2).replace(/\n/g, "\n    "));
} catch (e) {
  console.log("    error: " + e.message);
}

judul("E. po_batch_bundles");
try {
  const p = await c.query(`select * from public.po_batch_bundles order by 1, 2 limit 30`);
  for (const r of p.rows) console.log("    " + JSON.stringify(r));
} catch (e) {
  console.log("    error: " + e.message);
}

judul("F. store_settings: kolom bundle");
const st = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_schema='public' and table_name='store_settings' and column_name like '%bundle%'
  order by column_name
`);
for (const r of st.rows) console.log("    " + r.column_name + " : " + r.data_type);

judul("G. Definisi RPC tier (live, dari pg_proc)");
for (const nama of ["public_bundle_tiers", "pick_bundles", "pick_bundle_tier", "calc_bundle_price"]) {
  const r = await c.query(
    `select prosrc from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
     where ns.nspname='public' and p.proname=$1 order by p.pronargs limit 1`,
    [nama],
  );
  if (r.rows.length === 0) {
    console.log("  --- " + nama + ": tidak ada ---");
    continue;
  }
  console.log("  --- " + nama + " ---");
  console.log(
    r.rows[0].prosrc
      .split("\n")
      .map((l) => "    " + l)
      .join("\n"),
  );
}

judul("H. Type data custom yang menyebut bundle/tier");
const types = await c.query(`
  select t.typname, pg_get_constraintdef(co.oid) as def
  from pg_type t
  left join pg_constraint co on co.contypid = t.oid
  where t.typnamespace = 'public'::regnamespace and t.typtype in ('c','d')
    and (t.typname like '%bundle%' or t.typname like '%tier%')
  order by t.typname
`);
for (const r of types.rows) console.log("    " + r.typname + (r.def ? " :: " + r.def : ""));

await c.end();