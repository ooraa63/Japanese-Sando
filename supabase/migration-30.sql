-- ============================================================================
-- MIGRASI 30 — Restore customer_profiles.date_of_birth + fix trigger order
-- ----------------------------------------------------------------------------
-- Diagnosis 2026-10-07:
--   (a) Tabel customer_profiles di production DB GAK PUNYA kolom date_of_birth.
--       Padahal semua RPC dari migration-16 / 29 (customer_upsert_own_profile,
--       customer_bootstrap_from_metadata) INSERT ke kolom date_of_birth.
--       Akibat: signup/profile creation selalu raise "column date_of_birth
--       does not exist" (SQLSTATE 42703). /account break-back, UI nampilin
--       "generic".
--   (b) Trigger `trg_customer_profiles_guard_phone_unique` asumsi trigger
--       `trg_customer_profiles_set_phone_normalized` fire lebih dulu (lihat
--       comment di migration-23: "Normalisasi selalu di-set oleh trigger
--       sebelumnya"). Postgres BEFORE triggers fire alphabetical: 'guard' (G)
--       < 'set' (S). Jadi guard fire lebih dulu → phone_normalized masih NULL
--       → raise 'invalid_phone' walaupun phone valid. Baru kelihatan setelah
--       (a) di-fix karena RPC nya selalu fail duluan di (a).
--
-- Akar masalah (a): kolom date_of_birth di-drop dari DB di suatu titik tanpa
-- nyanggun SQL drop migration. Schema.sql lama snapshot sebelum migration-16
-- mungkin dipakai sebagai basis.
--
-- Fix:
--   1. ADD COLUMN date_of_birth date CHECK (... <= current_date) IF NOT EXISTS.
--   2. Backfill date_of_birth dari raw_user_meta_data auth.users untuk row
--      yang sudah ada (kalau metadata berisi ISO date valid).
--   3. Update trigger customer_profiles_guard_phone_unique supaya
--      self-sufficient: hitung phone_normalized sendiri kalau belum di-set.
--      Idempotent terhadap fire-order, gak bergantung trigger lain.
-- ============================================================================

-- (1) Restore kolom date_of_birth
alter table public.customer_profiles
  add column if not exists date_of_birth date
    check (date_of_birth <= current_date);

-- (2) Backfill dari user_metadata untuk row yang sudah ada
update public.customer_profiles cp
   set date_of_birth = (au.raw_user_meta_data ->> 'date_of_birth')::date
  from auth.users au
 where au.id = cp.user_id
   and cp.date_of_birth is null
   and au.raw_user_meta_data ->> 'date_of_birth' is not null
   and (au.raw_user_meta_data ->> 'date_of_birth') ~ '^\d{4}-\d{2}-\d{2}$';

-- (3) Self-sufficient trigger: hitung phone_normalized sendiri kalau NULL
create or replace function public.customer_profiles_guard_phone_unique()
returns trigger
language plpgsql
as $$
begin
  -- Postgres BEFORE triggers fire alphabetical. 'guard' (G) < 'set' (S),
  -- jadi trigger ini fire lebih dulu dari trg_customer_profiles_set_phone_
  -- normalized. Normalisasi di sini supaya guard gak bergantung fire-order.
  if new.phone_normalized is null or btrim(new.phone_normalized) = '' then
    new.phone_normalized := public.normalize_phone(new.phone);
  end if;

  -- Kalau masih kosong setelah normalisasi → phone invalid.
  if new.phone_normalized is null or btrim(new.phone_normalized) = '' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  -- Tolak insert/update kalau phone_normalized bentrok dengan baris lain.
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

comment on column public.customer_profiles.date_of_birth is
  'Tanggal lahir customer. Nullable. Validasi usia minimum dilakukan di UI
   (CompleteProfileCard, signup form). Migration-30: kolom ini sempat hilang
   dari DB padahal semua RPC reference-nya, menyebabkan signup/login /account
   stuck. Restore via ADD COLUMN IF NOT EXISTS.';

comment on function public.customer_profiles_guard_phone_unique() is
  'Trigger BEFORE: tolak insert/update kalau phone_normalized bentrok baris
   lain. Self-sufficient: hitung phone_normalized dari phone via
   normalize_phone() kalau belum di-set, supaya gak bergantung fire-order
   dari trg_customer_profiles_set_phone_normalized. Migration-30.';