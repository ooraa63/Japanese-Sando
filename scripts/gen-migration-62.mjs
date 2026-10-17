/**
 * GENERATOR migration-62 — tanggal ambil yang sudah lewat tidak lagi ditawarkan.
 *
 * Sumber kebenaran adalah definisi fungsi LIVE di database (sama seperti
 * migration-61), bukan file migration lama.
 *
 *   node scripts/gen-migration-62.mjs          # tulis file, jangan terapkan
 *   node scripts/gen-migration-62.mjs --apply  # tulis lalu terapkan
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const OUT = path.resolve(process.cwd(), "supabase/migration-62.sql");

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
 * Dua fungsi publik yang mengisi daftar tanggal ambil untuk pembeli.
 * Keduanya sudah menyaring lewat `open_at`/`close_at`, tapi TIDAK pernah
 * membandingkan `pickup_date` dengan hari ini.
 *
 * Akibatnya batch yang sudah dibuka kemarin tapi tanggal ambangnya lewat
 * masih muncul di langkah 1. Pembeli bisa memilih tanggal yang sudah lewat,
 * lalu `create_order` menerimanya karena jendela batch-nya masih terbuka.
 *
 * Perbaikannya satu baris: `pickup_date` harus >= hari ini (WIB, lewat
 * `public.po_today()` dari migration-61).
 */
const POLA = [
  { nama: "public_po_pickup_dates", args: null },
  { nama: "public_po_batch_for_date", args: "p_pickup_date date" },
];

const DARI = "and public.po_today() between b.open_at and b.close_at";
const KE =
  "and public.po_today() between b.open_at and b.close_at\n" +
  "       and b.pickup_date >= public.po_today()";

const HEADER = `-- ============================================================================
-- Migration 62 - Tanggal ambil yang sudah lewat tidak lagi ditawarkan
-- Dijalankan: 17-10-2026, atas permintaan Steven (screenshot "tanggal sudah
-- lewat tapi masih bisa pilih, seharusnya sudah hilang").
--
-- MASALAH
--   Dua fungsi publik yang mengisi daftar tanggal di langkah 1 /order sudah
--   menyaring batch lewat \`open_at\`/\`close_at\`, tapi TIDAK pernah
--   membandingkan \`pickup_date\` dengan hari ini. Batch 22 (buka 15-10,
--   tutup 17-10, ambil 16-10) karena itu tetap menampilkan "Jumat, 16
--   Oktober 2026" pada tanggal 17 Oktober, padahal 16-10 sudah lewat.
--
--   Akibatnya pembeli bisa memilih tanggal yang sudah lewat dan
--   \`create_order\` menerimanya, karena yang diawasi hanya jendela buka/tutup
--   batch, bukan tanggal pengambilannya.
--
-- PERBAIKAN
--   \`b.pickup_date >= public.po_today()\` ditambahkan di kedua fungsi.
--   \`po_today()\` (dari migration-61) memakai jam WIB, jadi "hari ini" di
--   sini sama dengan hari kalender yang dilihat pembeli di hp-nya.
--
-- CATATAN
--   Kolom \`pickup_date\` tetap \`date\`, tidak diubah jadi timestamptz.
--   Yang dibandingkan adalah TANGGAL ambil, bukan jam ambil, jadi zona waktu
--   tidak berperan di kolom ini.
--
-- DIHASILKAN OLEH: scripts/gen-migration-62.mjs (dari definisi fungsi live)
-- ============================================================================
`;

/** `pg_get_functiondef()` tidak menutup definisinya dengan titik koma. */
const titikKoma = (sql) => `${sql.trimEnd().replace(/;+$/, "")};`;

async function definisiLive(nama, args = null) {
  const r = await c.query(
    `select pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1
        and ($2::text is null or pg_get_function_identity_arguments(p.oid) = $2)`,
    [nama, args],
  );
  return r.rows[0];
}

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const bagian = [];
for (const { nama, args } of POLA) {
  const live = await definisiLive(nama, args);
  if (!live) throw new Error(`Fungsi ${nama} tidak ditemukan di database.`);
  const jumlah = live.def.split(DARI).length - 1;
  if (jumlah !== 1) {
    throw new Error(
      `${nama}: pola "${DARI}" ditemukan ${jumlah} kali (harus tepat 1) — cek ulang body live.`,
    );
  }
  if (live.def.includes("b.pickup_date >= public.po_today()")) {
    throw new Error(`${nama}: sudah pernah punya filter ini.`);
  }
  bagian.push(`-- ${nama}(): tambah syarat pickup_date >= hari ini (WIB)\n${titikKoma(live.def.split(DARI).join(KE))}\n`);
  console.log(`  ${nama}(): filter tanggal lewat ditambahkan`);
}

const KAKI = `
-- grants tidak diubah: CREATE OR REPLACE mempertahankan ACL yang sudah ada.
-- Verifikasi setelah jalan:
--   select public.public_po_pickup_dates();
`;

const isi = HEADER + "\n" + bagian.join("\n") + KAKI;
const isiRapi = isi.replace(/\r\n/g, "\n");
writeFileSync(OUT, isiRapi, "utf8");
console.log(`\nDitulis: ${OUT} (${isiRapi.split("\n").length} baris, EOL LF)`);

if (APPLY) {
  console.log("\nMenerapkan ke database (dalam satu transaksi)...");
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

  const sebelum = await c.query(
    `select id, open_at::text, close_at::text, pickup_date::text
       from public.po_batches where is_active order by id`,
  );
  console.table(sebelum.rows);
  const hasil = await c.query(`select public.public_po_pickup_dates() as json`);
  console.log("  public_po_pickup_dates() ->", JSON.stringify(hasil.rows[0].json));
  const batch = await c.query(
    `select public.public_po_batch_for_date('2026-10-16'::date) as json`,
  );
  console.log("  public_po_batch_for_date('2026-10-16') ->", JSON.stringify(batch.rows[0].json));
  console.log("DITERAPKAN.");
} else {
  console.log("Belum diterapkan. Jalankan ulang dengan --apply kalau sudah cocok.");
}

await c.end();