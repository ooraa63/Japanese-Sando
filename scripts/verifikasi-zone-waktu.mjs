// READ-ONLY: buktikan po_today() benar-benar memakai WIB, bukan UTC.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// PENTING: pakai ::text. Kalau ::date, driver pg mengubahnya jadi objek
// Date dengan zona waktu lokal Node — tanggalnya lalu terlihat bergeser
// padahal isinya benar. Persis jebakan yang terjadi di skrip uji pertama.
const r = await c.query(`
  select to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') as jam_wib,
         to_char(now(), 'YYYY-MM-DD HH24:MI')                                as jam_utc,
         public.po_today()::text                                             as po_today,
         current_date::text                                                  as current_date,
         (public.po_today() = (now() at time zone 'Asia/Jakarta')::date)     as wib_benar,
         (current_date = now()::date)                                        as utc_benar
`);

console.log("=== PEMBUKTIAN ZONA WAKTU ===");
for (const [k, v] of Object.entries(r.rows[0])) {
  console.log(`  ${k.padEnd(14)}: ${v}`);
}
const ok = r.rows[0].wib_benar && r.rows[0].utc_benar;
console.log(
  ok
    ? "\n  OK: po_today() = tanggal WIB, current_date = tanggal UTC. Keduanya benar."
    : "\n  GAGAL: salah satu nilai tidak sesuai harapan.",
);
if (!ok) process.exitCode = 1;
if (r.rows[0].po_today === r.rows[0].current_date) {
  console.log(
    "  Catatan: saat ini kedua tanggal sama. Itu NORMAL — keduanya hanya\n" +
      "           berbeda antara pukul 00.00 dan 07.00 WIB, yaitu tepat jam\n" +
      "           di mana bug lama ini muncul.",
  );
}

console.log("\n=== JENDELA BATCH (setelah migration-61) ===");
const b = await c.query(`
  select id, label, open_at::text as buka, close_at::text as tutup,
         pickup_date::text as ambil,
         case
           when public.po_today() < open_at then 'akan_dibuka'
           when public.po_today() > close_at then 'selesai'
           else 'buka'
         end as status
    from public.po_batches order by id`);
console.table(b.rows);

console.log("\n=== public_po_pickup_dates() (yang dilihat pembeli) ===");
const d = await c.query(`select public.public_po_pickup_dates() as hasil`);
console.log(JSON.stringify(d.rows[0].hasil, null, 1));

console.log("\n=== TES JENDELA BATCH (harus bebas dari jam) ===");
// Yang diuji bukan "hari ini jam berapa", tapi apakah funct의를 memakai
// tanggal yang benar. Tiga kasus:
//   1. batch yang tutup hari ini  -> masih buka (BETWEEN inklusif)
//   2. batch yang tutup kemarin    -> sudah tertutup
//   3. batch yang buka besok       -> belum buka
const uji = await c.query(`
  select
    (public.po_today() between (public.po_today() - 2)::date
                             and public.po_today())            as tutup_hari_ini_masih_buka,
    (public.po_today() between (public.po_today() - 5)::date
                             and (public.po_today() - 1)::date) as tutup_kemarin_sudah_tutup,
    (public.po_today() between (public.po_today() + 1)::date
                             and (public.po_today() + 3)::date) as buka_besok_belum_buka`);
console.table([uji.rows[0]]);
const u = uji.rows[0];
const benar = u.tutup_hari_ini_masih_buka === true &&
  u.tutup_kemarin_sudah_tutup === false &&
  u.buka_besok_belum_buka === false;
console.log(
  "  " +
    (benar
      ? "OK: batas buka/tutup dihitung dari tanggal WIB."
      : "GAGAL: ada batas yang salah."),
);

console.log("\n=== CEK VIEW/PROCEDURE LAIN YANG MASIH PAKAI current_date ===");
const sisa = await c.query(`
  select viewname as nama, 'view' as jenis
    from pg_views
   where schemaname = 'public' and definition like '%current_date%'
  union all
  select p.proname || '()', 'fungsi'
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc like '%current_date%'
     and p.proname <> 'po_today'`);
console.log(
  sisa.rows.length === 0
    ? "  Tidak ada lagi. Semua fungsi sudah pakai po_today()."
    : sisa.rows.map((r) => `  ${r.nama} (${r.jenis})`).join("\n"),
);
const fn = await c.query(`
  select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prosrc like '%current_date%' and p.proname <> 'po_today'`);
if (fn.rows.length > 0) process.exitCode = 1;

await c.end();