// Baca definisi check constraint di tabel orders (READ-ONLY).
//
// Dipakai saat error "new row for relation "orders" violates check constraint
// "orders_delivery_method_check"" muncul. Nilai yang dikirim frontend dibandingkan
// dengan daftar yang diizinkan database.
//
// Tidak mengubah apa pun.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

console.log("=== Semua CHECK constraint di tabel orders ===");
const r1 = await c.query(`
  select con.conname,
         pg_get_constraintdef(con.oid) as definisi
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where rel.relname = 'orders'
    and ns.nspname = 'public'
    and con.contype = 'c'
  order by con.conname
`);
for (const row of r1.rows) {
  console.log("");
  console.log(row.conname);
  console.log("  " + row.definisi);
}

console.log("");
console.log("=== Kolom yangvolved ===");
const r2 = await c.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders'
    and (column_name like '%method%' or column_name like '%payment%' or column_name like '%delivery%')
  order by ordinal_position
`);
console.table(r2.rows);

console.log("=== Nilai yang sudah terpakai di orders ===");
for (const col of ["delivery_method", "payment_method"]) {
  try {
    const r3 = await c.query(
      "select " + col + "::text as nilai, count(*)::int as jumlah from orders group by 1 order by 1",
    );
    console.log(col + ": " + JSON.stringify(r3.rows));
  } catch (e) {
    console.log(col + ": (tidak bisa dibaca: " + e.message + ")");
  }
}

console.log("");
console.log("=== Nilai yang dikirim frontend (src) ===");
await c.end();