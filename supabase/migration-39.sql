-- ============================================================================
-- MIGRASI 39 — Catatan Pengambilan & Pengiriman (item 10 dokumen
--               "Perbaikan Ruma Komugi 2")
-- ----------------------------------------------------------------------------
-- Steven:
--   "Yang zona ini masuk ke menu catatan pengambilan dan pengiriman"
--   "Untuk yang Nanti tentukan zona saya mau ada 2 bar. 1. Ambil di toko dan
--    nanti kita bisa buat zona dimana toko kita, dan ada catatan juga jadi tau
--    ambil jam berapa. 2. Pengantaran, nah sama juga bisa buat zona pengiriman"
--
-- Migration-32 SUDAH menambah kolom `kind` ('delivery' | 'pickup') ke
-- `delivery_zones` dan men-seed 2 titik pickup. Tapi ada 2 lubang:
--
--   A. `admin_upsert_zone` tidak pernah membaca/menulis kolom `kind`.
--      Konsekuensinya admin TIDAK bisa membuat titik toko baru dari UI —
--      zona baru selalu default jadi 'delivery'. (Kolom `kind` yang ada di
--      tipe TypeScript cuma diisi dari sisi server, tidak bisa disimpan.)
--
--   B. `list_active_zones` tidak mengembalikan kolom `kind`, padahal
--      `src/app/order/page.tsx` -&gt; `OrderFlow` memfilter lokasi pengambilan
--      dengan `z.kind === "pickup"`. Akibatnya picker "Lokasi pengambilan"
--      di halaman pesanan TIDAK PERNAH muncul untuk pembeli sungguhan.
--      Ini bukan teoritis — sudah diverifikasi lewat RPC.
--
-- Migration ini menutup keduanya dan menambah catatan per titik (dipakai
-- untuk jam ambil), TANPA membuat tabel baru: `delivery_zones` sudah
-- distinggikan oleh `kind`, jadi tabel terpisah hanya akan menduplikasi
-- data dan membuat sisi pembeli harus membaca dua sumber.
--
-- Idempotent — aman dijalankan ulang.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Catatan per titik (jam ambil, dsb). Dipakai terutama untuk kind='pickup'.
-- ---------------------------------------------------------------------------
alter table public.delivery_zones
  add column if not exists note_id text,
  add column if not exists note_en text;

comment on column public.delivery_zones.note_id is
  'Catatan yang dilihat pembeli — mis. jam ambil. Dipakai untuk titik pengambilan (kind=pickup). Migration-39.';
comment on column public.delivery_zones.note_en is
  'English version of note_id. Migration-39.';

-- ---------------------------------------------------------------------------
-- 2. list_active_zones — expose `kind` + catatan.
--
-- Dipanggil dari sisi pembeli (anon), jadi harus tetap stabil & tanpa auth.
-- `lat`/`lng` sengaja dikembalikan sebagai text (perilaku lama, dipakai
-- `Number(...)` di src/app/order/page.tsx).
--
-- Return type berubah => `create or replace` tidak cukup, harus drop dulu.
-- Grant harus diulang karena drop juga menghapus ACL.
-- ---------------------------------------------------------------------------
drop function if exists public.list_active_zones();

create or replace function public.list_active_zones()
returns table (
  id text,
  name_id text,
  name_en text,
  fee integer,
  lat text,
  lng text,
  radius_km text,
  requires_address boolean,
  kind text,
  note_id text,
  note_en text
)
language sql
stable
security definer
set search_path = public
as $body$
  select
    z.id::text,
    z.name_id::text,
    z.name_en::text,
    z.fee::integer,
    z.lat::text,
    z.lng::text,
    z.radius_km::text,
    z.requires_address,
    z.kind::text,
    z.note_id::text,
    z.note_en::text
  from public.delivery_zones z
  where z.is_active
  order by
    -- 'delivery' < 'pickup' secara alfabetis, jadi zona antaran tampil dulu
    -- supaya urutan di UI admin/pembeli tetap masuk akal.
    case z.kind when 'delivery' then 0 else 1 end,
    z.sort_order asc,
    z.id asc;
$body$;

revoke all on function public.list_active_zones() from public;
grant execute on function public.list_active_zones()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. admin_list_zones — sama, tambah `kind` + catatan.
-- (Sudah ada `kind` sejak 32; sekarang catatan ikut serta.)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_zones();

create or replace function public.admin_list_zones()
returns table (
  id text,
  name_id text,
  name_en text,
  fee integer,
  lat double precision,
  lng double precision,
  radius_km double precision,
  requires_address boolean,
  sort_order integer,
  is_active boolean,
  created_at timestamptz,
  kind text,
  note_id text,
  note_en text
)
language sql
stable
security definer
set search_path = public
as $body$
  select
    z.id::text,
    z.name_id::text,
    z.name_en::text,
    z.fee::integer,
    z.lat::double precision,
    z.lng::double precision,
    z.radius_km::double precision,
    z.requires_address::boolean,
    z.sort_order::integer,
    z.is_active::boolean,
    z.created_at::timestamptz,
    z.kind::text,
    z.note_id::text,
    z.note_en::text
  from public.delivery_zones z
  order by
    case z.kind when 'delivery' then 0 else 1 end,
    z.sort_order asc,
    z.id asc;
