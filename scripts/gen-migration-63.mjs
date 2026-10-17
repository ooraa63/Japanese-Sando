/**
 * GENERATOR migration-63 — `track_by_code` mengembalikan paket ganda.
 *
 * Sumber kebenaran adalah definisi fungsi LIVE di database (pola yang sama
 * dengan migration-61 dan -62).
 *
 *   node scripts/gen-migration-63.mjs          # tulis file, jangan terapkan
 *   node scripts/gen-migration-63.mjs --apply  # tulis lalu terapkan
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const APPLY = process.argv.includes("--apply");
const OUT = path.resolve(process.cwd(), "supabase/migration-63.sql");

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

/** Potongan `bundles` yang salah, persis seperti yang ada di database. */
const LAMA = `      'bundles', (
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'bundle_id', bi.bundle_id,
            'bundle_name', b.name_id,
            'slots', (
              select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              from (
                select bi2.slot as slot, oi2.flavor_name, bi2.flavor_id
                from public.bundle_items bi2
                join public.order_items oi2 on oi2.order_id = bi2.order_id and oi2.flavor_id = bi2.flavor_id
                where bi2.order_id = ord.id and bi2.bundle_id = bi.bundle_id
                order by bi2.slot
              ) s
            )
          ) as b
          from public.bundle_items bi
          join public.bundles b on b.id = bi.bundle_id
          where bi.order_id = ord.id
          order by bi.bundle_id
        ) sub
      )`;

/**
 * Perbaikannya:
 *
 *  1. Satu objek JSON per PAKET. Versi lama selects dari `bundle_items`
 *     tanpa `group by`, jadi satu paket dua slot menghasilkan DUA objek
 *     yang identik. Di halaman lacak pesanan paket "Sando 2" tampil dua kali
 *     (Rp 35.000 + Rp 35.000), padahal total pesanan tetap benar karena
 *     subtotal dihitung dari `orders`, bukan dari daftar ini.
 *     Bug ini tersembunyi selama ini karena `TrackForm` tidak pernah
 *     merender `bundles`; ia cuma memakai `flat_items`.
 *
 *  2. Nama slot diambil dari tabel `flavors`, bukan dari
 *     `order_items.flavor_name`. Kolom itu menyimpan sufiks internal
 *     ("Cookies & Cream (Sando 2 #1)") untuk pembukuan, dan
 *     `public_invoice` sudah sejak awal mengambil nama bersih dari
 *     `flavors`. Sekarang keduanya sama.
 *
 *  3. `bundle_name` ikut bahasa pesanan (`name_en` / `name_id`), sama seperti
 *     `public_invoice`. Versi lama selalu `name_id`, jadi pembeli yang
 *     membaca dalam bahasa Inggris melihat nama paket bahasa Indonesia.
 */
const BARU = `      'bundles', (
        -- Migration-63: satu objek JSON per PAKET, bukan satu per slot, dan
        -- nama slot diambil dari tabel \`flavors\` supaya sufiks internal
        -- "(Sando 2 #1)" tidak ikut terbawa ke pembeli. Lihat header file.
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'bundle_id', bu.id,
            'bundle_name', case when ord.language = 'en' then bu.name_en else bu.name_id end,
            'slots', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'slot', bi2.slot,
                  'flavor_id', bi2.flavor_id,
                  'flavor_name', case when ord.language = 'en' then f.name_en else f.name_id end
                ) order by bi2.slot
              ), '[]'::jsonb)
              from public.bundle_items bi2
              join public.flavors f on f.id = bi2.flavor_id
              where bi2.order_id = ord.id and bi2.bundle_id = bu.id
            )
          ) as b
          from (
            select distinct bundle_id from public.bundle_items where order_id = ord.id
          ) bi
          join public.bundles bu on bu.id = bi.bundle_id
          order by bu.id
        ) sub
      )`;

const HEADER = `-- ============================================================================
-- Migration 63 - track_by_code tidak lagi mengembalikan paket dua kali
-- Dijalankan: 17-10-2026, ketemu saat verifying tampilan pesanan atas laporan
-- Steven soal "(Sando 2 #1)".
--
-- MASALAH
--   Bagian \`bundles\` di \`track_by_code()\` menyeleksi dari \`bundle_items\`
--   tanpa \`group by\`, jadi satu paket dua slot ("Sando 2") menghasilkan DUA
--   objek JSON yang identik. Di halaman lacak pesanan (dan halaman sukses
--   yang memakai RPC ini) paketnya tampil dua kali.
--
--   Nama slotnya juga diambil dari \`order_items.flavor_name\`, yang menyimpan
--   sufiks internal "(Sando 2 #1)". \`public_invoice()\` sejak awal mengambil
--   nama bersih dari tabel \`flavors\`, jadi dua RPC itu tidak konsisten.
--
-- PERBAIKAN
--   1. Satu objek JSON per paket (pakai \`select distinct bundle_id\`).
--   2. Nama slot dari \`flavors.name_id\` / \`name_en\`.
--   3. \`bundle_name\` ikut bahasa pesanan, sama seperti \`public_invoice()\`.
--
-- CATATAN
--   \`flat_items\` SENGAJA dibiarkan apa adanya, termasuk sufiks slotnya.
--   Sisi frontend membersihkan sufiks itu sendiri di \`src/lib/order-items.ts\`
--   supaya pesanan lama (yang sudah tersimpan dengan sufiks) juga ikut bersih
--   tanpa perlu menulis ulang data.
--
-- DIHASILKAN OLEH: scripts/gen-migration-63.mjs (dari definisi fungsi live)
-- ============================================================================
`;

/** `pg_get_functiondef()` tidak menutup definisinya dengan titik koma. */
const titikKoma = (sql) => `${sql.trimEnd().replace(/;+$/, "")};`;

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const live = await c.query(
  `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'track_by_code'
      and pg_get_function_identity_arguments(p.oid) = 'p_code text, p_phone text'`,
);
if (live.rowCount !== 1) throw new Error("track_by_code(text, text) tidak ditemukan.");
const def = live.rows[0].def;

const jumlah = def.split(LAMA).length - 1;
if (jumlah !== 1) {
  throw new Error(
    `Potongan 'bundles' ditemukan ${jumlah} kali (harus tepat 1). Isi live mungkin sudah berubah — cek ulang.`,
  );
}
if (def.includes("select distinct bundle_id from public.bundle_items")) {
  throw new Error("track_by_code sudah pakai versi yang diperbaiki.");
}

const isi = HEADER + "\n" + titikKoma(def.split(LAMA).join(BARU)) + "\n\n-- grants tidak berubah: CREATE OR REPLACE mempertahankan ACL.\n";
const isiRapi = isi.replace(/\r\n/g, "\n");
writeFileSync(OUT, isiRapi, "utf8");
console.log(`Ditulis: ${OUT} (${isiRapi.split("\n").length} baris, EOL LF)`);

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
  const cek = await c.query(`select public.track_by_code($1, $2) as json`, [
    process.env.CEK_KODE || "RK-261014-055",
    process.env.CEK_HP || "089614128890",
  ]);
  console.log("  bundles ->", JSON.stringify(cek.rows[0].json.bundles, null, 2));
  console.log("DITERAPKAN.");
} else {
  console.log("Belum diterapkan. Jalankan ulang dengan --apply kalau sudah cocok.");
}

await c.end();