// Verifikasi produksi setelah migration-60.
//
// Membuktikan jalur PERSIS yang Steven pakai saat gagal: `create_order` dengan
// zona pengambilan `pickup-rumah` (Rumah Sushi) dan `pickup-uvers` (UVERS).
//
// Semua percobaan dibungkus BEGIN ... ROLLBACK, jadi tidak ada order sungguhan
// yang tersimpan di produksi. Yang diuji hanya:" apakah baris bisa masuk".
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

console.log("=== constraint ===");
const con = await c.query(`
  select 1 from pg_constraint
  where conrelid = 'public.orders'::regclass
    and conname = 'orders_delivery_zone_check'
`);
cek("orders_delivery_zone_check sudah tidak ada", con.rowCount === 0);

console.log("");
console.log("=== zona aktif ===");
const zona = await c.query(
  "select id, kind, name_id, is_active from public.delivery_zones order by kind, id"
);
for (const z of zona.rows) {
  console.log(`  ${(z.kind ?? "delivery").padEnd(9)} ${z.id.padEnd(15)} ${z.name_id}`);
}

const batch = await c.query(
  "select id from public.po_batches where is_active = true order by id desc limit 1"
);
const batchId = batch.rows[0]?.id ?? null;
console.log("");
console.log("batch aktif: " + (batchId ?? "(tidak ada)"));

const stok = await c.query("select count(*)::int as n from public.orders");
const sebelum = stok.rows[0].n;

/* Panggil create_order persis seperti frontend: zona pickup, metode pickup,
   satu item rasa. Semua di dalam transaksi yang akan di-rollback. */
/* Nama savepoint tidak boleh mengandung tanda hubung, dan id zona justru
   punya tanda hubung ("pickup-rumah"). Jadi disanitasi lebih dulu. */
const namaSavepoint = (id) => "sp_" + id.replace(/[^A-Za-z0-9_]/g, "_");

const cobaCreateOrder = async (zonaId, label) => {
  const sp = namaSavepoint(zonaId);
  await c.query("savepoint " + sp);
  try {
    const r = await c.query(
      "select public.create_order(" +
        [
          "'Uji Migration 60'",
          "'ujim60@example.com'",
          "''",
          "'081234567890'",
          "'transfer'",
          "'pickup'",
          "'" + zonaId + "'",
          "''",
          "''",
          "null",
          "null",
          "''",
          "''",
          "''",
          "'id'",
          "jsonb_build_array(jsonb_build_object('flavor_id', 1, 'quantity', 1))",
          "'[]'::jsonb",
          "null",
          batchId ? String(batchId) : "null",
        ].join(", ") +
        ") as kode"
    );
    cek("create_order zona " + label, true, "kode " + String(r.rows[0].kode).slice(0, 24));
  } catch (e) {
    const pesan = String(e.message || "");
    cek("create_order zona " + label, false, pesan.slice(0, 150));
  }
  await c.query("rollback to savepoint " + sp);
};

await c.query("begin");
await cobaCreateOrder("pickup-rumah", "pickup-rumah (Rumah Sushi)");
await cobaCreateOrder("pickup-uvers", "pickup-uvers (UVERS)");

// Zona yang TIDAK boleh dipakai harus tetap ditolak.
// Argumen HARUS 19 buah, sama persis seperti create_order, kalau tidak
// posisinya bergeser dan yang ditolak adalah nama, bukan zonanya.
await c.query("savepoint s_ngawur");
try {
  await c.query(
    "select public.create_order(" +
      [
        "'Uji Migration 60'",
        "'ujim60@example.com'",
        "''",
        "'081234567890'",
        "'transfer'",
        "'pickup'",
        "'zona-ngawur-tidak-ada'",
        "''",
        "''",
        "null",
        "null",
        "''",
        "''",
        "''",
        "'id'",
        "jsonb_build_array(jsonb_build_object('flavor_id', 1, 'quantity', 1))",
        "'[]'::jsonb",
        "null",
        batchId ? String(batchId) : "null",
        "null",
      ].join(", ") +
      ")"
  );
  cek("zona ngawur tetap ditolak", false, "tidak ditolak");
} catch (e) {
  cek("zona ngawur tetap ditolak (invalid_zone)", /invalid_zone/.test(String(e.message || "")),
    String(e.message || "").slice(0, 90));
}
await c.query("rollback to savepoint s_ngawur");

await c.query("rollback");

const setelah = await c.query("select count(*)::int as n from public.orders");
cek("tidak ada order sungguhan tersimpan", sebelum === setelah.rows[0].n,
  sebelum + " -> " + setelah.rows[0].n);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");
await c.end();
process.exit(gagal === 0 ? 0 : 1);