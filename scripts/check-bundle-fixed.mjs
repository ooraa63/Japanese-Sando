// READ-ONLY: apakah mode paket TERKUNCI (is_fixed) sudah benar-benar
// berfungsi end-to-end di produksi, atau hanya ada di UI.
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

judul("1. admin_list_bundles mengembalikan is_fixed?");
{
  const r = await c.query(`select prosrc from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='admin_list_bundles'`);
  const src = r.rows[0]?.prosrc ?? "";
  console.log("  menyebut is_fixed: " + src.includes("is_fixed"));
  const baris = src.split("\n").filter((l) => l.includes("is_fixed") || l.includes("jsonb_build_object"));
  baris.slice(0, 6).forEach((l) => console.log("    " + l.trim()));
}

judul("2. admin_save_bundle menerima + menyimpan is_fixed?");
{
  const r = await c.query(`select prosrc from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='admin_save_bundle'`);
  const src = r.rows[0]?.prosrc ?? "";
  console.log("  menyebut is_fixed: " + src.includes("is_fixed"));
  src.split("\n")
    .filter((l) => l.includes("is_fixed"))
    .forEach((l) => console.log("    " + l.trim()));
}

judul("3. create_order menerapkan harga paket / validasi slot?");
{
  const r = await c.query(`
    select p.pronargs, pg_get_function_arguments(p.oid) as args
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname='create_order'
  `);
  for (const row of r.rows) console.log("  create_order/" + row.pronargs + " (" + row.args + ")");
  const s = await c.query(`select prosrc from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname='create_order' order by pronargs desc limit 1`);
  const src = s.rows[0]?.prosrc ?? "";
  console.log("  -- bagian bundle --");
  src.split("\n")
    .filter((l) => /bundle|slot/i.test(l))
    .slice(0, 28)
    .forEach((l) => console.log("    " + l.trim()));
}

judul("4. Data bundle di produksi (ringkas)");
{
  const r = await c.query(`
    select b.id, b.name_id, b.price, b.required_qty, b.is_fixed,
           coalesce(array_agg(bf.flavor_id order by bf.flavor_id)
                    filter (where bf.flavor_id is not null), '{}') as flavor_ids
    from public.bundles b
    left join public.bundle_flavors bf on bf.bundle_id = b.id
    group by b.id order by b.id
  `);
  for (const b of r.rows) {
    console.log(
      "    id=" + b.id + "  " + JSON.stringify(b.name_id) +
      "  harga=" + b.price + "  qty=" + b.required_qty +
      "  is_fixed=" + b.is_fixed +
      "  rasa_diizinkan=" + JSON.stringify(b.flavor_ids),
    );
  }
}

await c.end();