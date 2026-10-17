/**
 * GENERATOR migration-61 — zone waktu batch PO ikut WIB (Asia/Jakarta).
 *
 * Sumber kebenaran adalah definisi fungsi LIVE di database, bukan file
 * migration lama. Jadi kalau Steven mengubah fungsi lewat dashboard, hasil
 * di sini tetap mengikuti kondisi sebenarnya.
 *
 *   node scripts/gen-migration-61.mjs          # tulis file, jangan terapkan
 *   node scripts/gen-migration-61.mjs --apply  # tulis lalu terapkan
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const OUT = path.resolve(process.cwd(), "supabase/migration-61.sql");

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

/**
 * Fungsi yang DIBAWAKAN utuh: hanya `current_date` yang diganti, sisa
 * body harus identik dengan yang live.
 *
 * Semua fungsi di sini membandingkan `current_date` dengan kolom bertipe
 * `date` (`po_batches.open_at` / `close_at`). Kolom `date` tidak punya
 * zona waktu, jadi hanya sisi kanannya yang perlu diganti jadi WIB — kalau
 * `open_at`/`close_at` ikut dijamahi, batasnya justru bergeser sendiri.
 */
const POLA_BIASA = [
  "public_po_pickup_dates",
  "public_po_batch_for_date",
  "create_order",
  "admin_list_po_batches",
  "admin_list_po_batch_detail",
];

/**
 * `admin_dashboard_stats` TIDAK bisa pakai pola biasa.
 *
 * Di sini `current_date` dibandingkan dengan `created_at`, yaitu
 * `timestamptz`. `created_at::date` memakai zona waktu SESI database
 * (UTC), jadi kalau cuma mengganti `current_date` ke WIB, angka
 * "pesanan hari ini" jadi tidak sinkron — sisi kiri masih UTC, sisi
 * kanan sudah WIB.
 *
 * Karena itu `created_at` juga dikonversi ke WIB lebih dulu, supaya
 * keduanya dibandingkan dalam satu zona waktu yang sama.
 */
const POLA_STATISTIK = [
  {
    nama: "admin_dashboard_stats",
    ganti: [
      [
        "created_at::date = current_date",
        "(created_at at time zone 'Asia/Jakarta')::date = public.po_today()",
      ],
      [
        "date_trunc('month', created_at) = date_trunc('month', current_date)",
        "date_trunc('month', created_at at time zone 'Asia/Jakarta') = date_trunc('month', public.po_today())",
      ],
      // Sub-query di bawahnya menulis `o.created_at`, jadi pola yang sama
      // harus diulang dengan prefiks alias. Kalau ini lupa, sisi kiri tetap
      // UTC sementara sisi kanan sudah WIB.
      [
        "date_trunc('month', o.created_at) = date_trunc('month', current_date)",
        "date_trunc('month', o.created_at at time zone 'Asia/Jakarta') = date_trunc('month', public.po_today())",
      ],
      // Sisanya (kalau ada) tetap dapat perlakuan biasa.
      ["current_date", "public.po_today()"],
    ],
    // Kalau live body berubah, salah satu pola ini tidak akan ditemukan dan
    // generator berhenti — jangan diam-diam menghasilkan SQL setengah jadi.
    wajib: [
      "(created_at at time zone 'Asia/Jakarta')::date = public.po_today()",
      "date_trunc('month', o.created_at at time zone 'Asia/Jakarta')",
      "date_trunc('month', created_at at time zone 'Asia/Jakarta')",
    ],
  },
];

const HEADER = `-- ============================================================================
-- Migration 61 - Jendela batch PO ikut zona waktu toko (WIB), bukan UTC
-- Dijalankan: 17-10-2026, atas permintaan Steven.
--
-- MASALAH
--   Session database di zona waktu UTC, sedangkan toko di Bandung (WIB,
--   UTC+7). Halaman jendela batch pakai \`current_date\`, yang ikut zona
--   waktu session -- jadi antara pukul 00.00 dan 07.00 WIB website masih
--   menganggap hari belum berganti:
--     * tanggal ambil yang sebenarnya sudah lewat masih bisa dipilih,
--     * batch yang mestinya sudah tertutup masih menerima pesanan,
--     * batch baru terbuka 7 jam lebih lambat dari yang dijadwalkan,
--     * angka "pesanan hari ini" di dashboard ikut bergeser.
--
-- PERBAIKAN
--   Fungsi baru \`public.po_today()\` = tanggal hari ini di Asia/Jakarta.
--   Semua \`current_date\` pada fungsi jendela batch dan laporan harian
--   diganti ke fungsi itu.
--
-- CATATAN PENTING
--   \`po_batches.open_at\` / \`close_at\` bertipe \`date\` (bukan timestamptz)
--   dan SENGAJA TIDAK diubah. Nilai yang tersimpan sudah dibaca Steven
--   sebagai tanggal kalender WIB, jadi mengonversinya ke jam akan membuat
--   batas batch bergeser 7 jam ke belakang. Hanya sisi perbandingannya
--   yang ikut WIB.
--
-- DIHASILKAN OLEH: scripts/gen-migration-61.mjs (dari definisi fungsi live)
-- ============================================================================

-- Helper: tanggal "hari ini" menurut jam toko, bukan jam server.
create or replace function public.po_today()
returns date
language sql
stable
as $$
  select (current_timestamp at time zone 'Asia/Jakarta')::date;
$$;

comment on function public.po_today() is
  'Tanggal hari ini di zona waktu toko (Asia/Jakarta / WIB). Dipakai untuk jendela batch PO dan laporan harian. Jangan pakai current_date — itu ikut zona waktu session database (UTC).';

grant execute on function public.po_today() to anon, authenticated, service_role;
`;

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/**
 * `pg_get_functiondef()` TIDAK mengakhiri definisinya dengan titik koma.
 * Kalau titik koma itu tidak ditambahkan, statement berikutnya menempel ke
 * `$function$` dan PostgreSQL mem-parsing-nya sebagai
 * "syntax error at or near CREATE".
 */
