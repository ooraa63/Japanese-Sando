-- ============================================================================
-- MIGRASI 23 — Signup validation: 1 email + 1 phone hanya
-- ----------------------------------------------------------------------------
-- Mencegah pendaftaran ganda lewat dua sisi:
--
--   1. auth.users.email sudah UNIQUE di level database — Supabase Auth
--      akan menolak signup kedua dengan error "already registered". Pesan
--      sudah diteruskan ke `email_taken` di account/actions.ts.
--
--   2. customer_profiles.phone_normalized sekarang UNIQUE (lihat migration-22).
--      Tambahkan `is_phone_available(p_phone)` RPC publik untuk pre-check
--      sebelum signup, supaya user dapat pesan "Nomor telepon sudah dipakai"
--      daripada signup sukses lalu profil gagal dibuat.
--
-- Skema: fungsi `is_phone_available` mengembalikan false bila ada
-- customer_profiles dengan phone_normalized identik (selain dirinya sendiri
-- via parameter p_exclude_user_id, opsional).
-- ============================================================================

create or replace function public.is_phone_available(
  p_phone text,
  p_exclude_user_id uuid default null
) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.customer_profiles
    where phone_normalized = public.normalize_phone(p_phone)
      and (p_exclude_user_id is null or user_id <> p_exclude_user_id)
  );
$$;

-- Grant akses ke anon & authenticated (boleh panggil sebelum login).
grant execute on function public.is_phone_available(text, uuid) to anon, authenticated;

comment on function public.is_phone_available(text, uuid) is
  'True kalau phone (setelah normalize_phone) belum dipakai customer_profile lain. Pre-check signup.';

-- ---------------------------------------------------------------------------
-- Trigger: tolak insert/update customer_profiles yang phone_normalized
-- bentrok dengan baris existing. Idempoten — kalau ada duplikat dari sesi
-- sebelumnya, trigger ini akan raise sehingga DB menolak.
-- ---------------------------------------------------------------------------
create or replace function public.customer_profiles_guard_phone_unique()
returns trigger
language plpgsql
as $$
begin
  -- Normalisasi selalu di-set oleh trigger sebelumnya (sebelum insert/update of phone).
  -- Kita validasi ulang supaya idempoten.
  if new.phone_normalized is null or btrim(new.phone_normalized) = '' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  -- Tolak insert kalau ada baris lain dgn phone_normalized identik.
  if exists (
    select 1 from public.customer_profiles
    where phone_normalized = new.phone_normalized
      and user_id <> new.user_id
  ) then
    raise exception 'phone_already_registered' using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customer_profiles_guard_phone_unique
  on public.customer_profiles;

create trigger trg_customer_profiles_guard_phone_unique
  before insert or update of phone, phone_normalized on public.customer_profiles
  for each row
  execute function public.customer_profiles_guard_phone_unique();