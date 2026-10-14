// Reproduksi bug orders_delivery_method_check (READ-ONLY terhadap produksi).
//
// Semua INSERT dibungkus BEGIN ... ROLLBACK, jadi tidak ada data yang benar-benar
// tersimpan. Setiap INSERT yang diharapkan gagal dibungkus SAVEPOINT supaya
// kegagalan itu tidak membuat seluruh transaksi jadi aborted (lihat gotcha di
// scripts/test-migration-56.mjs).
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let ok = 0;
let gagal = 0;
const cek = (nama, lulus, extra = "") => {
  if (lulus) ok++;
  else gagal++;
  console.log((lulus ? "OK   " : "GAGAL") + "  " + nama + (extra ? "  -> " + extra : ""));
};

console.log("=== Kolom NOT NULL tanpa default di orders ===");
const kolom = await c.query(`
  select column_name, data_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'orders'
    and is_nullable = 'NO' and column_default is null
  order by ordinal_position
`);
console.log(kolom.rows.map((r) => r.column_name + ":" + r.data_type).join(", "));
console.log("");

const stokAwal = await c.query("select count(*)::int as n from orders");

await c.query("begin");

// Bangun INSERT lengkap supaya error yang muncul benar-benar dari CHECK
// constraint, bukan dari kolom NOT NULL yang belum diisi.
// PENTING: `delivery_method` dan `delivery_zone` MEMILIKI default
// ('pickup'::text), jadi keduanya TIDAK muncul di daftar "NOT NULL tanpa
// default". Kalau hanya kolom itu yang dipakai, INSERT diam-diam memakai default
// dan tesnya berbohong. Jadi keduanya ditambahkan eksplisit.
const kolomBuatan = [...kolom.rows.map((r) => r.column_name), "delivery_method", "delivery_zone"];
const isi = (nama, method, zone) => {
  if (nama === "order_code") return "'RK-UJI-COURIER'";
  if (nama === "customer_name") return "'Uji Courier'";
  if (nama === "instagram") return "'uji'";
  if (nama === "phone") return "'081234567890'";
  if (nama === "delivery_method") return "'" + method + "'";
  if (nama === "delivery_zone") return "'" + zone + "'";
  if (nama === "payment_method") return "'transfer'";
  if (nama === "language") return "'id'";
  if (nama === "order_status") return "'pending'";
  if (nama === "status") return "'pending'";
  if (nama.includes("int") || nama.includes("count") || nama.includes("qty") || nama.includes("amount") || nama.includes("fee") || nama.includes("price") || nama.includes("total")) return "0";
  return "'0'";
};

const buatSql = (method, zone) =>
  "insert into public.orders (\n      " +
  kolomBuatan.join(", ") +
  "\n    ) values (\n      " +
  kolomBuatan.map((n) => isi(n, method, zone)).join(",\n      ") +
  "\n    )";

console.log("=== Percobaan 1: delivery_method = 'courier' (meniru form Pesan Kurir) ===");
await c.query("savepoint s1");
try {
  await c.query(buatSql("courier", "courier"));
  cek("insert dengan courier DITERIMA database", false, "tidak seharusnya");
} catch (e) {
  const pesan = String(e.message || "");
  const cocok = /orders_delivery_method_check/.test(pesan);
  cek("insert dengan courier DITOLAK", true, pesan);
  cek("  ... dan alasannya memang delivery_method_check", cocok, cocok ? "" : pesan);
}
await c.query("rollback to savepoint s1");

console.log("");
console.log("=== Percobaan 2: delivery_method = 'pickup', zone = 'courier' ===");
await c.query("savepoint s2");
try {
  await c.query(buatSql("pickup", "courier"));
  cek("insert dengan zone courier DITERIMA", true, "zona bukan masalah");
} catch (e) {
  cek("insert dengan zone courier DITOLAK", false, String(e.message || ""));
}
await c.query("rollback to savepoint s2");

console.log("");
console.log("=== Percobaan 3: pickup/pickup (baseline sehat) ===");
await c.query("savepoint s3");
try {
  await c.query(buatSql("pickup", "pickup"));
  cek("insert pickup/pickup DITERIMA", true);
} catch (e) {
  cek("insert pickup/pickup DITERIMA", false, String(e.message || ""));
}
await c.query("rollback to savepoint s3");

await c.query("rollback");
const stokAkhir = await c.query("select count(*)::int as n from orders");

console.log("");
cek("tidak ada order tersimpan", stokAwal.rows[0].n === stokAkhir.rows[0].n,
  stokAwal.rows[0].n + " -> " + stokAkhir.rows[0].n);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");

await c.end();