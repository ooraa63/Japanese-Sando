// Survei READ-ONLY: model bundle di produksi.
//
// Belum ada perubahan - ini pengumpulan data supaya keputusan desain
// (paket terkunci vs paket berkelompok pilihan) didasarkan pada skema yang
// BENAR-BENAR dipakai produksi, bukan pada ingatan.
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

judul("1. Tabel & kolom bundle");
const tabel = await c.query(`
  select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('bundles', 'bundle_flavors', 'bundle_slots')
  order by table_name, ordinal_position
`);
if (tabel.rows.length === 0) {
  console.log("  (tidak ada tabel bundles/bundle_flavors/bundle_slots)");
} else {
  let last = "";
  for (const r of tabel.rows) {
    if (r.table_name !== last) {
      console.log("  " + r.table_name);
      last = r.table_name;
    }
    console.log("    " + r.column_name.padEnd(26) + r.data_type.padEnd(16) + (r.is_nullable === "NO" ? "NOT NULL" : ""));
  }
}

judul("2. Semua tabel yang menyebut bundle");
const semua = await c.query(`
  select table_name from information_schema.columns
  where table_schema = 'public' and column_name like '%bundle%'
  group by table_name order by table_name
`);
console.log("  " + semua.rows.map((r) => r.table_name).join(", "));

judul("3. Data bundle di produksi");
try {
  const bund = await c.query(`
    select * from public.bundles order by id
  `);
  console.log("  jumlah bundle: " + bund.rows.length);
  for (const b of bund.rows) {
    console.log(
      "    id=" + b.id +
      "  nama=" + JSON.stringify(b.name_id) +
      "  category_id=" + b.category_id +
      "  price=" + b.price +
      "  required_qty=" + b.required_qty +
      "  aktif=" + (b.is_active ?? "?") +
      (b.compare_price ? "  compare=" + b.compare_price : "") +
      (b.badge ? "  badge=" + JSON.stringify(b.badge) : ""),
    );
  }
} catch (e) {
  console.log("  error: " + e.message);
}

judul("4. Isi bundle (slot wajib per bundle)");
try {
  const isi = await c.query(`
    select bf.bundle_id, bf.flavor_id, bf.slot, f.name_id, f.price
    from public.bundle_flavors bf
    join public.flavors f on f.id = bf.flavor_id
    order by bf.bundle_id, bf.slot, bf.flavor_id
    limit 40
  `);
  console.log("  jumlah baris bundle_flavors: " + isi.rows.length + " (ditampilkan maks 40)");
  for (const r of isi.rows) {
    console.log(
      "    bundle=" + r.bundle_id +
      "  slot=" + r.slot +
      "  flavor=" + r.flavor_id +
      "  " + JSON.stringify(r.name_id) +
      "  Rp" + r.price,
    );
  }
} catch (e) {
  console.log("  error: " + e.message);
}

judul("5. Constraint & index bundle_flavors");
try {
  const cons = await c.query(`
    select con.conname, pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    where con.conrelid = 'public.bundle_flavors'::regclass
    order by con.conname
  `);
  for (const c2 of cons.rows) console.log("    " + c2.conname + ": " + c2.def);
} catch (e) {
  console.log("  error: " + e.message);
}

judul("6. RPC yang menyebut bundle");
const rpc = await c.query(`
  select p.proname, p.pronargs,
         pg_get_function_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname like '%bundle%'
  order by p.proname
`);
if (rpc.rows.length === 0) console.log("  (tidak ada)");
for (const r of rpc.rows) {
  console.log("    " + r.proname + "/" + r.pronargs + "  (" + r.args + ")");
}

judul("7. Flavor: kategori + harga (konteks harga 18000 vs 22000)");
const fl = await c.query(`
  select f.id, f.name_id, f.price, f.category_id, c.name_id as kategori, f.is_active
  from public.flavors f
  left join public.categories c on c.id = f.category_id
  order by f.category_id nulls last, f.id
  limit 30
`);
for (const r of fl.rows) {
  console.log(
    "    " + String(r.id).padStart(3) +
    "  Rp" + String(r.price).padStart(6) +
    "  cat=" + String(r.category_id).padStart(3) +
    "  " + JSON.stringify(r.kategori ?? null).padEnd(26) +
    JSON.stringify(r.name_id) +
    (r.is_active ? "" : "  (nonaktif)"),
  );
}

await c.end();