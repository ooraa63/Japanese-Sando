-- =============================================================================
--  PERBAIKAN LOGIN DASHBOARD
-- =============================================================================
--  CARA PAKAI:
--  1. Buka Supabase Dashboard  ->  project kamu  ->  SQL Editor  ->  New query
--  2. Tempel SELURUH isi file ini
--  3. Klik Run
--  4. Buka lagi http://localhost:3000/admin/login
--
--  MASALAHNYA:
--  Tabel `auth.users` (dan tabel auth lainnya) memakai Row Level Security.
--  GoTrue -- layanan yang mengecek email & password -- konek ke database
--  memakai role `supabase_auth_admin`.
--
--  Di project Supabase yang benar, role itu punya hak BYPASSRLS sehingga
--  bisa membaca & menulis tabel auth tanpa dibatasi policy.
--  Di project ini hak itu hilang, sehingga setiap percobaan login gagal
--  dengan error 500 "Database error querying schema".
--
--  Perbaikan: kembalikan hak BYPASSRLS role tersebut.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- LANGKAH 1: Lihat kondisi sekarang (untuk pembuktian)
-- ---------------------------------------------------------------------------
select rolname,
       rolsuper                as "superuser",
       rolbypassrls            as "bypass_rls",
       rolcanlogin             as "bisa_login"
from pg_roles
where rolname = 'supabase_auth_admin';

-- Hasil yang salah:
--   supabase_auth_admin | superuser=false | bypass_rls=FALSE  <-- penyebab masalah
-- Hasil yang benar:
--   supabase_auth_admin | superuser=false | bypass_rls=true


-- ---------------------------------------------------------------------------
-- LANGKAH 2: Perbaiki
-- ---------------------------------------------------------------------------
-- Jalankan hanya baris di bawah ini.
alter role supabase_auth_admin bypassrls;


-- ---------------------------------------------------------------------------
-- LANGKAH 3: Pastikan sudah berhasil
-- ---------------------------------------------------------------------------
select rolname,
       rolbypassrls as "bypass_rls"
from pg_roles
where rolname = 'supabase_auth_admin';

-- Harus muncul: bypass_rls = true


-- ---------------------------------------------------------------------------
-- LANGKAH 4 (opsional tapi disarankan): bersihkan cache PostgREST
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
select 'selesai' as status;
