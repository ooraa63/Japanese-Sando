// Uji migration-57 tanpa menyentuh produksi: jalankan isinya di dalam
// BEGIN ... ROLLBACK.
//
// Yang diuji:
//   1. Dua check constraint benar-benar berubah isinya (bukan cuma nama).
//   2. INSERT dengan delivery_method='courier' + delivery_zone='courier'
//      DITERIMA -- ini yang tadi ditolak.
//   3. INSERT pickup/pickup tetap diterima (tidak ada regresi).
//   4. Constraint MASIH AKTIF: nilai ngawur tetap ditolak.
//   5. Setelah ROLLBACK, definisi constraint kembali ke semula dan tidak ada
//      order yang tersimpan.
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
    `select pg_get_constraintdef(oid) as d
     from pg_constraint
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
  if (nama === "order_code") return "'RK-UJI-57'";
  if (nama === "customer_name") return "'Uji 57'";
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

const sebelumMethod = await definisi("orders_delivery_method_check");
const sebelumZone = await definisi("orders_delivery_zone_check");

const sql = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-57.sql"), "utf8");

await c.query("begin");
await c.query(sql);

console.log("=== 1. Definisi constraint setelah migration ===");
const sesudahMethod = await definisi("orders_delivery_method_check");
const sesudahZone = await definisi("orders_delivery_zone_check");
cek("orders_delivery_method_check sekarang mengizinkan courier",
  /courier/.test(sesudahMethod || ""), sesudahMethod);
cek("orders_delivery_zone_check sekarang mengizinkan courier",
  /courier/.test(sesudahZone || ""), sesudahZone);
cek("pickup/delivery masih ada di constraint method",
  /pickup/.test(sesudahMethod || "") && /delivery/.test(sesudahMethod || ""));
cek("vihara/uvers/other masih ada di constraint zone",
  /vihara/.test(sesudahZone || "") && /uvers/.test(sesudahZone || "") && /other/.test(sesudahZone || ""));
cek("constraint method berubah dari sebelumnya", sebelumMethod !== sesudahMethod);
cek("constraint zone berubah dari sebelumnya", sebelumZone !== sesudahZone);

console.log("");
console.log("=== 2. Kasus yang tadi gagal: Pesan Kurir + transfer ===");
await c.query("savepoint s1");
try {
  await c.query(buatSql("courier", "courier"));
  cek("courier/courier DITERIMA (kasus Steven)", true);
} catch (e) {
  cek("courier/courier DITERIMA (kasus Steven)", false, String(e.message || ""));
}
await c.query("rollback to savepoint s1");

console.log("");
console.log("=== 3. Tidak ada regresi ===");
await c.query("savepoint s2");
try {
  await c.query(buatSql("pickup", "pickup"));
  cek("pickup/pickup tetap diterima", true);
} catch (e) {
  cek("pickup/pickup tetap diterima", false, String(e.message || ""));
}
await c.query("rollback to savepoint s2");

await c.query("savepoint s2b");
try {
  await c.query(buatSql("delivery", "vihara"));
  cek("delivery/vihara tetap diterima", true);
} catch (e) {
  cek("delivery/vihara tetap diterima", false, String(e.message || ""));
}
await c.query("rollback to savepoint s2b");

console.log("");
console.log("=== 4. Constraint masih aktif (nilai ngawur ditolak) ===");
await c.query("savepoint s3");
try {
  await c.query(buatSql("ngawur", "ngawur"));
  cek("nilai ngawur DITOLAK (constraint masih hidup)", false, "terima -- constraint mati!");
} catch (e) {
  const pesan = String(e.message || "");
  cek("nilai ngawur DITOLAK (constraint masih hidup)", /check constraint/i.test(pesan), pesan);
}
await c.query("rollback to savepoint s3");

await c.query("rollback");

console.log("");
console.log("=== 5. Setelah ROLLBACK, semuanya kembali ===");
const sesudahRollback = await definisi("orders_delivery_method_check");
cek("definisi constraint method kembali ke semula", sesudahRollback === sebelumMethod, sesudahRollback);
const zoneRollback = await definisi("orders_delivery_zone_check");
cek("definisi constraint zone kembali ke semula", zoneRollback === sebelumZone);
const orderAkhir = await c.query("select count(*)::int as n from orders");
cek("tidak ada order tersimpan", orderAwal.rows[0].n === orderAkhir.rows[0].n,
  orderAwal.rows[0].n + " -> " + orderAkhir.rows[0].n);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");

await c.end();
if (gagal > 0) process.exit(1);