const titikKoma = (sql) => `${sql.trimEnd().replace(/;+$/, "")};`;

/** Ambil definisi lengkap fungsi live, persis seperti yang tersimpan. */
async function definisiLive(nama, args = null) {
  const r = await c.query(
    `select pg_get_functiondef(p.oid) as def,
            pg_get_function_identity_arguments(p.oid) as idargs
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1
        and ($2::text is null or pg_get_function_identity_arguments(p.oid) = $2)`,
    [nama, args],
  );
  return r.rows[0];
}

const bagian = [];

for (const nama of POLA_BIASA) {
  const live = await definisiLive(nama);
  if (!live) throw new Error(`Fungsi ${nama} tidak ditemukan di database.`);
  let isi = live.def;
  const sebelum = (isi.match(/current_date/g) ?? []).length;
  if (sebelum === 0) throw new Error(`${nama}: tidak ada current_date — cek ulang.`);
  isi = isi.replace(/\bcurrent_date\b/g, "public.po_today()");
  isi = isi.replace(/^CREATE OR REPLACE FUNCTION/i, "CREATE OR REPLACE FUNCTION");
  bagian.push(
    `-- ${nama}(): ${sebelum} kemunculan current_date -> public.po_today()\n` +
      titikKoma(isi) +
      "\n",
  );
  console.log(`  ${nama}(): ${sebelum} current_date diganti`);
}

for (const f of POLA_STATISTIK) {
  const live = await definisiLive(f.nama);
  if (!live) throw new Error(`Fungsi ${f.nama} tidak ditemukan di database.`);
  let isi = live.def;
  let tersentuh = 0;
  for (const [dari, ke] of f.ganti) {
    const n = isi.split(dari).length - 1;
    tersentuh += n;
    isi = isi.split(dari).join(ke);
  }
  // Pengaman: kalau ada pola yang ternyata tidak ada di body versi ini,
  // administrator perlu tahu daripada diam-diam lewat.
  if (f.wajib && !f.wajib.every((s) => isi.includes(s))) {
    throw new Error(`${f.nama}: pola wajib tidak ditemukan -> ${f.wajib.join(" | ")}`);
  }
  if (/\bcurrent_date\b/.test(isi)) {
    throw new Error(`${f.nama}: masih ada current_date yang belum tertangani.`);
  }
  bagian.push(
    `-- ${f.nama}(): ${tersentuh} tempat diganti, created_at ikut WIB supaya\n` +
      `-- sisi kiri dan kanan dibandingkan dalam zona waktu yang sama.\n` +
      titikKoma(isi) +
      "\n",
  );
  console.log(`  ${f.nama}(): khusus (created_at ikut WIB)`);
}

// Grants tetap sama karena CREATE OR REPLACE tidak menghapus ACL yang ada.
const KAKI = `
-- grants tidak diubah: CREATE OR REPLACE mempertahankan ACL yang sudah ada.
-- Verifikasi setelah jalan:
--   select public.po_today(), current_date,
--          (current_date between open_at and close_at) as buka
--     from public.po_batches where id = 22;
`;

const isi = HEADER + "\n" + bagian.join("\n") + KAKI;
// Migration lain di folder ini pakai LF, tapi `pg_get_functiondef` bisa
// mengembalikan \r\n dari body yang tersimpan di database. Ratakan supaya
// file ini tidak campur.
const isiRapi = isi.replace(/\r\n/g, "\n");
writeFileSync(OUT, isiRapi, "utf8");
console.log(`\nDitulis: ${OUT} (${isiRapi.split("\n").length} baris, EOL LF)`);

if (APPLY) {
  console.log("\nMenerapkan ke database (dalam satu transaksi)...");
  // Pakai transaksi supaya kalau satu definisi gagal, TIDAK ada fungsi yang
  // sudah terganti sebagian. `CREATE OR REPLACE` di dalam transaksi aman
  // untuk rollback.
  try {
    await c.query("begin");
    await c.query(isiRapi);
    await c.query("commit");
    console.log("  COMMIT berhasil.");
  } catch (err) {
    await c.query("rollback").catch(() => {});
    console.error("  GAGAL, sudah ROLLBACK:", err.message);
    await c.end();
    process.exit(1);
  }
  const cek = await c.query(
    `select public.po_today() as wib, current_date as utc, now() as db_now`,
  );
  console.log("  po_today() :", cek.rows[0].wib);
  console.log("  current_date:", cek.rows[0].utc);
  const batch = await c.query(
    `select id, open_at, close_at,
            (current_date between open_at and close_at) as buka_sebelum,
            (public.po_today() between open_at and close_at) as buka_seudah
       from public.po_batches order by id`,
  );
  console.table(batch.rows.map((r) => ({
    ...r,
    open_at: new Date(r.open_at.getTime() + 7 * 3600000).toISOString().slice(0, 10),
    close_at: new Date(r.close_at.getTime() + 7 * 3600000).toISOString().slice(0, 10),
  })));
  console.log("DITERAPKAN.");
} else {
  console.log("Belum diterapkan. Jalankan ulang dengan --apply kalau sudah cocok.");
}

await c.end();