-- ============================================================================
-- MIGRASI 27 — Profil selesai tanpa customer lengkap (Google OAuth)
-- ----------------------------------------------------------------------------
-- Setelah migrasi 26, customer_bootstrap_from_metadata() raise exception
-- 'invalid_phone' kalau raw_user_meta_data tidak punya field `phone` —
-- persis seperti yang terjadi untuk user pertama kali login via Google
-- OAuth. Akibatnya, customer_profiles row tidak pernah dibuat, /account
-- tidak bisa load, dan user harus isi ulang semuanya via form signup.
--
-- Solusi:
--   1. customer_profiles.phone dibuat nullable (untuk OAuth users yang
--      belum melengkapi).
--   2. customer_bootstrap_from_metadata() pakai Google `name`/`full_name`
--      kalau ada di user_metadata, dan kalau phone tetap kosong → insert
--      row dengan phone NULL (placeholder).
--   3. customer_upsert_own_profile() TETAP require phone (form signup
--      selalu minta nomor, jadi tidak ada jalan memintas).
-- ============================================================================

-- 1. Phone jadi nullable. Index lama (yang pakai normalize_phone) tetep ada;
-- tapi sekarang bisa ada baris dengan phone NULL, yang ekspektasi oleh index.
alter table public.customer_profiles
  alter column phone drop not null;


-- 2. Bootstrap lebih toleran. Kalau phone tidak ada di user_metadata,
--    insert row dengan phone NULL (placeholder). Halaman /account akan
--    mendeteksi profile.phone=null dan tampilkan form "Lengkapi profil"
--    yang wajib isi phone + IG (opsional) sebelum lanjut.
create or replace function public.customer_bootstrap_from_metadata()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_meta       jsonb;
  v_full_name  text;
  v_phone      text;
  v_instagram  text;
  v_dob_text   text;
  v_dob        date;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '22023';
  end if;

  -- Kalau profil sudah ada, return existing — tidak double-write.
  if exists (select 1 from public.customer_profiles where user_id = v_user_id) then
    return public.customer_profile();
  end if;

  -- Ambil dari raw_user_meta_data (di-set saat auth.signUp options.data).
  select raw_user_meta_data into v_meta
  from auth.users
  where id = v_user_id;

  -- Name fallback: signup pakai 'full_name', Google pakai 'name' atau
  -- 'full_name' (tergantung setup). Pakai yang pertama yang non-empty.
  v_full_name := coalesce(
    nullif(trim(coalesce(v_meta ->> 'full_name', '')), ''),
    nullif(trim(coalesce(v_meta ->> 'name', '')), '')
  );

  v_instagram := nullif(trim(coalesce(v_meta ->> 'instagram', '')), '');
  v_dob_text  := nullif(trim(coalesce(v_meta ->> 'date_of_birth', '')), '');
  -- Phone boleh NULL setelah migrasi ini — placeholder untuk OAuth user
  -- yang nanti diminta isi lewat form "Lengkapi profil" di /account.
  v_phone     := nullif(trim(coalesce(v_meta ->> 'phone', '')), '');

  if v_dob_text is not null then
    begin
      v_dob := v_dob_text::date;
    exception when others then
      v_dob := null;
    end;
  end if;

  -- Nama WAJIB ada — Google selalu mengirimnya. Kalau tidak, ada yang
  -- salah dengan akun, tolak.
  if v_full_name is null or length(v_full_name) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  insert into public.customer_profiles (user_id, full_name, phone, instagram, date_of_birth)
  values (v_user_id, v_full_name, v_phone, v_instagram, v_dob);

  return public.customer_profile();
end;
$$;


-- 3. customer_upsert_own_profile TETAP require phone — dipakai dari
--    form signup dan form "Lengkapi profil" di /account. Kalau ada
--    tempat yang mau insert tanpa phone, pakai bootstrap dari metadata.
-- (Tidak ada perubahan — hanya doc comment.)
comment on function public.customer_upsert_own_profile(text, text, text, date) is
  'Customer: insert/update profil sendiri. Phone REQUIRED (pakai bootstrap untuk OAuth).';


-- 4. RPC helper — apakah profile customer saat ini perlu dilengkapi?
--    Return true kalau login tapi phone kosong.
create or replace function public.customer_profile_needs_completion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and not exists (
      select 1 from public.customer_profiles
      where user_id = auth.uid() and phone is not null
    );
$$;

grant execute on function public.customer_profile_needs_completion() to authenticated;


comment on function public.customer_bootstrap_from_metadata() is
  'Customer: bootstrap profil dari raw_user_meta_data (signup + Google OAuth). Phone opsional.';