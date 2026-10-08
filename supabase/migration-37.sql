-- ============================================================================
-- MIGRATION 37 — QRIS expire dijalankan per menit lewat pg_cron (bawaan DB)
-- ============================================================================
-- Kenapa bukan Vercel Cron?
--   Project ini di plan Hobby, dan Hobby membatasi cron jadi maksimal 2x
--   SEHARI. Jadwal `* * * * *` (tiap menit) tidak akan pernah dipicu, jadi
--   order QRIS unpaid bisa menggantung berjam-jam sebelum di-expire.
--
--   Solusi gratis: `pg_cron` bawaan Supabase, yang jalan DI DALAM database
--   tiap menit tanpa batas plan dan tanpa butuh serverless.
--
--   Route `/api/cron/qris-expire` tetap ada untuk pemicu manual / tes.
--
-- Catatan: `create extension` dan `cron.schedule()` harus dipanggil sebagai
-- statement biasa di level atas. Kalau dibungkus blok DO, PostgreSQL gagal
-- parse (sudah dicoba: `syntax error at or near "cron"`).
-- ============================================================================


create extension if not exists pg_cron;


-- Hapus job lama dulu supaya file ini aman di-run berulang (tidak jadi
-- daftar job ganda). `where` kosong = tidak ada, `cron.unschedule` aman dipanggil
-- walau tabel cron.job belum ada.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'qris-expire';


-- Daftarkan ulang: tiap menit, panggil RPC expire.
select cron.schedule(
  'qris-expire',
  '* * * * *',
  $$select public.expire_stale_qris_orders();$$
);


notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');