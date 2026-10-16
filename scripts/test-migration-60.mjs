// Harness migration-60 (READ-ONLY terhadap data: semua percobaan INSERT di
// dalam BEGIN ... ROLLBACK, tidak ada order yang benar-benar tersimpan).
//
// Yang dibuktikan, DALAM KEDUA KONDISI (migration belum jalan / sudah jalan):
//   1. Error yang Steven kirim di gambar 6 bisa direproduksi saat constraint
//      masih ada, dan HILANG setelah constraint dihapus.
//   2. INSERT dengan zona pickup ('pickup-rumah' / 'pickup-uvers') bisa masuk.
//   3. create_order tetap menolak zona ngawur dengan `invalid_zone` — jadi
//      menghapus constraint tidak membuka celah.
//   4. Jalur kurir yang sudah pernah dipakai tidak ikut rusak.
//
// Catatan: status "sudah terpasang" bukan kegagalan, jadi dicek sebagai kondisi
// tersendiri, bukan GAGAL. Kalau tidak, harness dipakai dua kali (sebelum dan
// sesudah apply) akan selalu melaporkan GAGAL di run kedua.
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

let ok = 0;
let gagal = 0;
const cek = (nama, lulus, extra = "") => {
  if (lulus) ok++;
  else gagal++;
  console.log((lulus ? "OK   " : "GAGAL") + "  " + nama + (extra ? "  -> " + extra : ""));
};

const adaConstraint = async () => {
  const r = await c.query(`
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass
      and conname = 'orders_delivery_zone_check'
  `);
  return r.rowCount > 0;
};

/* Bangun INSERT yang lengkap supaya error yang muncul benar-benar dari CHECK
   constraint, bukan dari kolom NOT NULL yang belum diisi. */
const kolom = await c.query(`
  select column_name from information_schema.columns
  where table_schema='public' and table_name='orders'
    and is_nullable='NO' and column_default is null
`);
const kolomBuatan = [...kolom.rows.map((r) => r.column_name), "delivery_method", "delivery_zone"];
const isi = (nama, method, zone) => {
  if (nama === "order_code") return "'RK-UJI-M60'";
  if (nama === "customer_name") return "'Uji 60'";
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
  "insert into public.orders (" + kolomBuatan.join(", ") + ") values (" +
  kolomBuatan.map((n) => isi(n, method, zone)).join(", ") + ")";

const stokAwal = await c.query("select count(*)::int as n from public.orders");

console.log("=== Zona pickup yang dipakai Steven ===");
const zona = await c.query(
  "select id, kind, name_id from public.delivery_zones where kind='pickup' order by id"
);
for (const z of zona.rows) console.log(`  ${z.id} (${z.name_id})`);
if (zona.rows.length === 0) {
  console.log("  (tidak ada zona pickup - harness tetap jalan dengan id bebas)");
}
const target = zona.rows[0]?.id ?? "pickup-rumah";

const sudahTerpasang = !(await adaConstraint());
console.log("");
console.log(
  "=== KONDISI: migration-60 " + (sudahTerpasang ? "SUDAH TERPASANG" : "BELUM TERPASANG") + " ==="
);

await c.query("begin");

if (sudahTerpasang) {
  // Run kedua: INSERT HARUS langsung diterima, tanpa perlu menjalankan
  // migration dulu.
  await c.query("savepoint a1");
  try {
    await c.query(buatSql("pickup", target));
    cek("INSERT zone pickup langsung diterima (sudah terpasang)", true);
  } catch (e) {
    cek("INSERT zone pickup langsung diterima (sudah terpasang)", false,
      String(e.message || "").slice(0, 140));
  }
  await c.query("rollback to savepoint a1");
} else {
  // Run pertama: error Steven harus bisa direproduksi dulu.
  await c.query("savepoint a1");
  try {
    await c.query(buatSql("pickup", target));
    cek("INSERT zone pickup ditolak constraint (reproduksi)", false,
      "tidak ditolak - error yang Steven kirim tidak muncul");
  } catch (e) {
    const pesan = String(e.message || "");
    cek("reproduksi error Steven (orders_delivery_zone_check)",
      /orders_delivery_zone_check/.test(pesan), pesan.slice(0, 110));
  }
  await c.query("rollback to savepoint a1");

  console.log("");
  console.log("=== JALANKAN migration-60 di dalam transaksi (akan di-rollback) ===");
  await c.query("alter table public.orders drop constraint if exists orders_delivery_zone_check");
  cek("constraint hilang setelah migration", !(await adaConstraint()));

  await c.query("savepoint a2");
  try {
    await c.query(buatSql("pickup", target));
    cek("INSERT zone pickup DITERIMA setelah migration", true);
  } catch (e) {
    cek("INSERT zone pickup DITERIMA setelah migration", false,
      String(e.message || "").slice(0, 140));
  }
  await c.query("rollback to savepoint a2");
}

console.log("");
console.log("=== Validasi create_order tidak ikut melemah ===");
await c.query("savepoint b1");
try {
  await c.query("select public.create_order(" + [
    "'Uji 60'",
    "'uji60@example.com'",
    "''",
    "'081234567890'",
    "'transfer'",
    "'pickup'",
    "'zona-ngawur-tidak-ada'",
  ].join(", ") + ")");
  cek("create_order menolak zone ngawur (invalid_zone)", false, "tidak ditolak");
} catch (e) {
  const pesan = String(e.message || "");
  cek("create_order menolak zone ngawur (invalid_zone)", /invalid_zone/.test(pesan),
    pesan.slice(0, 110));
}
await c.query("rollback to savepoint b1");

await c.query("savepoint b2");
try {
  await c.query(buatSql("courier", "courier"));
  cek("INSERT courier/courier masih diterima", true);
} catch (e) {
  cek("INSERT courier/courier masih diterima", false, String(e.message || "").slice(0, 140));
}
await c.query("rollback to savepoint b2");

await c.query("rollback");

const stokAkhir = await c.query("select count(*)::int as n from public.orders");
cek("tidak ada order tersimpan", stokAwal.rows[0].n === stokAkhir.rows[0].n,
  stokAwal.rows[0].n + " -> " + stokAkhir.rows[0].n);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");
await c.end();
process.exit(gagal === 0 ? 0 : 1);