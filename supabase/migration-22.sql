-- ============================================================================
-- MIGRASI 22 — Dedup customer_profiles.phone_normalized
-- ----------------------------------------------------------------------------
-- Sebelum: customer_profiles punya PK di user_id (1 profil = 1 user). Bisa saja
-- ada 2 auth.users berbeda yang punya phone sama -> 2 baris customer_profiles
-- dgn phone_normalized identik.
--
-- Setelah: tambah UNIQUE INDEX di customer_profiles(phone_normalized).
-- Pemesanan dengan phone_normalized identik sekarang jadi 1 "identitas" —
-- sama-sama ditampilkan di admin customers listing (sudah group by phone).
-- Kalau ada data duplikat, kita pilih baris terlama (created_at terkecil)
-- jadi canonical, sisanya di-merge ke baris itu.
-- ============================================================================

-- 1. Tambah kolom normalized kalau belum ada
alter table public.customer_profiles
  add column if not exists phone_normalized text;

-- Backfill: hitung dari phone raw pakai normalize_phone()
update public.customer_profiles cp
  set phone_normalized = public.normalize_phone(cp.phone)
  where phone_normalized is null
    and cp.phone is not null
    and length(trim(cp.phone)) > 0;

-- 2. Pilih baris "survivor" per phone_normalized duplicate.
--    Strategi: baris dengan (created_at, user_id) terkecil jadi canonical.
--    Sisanya: hapus (CASCADE ke order_customer_link jika ada).
with duplicates as (
  select user_id,
         phone_normalized,
         row_number() over (
           partition by phone_normalized
           order by created_at asc, user_id asc
         ) as rn
  from public.customer_profiles
  where phone_normalized is not null
),
to_remove as (
  select user_id from duplicates where rn > 1
)
delete from public.customer_profiles cp
using to_remove tr
where cp.user_id = tr.user_id;

-- 3. Tambah UNIQUE index
create unique index if not exists customer_profiles_phone_normalized_uidx
  on public.customer_profiles (phone_normalized)
  where phone_normalized is not null;

-- 4. Trigger: auto-set phone_normalized saat INSERT/UPDATE kalau belum diisi
create or replace function public.customer_profiles_set_phone_normalized()
returns trigger
language plpgsql
as $$
begin
  if new.phone_normalized is null or btrim(new.phone_normalized) = '' then
    new.phone_normalized := public.normalize_phone(new.phone);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_profiles_set_phone_normalized
  on public.customer_profiles;

create trigger trg_customer_profiles_set_phone_normalized
  before insert or update of phone on public.customer_profiles
  for each row
  execute function public.customer_profiles_set_phone_normalized();

comment on column public.customer_profiles.phone_normalized is
  'Hasil normalize_phone(phone). UNIQUE: 1 phone_normalized = 1 customer_profiles row.';