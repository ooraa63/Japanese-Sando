// Baca tabel public.delivery_zones yang sebenarnya dipakai create_order.
// READ-ONLY. Membuktikan ID mana yang tidak lolos constraint orders.
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

const cols = await c.query(`
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'delivery_zones'
  order by ordinal_position
`);
console.log("=== kolom delivery_zones ===");
console.log(cols.rows.map((r) => r.column_name + ":" + r.data_type).join(", "));

const rows = await c.query(
  "select id, kind, name_id, name_en, fee, is_active from public.delivery_zones order by kind, id"
);
console.log("");
console.log("=== isi delivery_zones ===");
for (const z of rows.rows) {
  console.log(
    `  kind=${(z.kind ?? "(null)").padEnd(10)} id=${JSON.stringify(z.id).padEnd(16)} ` +
      `aktif=${z.is_active} fee=${z.fee}  ${z.name_id ?? ""}`
  );
}

const con = await c.query(`
  select pg_get_constraintdef(oid) as definisi
  from pg_constraint
  where conrelid = 'public.orders'::regclass
    and conname = 'orders_delivery_zone_check'
`);
const def = con.rows[0]?.definisi ?? "(tidak ada)";
const diizinkan = [...def.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
const boleh = new Set(diizinkan);
console.log("");
console.log("=== orders_delivery_zone_check mengizinkan ===");
console.log("  " + JSON.stringify(diizinkan));

console.log("");
console.log("=== zona yang akan GAGAL create_order ===");
const bad = rows.rows.filter((z) => !boleh.has(z.id));
if (bad.length === 0) console.log("  (tidak ada - semua zona lolos)");
for (const z of bad) {
  console.log(
    `  id=${JSON.stringify(z.id)} kind=${z.kind ?? "(null)"} aktif=${z.is_active}` +
      (z.kind === "pickup" ? "  <-- INI penyebab error gambar 6" : "")
  );
}

console.log("");
console.log("=== orders yang sudah tersimpan ===");
const used = await c.query(
  "select delivery_zone, delivery_method, count(*)::int as n from public.orders group by 1,2 order by 1"
);
for (const u of used.rows) {
  console.log(`  ${u.delivery_zone} / ${u.delivery_method} = ${u.n}`);
}

await c.end();