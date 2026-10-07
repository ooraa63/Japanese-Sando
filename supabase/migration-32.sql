-- ============================================================================
-- MIGRASI 32 — Multi-pickup locations
-- ----------------------------------------------------------------------------
-- Sebelumnya `delivery_zones` table cuma untuk zona delivery (fee, lat/lng,
-- radius). Pickup cuma satu opsi hardcoded "Ambil di toko" (delivery_method
-- enum 'pickup').
--
-- Steven mau: "Ambil di toko" bisa punya beberapa lokasi (mis. Rumah Sushi,
-- UVERS, dll) — admin nentuin di web admin.
--
-- Approach: tambah kolom `kind` ('delivery' | 'pickup') ke delivery_zones.
-- Kolom existing di-default 'delivery' biar backward-compat aman. Admin bisa
-- tambah zona baru dengan kind='pickup' via admin UI yang sudah ada.
--
-- Setelah migration: seed 2 contoh lokasi (Rumah Sushi, UVERS pickup) supaya
-- /order bisa pilih dari beberapa opsi pickup out-of-the-box. Steven bisa
-- edit/add/hapus via admin UI nanti.
-- ============================================================================

-- 1. Tambah kolom kind
alter table public.delivery_zones
  add column if not exists kind text not null default 'delivery'
    check (kind in ('delivery', 'pickup'));

comment on column public.delivery_zones.kind is
  'delivery = zona antaran (fee dihitung). pickup = lokasi pengambilan barang
   (fee selalu 0). Migration-32.';

-- 3. Seed 2 lokasi pickup contoh (idempotent)
insert into public.delivery_zones
  (id, name_id, name_en, fee, lat, lng, radius_km, requires_address, sort_order, is_active, kind)
values
  ('pickup-rumah', 'Rumah Sushi', 'Rumah Sushi', 0, -6.917, 107.619, null, false, 100, true, 'pickup'),
  ('pickup-uvers', 'UVERS',       'UVERS',       0, -6.917, 107.600, null, false, 101, true, 'pickup')
on conflict (id) do update
  set kind = excluded.kind,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      name_id = excluded.name_id,
      name_en = excluded.name_en;

-- 4. Update public_list_zones untuk expose 'kind' (kalau ada) — admin UI perlu
-- tahu zona ini delivery atau pickup untuk render picker yang sesuai.
-- Cek dulu signature function.
do $outer$
declare
  v_args text;
begin
  select pg_get_function_arguments(pg_proc.oid) into v_args
    from pg_proc
    join pg_namespace n on n.oid = pg_proc.pronamespace
   where proname = 'public_list_zones' and n.nspname = 'public';

  if v_args not like '%kind%' then
    -- Recreate RPC dengan kolom kind. DROP dulu karena return type beda.
    execute $inner$
      drop function if exists public.public_list_zones();
    $inner$;
    execute $inner$
      create function public.public_list_zones()
      returns table (
        id text, name_id text, name_en text, fee int,
        lat double precision, lng double precision,
        radius_km double precision, requires_address boolean,
        sort_order int, kind text
      )
      language sql
      stable
      security definer
      set search_path = public
      as $body$
        select z.id, z.name_id, z.name_en, z.fee, z.lat, z.lng,
               z.radius_km, z.requires_address, z.sort_order, z.kind
          from public.delivery_zones z
         where z.is_active
         order by z.kind asc, z.sort_order asc, z.id asc
      $body$;
    $inner$;
  end if;
end $outer$;

-- 5. Sama untuk admin_list_zones — tambah kind kalau belum ada.
do $outer2$
declare
  v_args text;
begin
  select pg_get_function_arguments(pg_proc.oid) into v_args
    from pg_proc
    join pg_namespace n on n.oid = pg_proc.pronamespace
   where proname = 'admin_list_zones' and n.nspname = 'public';

  if v_args not like '%kind%' then
    execute $inner2$
      drop function if exists public.admin_list_zones();
    $inner2$;
    execute $inner2$
      create function public.admin_list_zones()
      returns table (
        id text, name_id text, name_en text, fee int,
        lat double precision, lng double precision,
        radius_km double precision, requires_address boolean,
        sort_order int, is_active boolean, created_at timestamptz, kind text
      )
      language sql
      stable
      security definer
      set search_path = public
      as $body2$
        select z.id, z.name_id, z.name_en, z.fee, z.lat, z.lng,
               z.radius_km, z.requires_address, z.sort_order,
               z.is_active, z.created_at, z.kind
          from public.delivery_zones z
         order by z.kind asc, z.sort_order asc, z.id asc
      $body2$;
    $inner2$;
  end if;
end $outer2$;