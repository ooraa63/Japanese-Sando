// Baca daftar zona pickup/pengantaran yang aktif di produksi (READ-ONLY).
//
// Latar: error `new row for relation "orders" violates check constraint
// "orders_delivery_zone_check"" (gambar 6 Steven, 16-10-2026). Constraint itu
// daftar tetap ('pickup','vihara','uvers','other','courier'), sementara pilihan
// "Ambil di toko" теперь memakai ID dari `store_settings.delivery_zones` yang
// bisa bebas diisi admin. Skrip ini membuktikan ID mana yang tidak lolos.
//
// Tidak mengubah apa pun.
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

const r = await c.query("select delivery_zones from public.store_settings limit 1");
const zones = r.rows[0]?.delivery_zones ?? [];
console.log("=== delivery_zones di store_settings ===");
for (const z of zones) {
  console.log(
    `  id=${JSON.stringify(z.id)}  kind=${JSON.stringify(z.kind ?? "(kosong=delivery)")}  ` +
      `fee=${z.fee ?? 0}  ${z.name_id ?? ""}`
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
console.log("");
console.log("=== Constraint orders_delivery_zone_check ===");
console.log("  " + def);
console.log("  nilai yang diizinkan: " + JSON.stringify(diizinkan));

console.log("");
console.log("=== ID zona pickup vs constraint ===");
const pickup = zones.filter((z) => (z.kind ?? "delivery") === "pickup");
if (pickup.length === 0) console.log("  (tidak ada zona kind=pickup)");
for (const z of pickup) {
  const ok = diizinkan.includes(z.id);
  console.log(
    `  ${ok ? "OK   " : "GAGAL"}  pickup id=${JSON.stringify(z.id)} ` +
      (ok ? "lolos constraint" : "GAGAL create_order -> toast error (gambar 6)")
  );
}

await c.end();