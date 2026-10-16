// =============================================================================
//  Verifikasi migration-59 di produksi (READ-ONLY).
//
//  Dipakai setelah `node scripts/run-migration.js supabase/migration-59.sql`.
//  Tidak mengubah apa pun; kalau butuh data uji, itu skrip terpisah.
//
//  Yang diperiksa:
//   1. Dua tabel baru ada, RLS + 4 policy, FK cascade.
//   2. Lima RPC baru / diganti ada: bundle_slot_groups, bundle_features,
//      admin_save_bundle, admin_list_bundles, public_menu, create_order.
//   3. public_menu() & admin_list_bundles() mengirim `slots`.
//   4. Paket yang sudah ada (Sando 2) TIDAK ikut berubah.
//   5. create_order sudah punya aturan per-pilihan (dicek dari source-nya).
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { Client } from "pg";

pg.types.setTypeParser(20, (v) => Number(v));

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
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

const fnAda = async (nama) =>
  (await c.query(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = $1`,
    [nama]
  )).rows[0].n;
const tabelAda = async (nama) =>
  (await c.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = $1`,
    [nama]
  )).rows[0].n;

console.log("=== 1. Skema ===");
cek("tabel bundle_slots ada", (await tabelAda("bundle_slots")) === 1);
cek("tabel bundle_slot_flavors ada", (await tabelAda("bundle_slot_flavors")) === 1);
cek("empat policy RLS ada",
  (await c.query(
    `select count(*)::int as n from pg_policies
      where schemaname = 'public' and tablename in ('bundle_slots','bundle_slot_flavors')`
  )).rows[0].n === 4);

console.log("");
console.log("=== 2. RPC ===");
for (const n of [
  "bundle_slot_groups",
  "bundle_features",
  "admin_save_bundle",
  "admin_list_bundles",
  "public_menu",
  "create_order",
]) {
  cek("fungsi " + n + " ada", (await fnAda(n)) === 1);
}
const fitur = (await c.query("select public.bundle_features() as d")).rows[0].d;
cek("bundle_features() = mode pilihan aktif",
  fitur && fitur.choices === true && fitur.max_choices === 10, JSON.stringify(fitur));

console.log("");
console.log("=== 3. Bentuk data ke klien ===");
const menu = (await c.query("select public.public_menu() as d")).rows[0].d;
const semua = [
  ...(menu.bundles ?? []),
  ...(menu.categories ?? []).flatMap((x) => x.bundles ?? []),
];
const unik = [...new Map(semua.map((b) => [b.id, b])).values()];
cek("public_menu() mengirim kunci `slots`",
  unik.length > 0 && unik.every((b) => Array.isArray(b.slots)),
  JSON.stringify(unik.map((b) => b.id + ":" + JSON.stringify(b.slots))));

// `admin_list_bundles()` menolak tanpa sesi admin. GUC `request.jwt.claim.sub`
// HARUS di dalam transaksi eksplisit: kalau tidak, tiap statement jadi
// transaksi sendiri dan settickannya hilang sebelum fungsi dipanggil.
const adminUuid = (await c.query(
  "select user_id::text as u from public.admins where is_active limit 1"
)).rows[0];
let admin = [];
if (adminUuid) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claim.sub', $1, true)", [adminUuid.u]);
  admin = (await c.query("select public.admin_list_bundles() as d")).rows[0].d ?? [];
  await c.query("rollback");
} else {
  console.log("  (tidak ada admin aktif; admin_list_bundles dilewati)");
}
cek("admin_list_bundles() mengirim kunci `slots`",
  Array.isArray(admin) && admin.length > 0 && admin.every((b) => Array.isArray(b.slots)),
  JSON.stringify((admin || []).map((b) => b.id + ":" + JSON.stringify(b.slots))));

console.log("");
console.log("=== 4. Paket lama tidak ikut berubah ===");
const sando = (await c.query(
  `select b.id, b.name_id, b.required_qty, b.is_fixed, b.price,
          (select count(*)::int from public.bundle_slots s where s.bundle_id = b.id) as jumlah_slot
     from public.bundles b where b.slug = 'sando-2'`
)).rows[0];
cek("Sando 2 masih ada", Boolean(sando), JSON.stringify(sando));
if (sando) {
  cek("Sando 2 tetap mode biasa (bukan terkunci, bukan pilihan)",
    sando.is_fixed === false && sando.required_qty === 2 && sando.jumlah_slot === 0,
    `is_fixed=${sando.is_fixed} qty=${sando.required_qty} slot=${sando.jumlah_slot}`);
}

console.log("");
console.log("=== 5. create_order sudah terikat ke pilihan ===");
const src = (await c.query(
  `select p.prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'create_order'`
)).rows[0].prosrc;
cek("ada pemeriksaan daftar per pilihan",
  /from public\.bundle_slots s/.test(src) && /s\.slot_index = v_slot_idx/.test(src));
cek("whitelist rata dilewati saat paket punya pilihan",
  /elsif exists \(select 1 from public\.bundle_flavors/.test(src));
cek("mode terkunci tidak jalan bersamaan dengan mode pilihan",
  /and not exists \(select 1 from public\.bundle_slots where bundle_id = v_bundle_id\) then/.test(src));

console.log("");
console.log(ok + " OK, " + gagal + " GAGAL");
await c.end();
process.exit(gagal === 0 ? 0 : 1);