// Verifikasi migration-57 SUDAH AKTIF di produksi.
//
// Beda dari test-migration-57.mjs: skrip ini tidak menjalankan migration, hanya
// memastikannya. Semua percobaan INSERT dibungkus BEGIN ... ROLLBACK, jadi tidak
// ada order yang benar-benar tersimpan.
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

const definisi = async (nama) => {
  const r = await c.query(
    `select pg_get_constraintdef(oid) as d from pg_constraint
     where conname = $1 and conrelid = 'public.orders'::regclass`,
    [nama],
  );
  return r.rows[0] ? r.rows[0].d : null;
};

const kolom = await c.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'orders'
    and is_nullable = 'NO' and column_default is null
  order by ordinal_position
`);

const target = [...kolom.rows.map((r) => r.column_name), "delivery_method", "delivery_zone"];
const isi = (nama, method, zone) => {
  if (nama === "order_code") return "'RK-UJI-LIVE'";
  if (nama === "customer_name") return "'Uji Live'";
  if (nama === "instagram") return "'uji'";
  if (nama === "phone") return "'081234567890'";
  if (nama === "delivery_method") return "'" + method + "'";
  if (nama === "delivery_zone") return "'" + zone + "'";
  if (nama === "payment_method") return "'transfer'";
  if (nama === "language") return "'id'";
  if (nama === "status" || nama === "order_status") return "'pending'";
  if (/int|count|qty|amount|fee|price|total/.test(nama)) return "0";
  return "'0'";
};
const buatSql = (method, zone) =>
  "insert into public.orders (" + target.join(", ") + ") values (" +
  target.map((n) => isi(n, method, zone)).join(", ") + ")";

const orderAwal = await c.query("select count(*)::int as n from orders");

console.log("=== 1. Definisi constraint di produksi ===");
const dMethod = await definisi("orders_delivery_method_check");
const dZone = await definisi("orders_delivery_zone_check");
cek("orders_delivery_method_check mengizinkan courier", /courier/.test(dMethod || ""), dMethod);
cek("orders_delivery_zone_check mengizinkan courier", /courier/.test(dZone || ""), dZone);
cek("pickup/delivery masih ada di method",
  /pickup/.test(dMethod || "") && /delivery/.test(dMethod || ""));
cek("vihara/uvers/other masih ada di zone",
  /vihara/.test(dZone || "") && /uvers/.test(dZone || "") && /other/.test(dZone || ""));

console.log("");
console.log("=== 2. Kasus Steven: Pesan Kurir + transfer ===");
await c.query("begin");
await c.query("savepoint s1");
try {
  await c.query(buatSql("courier", "courier"));
  cek("courier/courier DITERIMA (kasus yang tadi gagal)", true);
} catch (e) {
  cek("courier/courier DITERIMA (kasus yang tadi gagal)", false, String(e.message || ""));
}
await c.query("rollback to savepoint s1");

console.log("");
console.log("=== 3. Tidak ada regresi ===");
for (const [method, zone] of [["pickup", "pickup"], ["delivery", "vihara"], ["delivery", "uvers"], ["delivery", "other"]]) {
  await c.query("savepoint s2");
  let lulus = false;
  let pesan = "";
  try {
    await c.query(buatSql(method, zone));
    lulus = true;
  } catch (e) {
    pesan = String(e.message || "");
  }
  cek(method + "/" + zone + " tetap diterima", lulus, lulus ? "" : pesan);
  await c.query("rollback to savepoint s2");
}

console.log("");
console.log("=== 4. Constraint masih hidup (nilai ngawur ditolak) ===");
await c.query("savepoint s3");
try {
  await c.query(buatSql("ngawur", "ngawur"));
  cek("nilai ngawur DITOLAK", false, "terima -- constraint mati!");
} catch (e) {
  cek("nilai ngawur DITOLAK", /check constraint/i.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s3");

await c.query("rollback");

console.log("");
const orderAkhir = await c.query("select count(*)::int as n from orders");
cek("tidak ada order tersimpan", orderAwal.rows[0].n === orderAkhir.rows[0].n,
  orderAwal.rows[0].n + " -> " + orderAkhir.rows[0].n);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");

await c.end();
if (gagal > 0) process.exit(1);