$body$;

revoke all on function public.admin_list_zones() from public;
grant execute on function public.admin_list_zones()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. admin_upsert_zone — INI PERBAIKAN UTAMA.
--
-- Sebelumnya `kind` tidak pernah disentuh, jadi:
--   - zona baru dari UI admin selalu jadi 'delivery',
--   - admin tidak bisa membuat titik pengambilan.
-- Sekarang `kind` + catatan ikut disimpan.
--
-- Catatan tambahan: untuk kind='pickup' fee dipaksa 0 (titik ambil tidak
-- pakai ongkir) dan requires_address dipaksa false.
-- ---------------------------------------------------------------------------
drop function if exists public.admin_upsert_zone(jsonb);

create or replace function public.admin_upsert_zone(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_id text;
  v_kind text;
  v_row public.delivery_zones%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  if v_id = '' then
    raise exception 'invalid_id' using errcode = '22023';
  end if;
  if length(v_id) > 50 or v_id !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  -- Kind wajib salah satu dari dua nilai yang valid.
  v_kind := coalesce(nullif(btrim(p_payload->>'kind'), ''), 'delivery');
  if v_kind not in ('delivery', 'pickup') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  insert into public.delivery_zones (
    id, name_id, name_en, fee,
    lat, lng, radius_km,
    requires_address, sort_order, is_active,
    kind, note_id, note_en
  ) values (
    v_id,
    coalesce(nullif(btrim(p_payload->>'name_id'), ''), v_id),
    coalesce(nullif(btrim(p_payload->>'name_en'), ''), v_id),
    -- Titik pengambilan tidak pernah pakai ongkir.
    case when v_kind = 'pickup' then 0
         else greatest(coalesce((p_payload->>'fee')::integer, 0), 0) end,
    nullif(p_payload->>'lat', '')::double precision,
    nullif(p_payload->>'lng', '')::double precision,
    nullif(p_payload->>'radius_km', '')::double precision,
    -- Titik pengambilan = pembeli datang ke lokasi, bukan minta diantar.
    case when v_kind = 'pickup' then false
         else coalesce((p_payload->>'requires_address')::boolean, true) end,
    coalesce((p_payload->>'sort_order')::integer, 0),
    coalesce((p_payload->>'is_active')::boolean, true),
    v_kind,
    nullif(btrim(p_payload->>'note_id'), ''),
    nullif(btrim(p_payload->>'note_en'), '')
  )
  on conflict (id) do update set
    name_id = excluded.name_id,
    name_en = excluded.name_en,
    fee = excluded.fee,
    lat = excluded.lat,
    lng = excluded.lng,
    radius_km = excluded.radius_km,
    requires_address = excluded.requires_address,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    kind = excluded.kind,
    note_id = excluded.note_id,
    note_en = excluded.note_en
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name_id', v_row.name_id,
    'name_en', v_row.name_en,
    'fee', v_row.fee,
    'lat', v_row.lat,
    'lng', v_row.lng,
    'radius_km', v_row.radius_km,
    'requires_address', v_row.requires_address,
    'sort_order', v_row.sort_order,
    'is_active', v_row.is_active,
    'kind', v_row.kind,
    'note_id', v_row.note_id,
    'note_en', v_row.note_en
  );
end;
$body$;

revoke all on function public.admin_upsert_zone(jsonb) from public;
grant execute on function public.admin_upsert_zone(jsonb)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Backfill: titik pickup lama yang belum punya catatan jam ambil.
--    Dibiarkan kosong — Steven yang menentukan jam buka/tutuptokonya.
-- ---------------------------------------------------------------------------
update public.delivery_zones
   set note_id = coalesce(note_id, 'Ambil pada jam Operational. Silakan cek konfirmasi pesanan.')
 where kind = 'pickup'
   and (note_id is null or btrim(note_id) = '');

-- ---------------------------------------------------------------------------
-- 6. Sanity check — Failed assert kalau ada nilai di luar yang diperbolehkan.
-- ---------------------------------------------------------------------------
do $check$
declare
  v_bad int;
begin
  select count(*) into v_bad
    from public.delivery_zones
   where kind not in ('delivery', 'pickup');

  if v_bad > 0 then
    raise exception 'migration-39: % baris delivery_zones punya kind tidak valid', v_bad;
  end if;

  select count(*) into v_bad
    from public.delivery_zones
   where kind = 'pickup' and fee <> 0;

  if v_bad > 0 then
    raise exception 'migration-39: % titik pickup punya fee <> 0', v_bad;
  end if;
end
$check$;