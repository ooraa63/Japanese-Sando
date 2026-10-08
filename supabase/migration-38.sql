-- ============================================================================
-- MIGRATION 38 — Buang RPC yang sudah tidak dipakai (sisa model lama)
-- ============================================================================
-- Semua fungsi di bawah sudah DIVERIFIKASI tidak ada yang memanggilnya:
--   - 0 pemanggil di dalam database (dicek lewat `scripts/check-fn-usage.js`
--     yang mencari penyebut nama fungsi di body `pg_proc.prosrc`)
--   - 0 objek dependen (view/trigger/constraint) — `pg_depend` kosong
--   - 0 pemanggil dari kode aplikasi `src/`
--
-- 1) customer_upsert_own_profile(text, text, text)
--    Versi 3-argumen yang dibuat sebelum kolom `date_of_birth` ada
--    (lihat migration-16). Aplikasi selalu memanggil versi 4-argumen yang
--    menerima `p_date_of_birth` — lihat `src/app/account/actions.ts`.
--    Overload mati ini cuma bikin ambigu saat baca PostgREST.
--
-- 2) + 3) admin_set_stock(integer, text) dan admin_set_stock(bigint, integer, text)
--    Sisa dari model stok "global" / "per-flavor". Stok yang sebenarnya
--    dipakai `create_order` — dan yang dibaca pembeli di halaman /order —
--    ada di `categories.stock`, diurus lewat `admin_set_category_stock()`.
--    Kolom yang ditulis kedua fungsi ini (`store_settings.total_stock` dan
--    `flavors.stock`) sudah tidak dibaca siapa pun di aplikasi.
--
-- Idempoten: `if exists` membuat file ini aman di-run berulang.
-- Kalau ternyata ada yang memanggilnya, PostgreSQL akan menolak DROP-nya
-- (ada dependency) — bukan diam-diam merusak.
-- ============================================================================


-- 1) Overload lama profil customer (tanpa tanggal lahir).
drop function if exists public.customer_upsert_own_profile(text, text, text);


-- 2) Set stok global (sisa model lama).
drop function if exists public.admin_set_stock(integer, text);


-- 3) Set stok per-flavor (sisa model lama).
drop function if exists public.admin_set_stock(bigint, integer, text);


notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');