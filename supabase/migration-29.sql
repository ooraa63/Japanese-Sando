-- ============================================================================
-- MIGRASI 29 — Revert Google OAuth quirks (migration-27)
-- ----------------------------------------------------------------------------
-- Migration-27 dibuat untuk support Google OAuth: customer_profiles.phone
-- jadi nullable + RPC helper customer_profile_needs_completion().
--
-- Setelah konsultasi user, Google OAuth DIHAPUS total — site pakai single
-- signup/login flow (email + password + identitas lengkap di /register).
-- Migration-29 revert efek migration-27:
--
--   1. customer_profiles.phone jadi NOT NULL lagi.
--   2. customer_bootstrap_from_metadata() raise 'invalid_phone' kalau
--      user_metadata.phone kosong (strict, gak bisa insert NULL).
--   3. DROP customer_profile_needs_completion() — gak dipakai lagi.
--
-- Hatikan: kalau ada customer_profiles row dengan phone IS NULL di database
-- (sisa testing Google OAuth sebelumnya), migration ini akan GAGAL karena
-- ALTER COLUMN NOT NULL gak bisa apply ke baris existing yang violate.
-- Sebelum apply, run dulu:
--
--   delete from public.customer_profiles where phone is NULL;
--
-- ============================================================================

-- 1. Hapus rows lama yang violate constraint baru (kalau ada dari Google OAuth).
delete from public.customer_profiles where phone is null;

-- 2. Kembalikan phone jadi NOT NULL.
alter table public.customer_profiles
  alter column phone set not null;

-- 3. Bootstrap lagi strict: kalau phone gak ada di user_metadata, raise.
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

  v_full_name := nullif(trim(coalesce(v_meta ->> 'full_name', '')), '');
  v_dob_text   := nullif(trim(coalesce(v_meta ->> 'date_of_birth', '')), '');
  v_instagram := nullif(trim(coalesce(v_meta ->> 'instagram', '')), '');
  v_phone     := nullif(trim(coalesce(v_meta ->> 'phone', '')), '');

  if v_dob_text is not null then
    begin
      v_dob := v_dob_text::date;
    exception when others then
      v_dob := null;
    end;
  end if;

  -- Validasi ketat: gak ada toleran ke field kosong. Signup manual di
  -- /register memvalidasi semua field sebelum insert.
  if v_full_name is null or length(v_full_name) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_phone is null or length(v_phone) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  insert into public.customer_profiles (user_id, full_name, phone, instagram, date_of_birth)
  values (v_user_id, v_full_name, v_phone, v_instagram, v_dob);

  return public.customer_profile();
end;
$$;

grant execute on function public.customer_bootstrap_from_metadata() to authenticated;

comment on function public.customer_bootstrap_from_metadata() is
  'Customer: bootstrap profil dari raw_user_meta_data. Name + phone WAJIB (strict, no OAuth workaround).';


-- 4. Drop RPC helper yang gak dipakai lagi.
drop function if exists public.customer_profile_needs_completion();