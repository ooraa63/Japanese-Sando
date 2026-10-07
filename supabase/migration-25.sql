-- ============================================================================
-- MIGRASI 25 — Delivery zones dinamis (admin-defined)
-- ----------------------------------------------------------------------------
-- Sebelumnya: `delivery_zones` jsonb di store_settings dengan 4 zona hardcode
-- (pickup, vihara, uvers, other). Setiap pemesanan delivery selalu muncul
-- picker map, dan tidak ada cara admin menambah/mengurangi zona tanpa
-- edit code.
--
-- Sekarang: tabel `delivery_zones` dengan kolom:
--   - id (text PK, slug, mis. "pickup", "vihara", "uvers", "custom-jakarta")
--   - name_id, name_en        — label untuk customer
--   - fee (integer)           — ongkir Rp
--   - lat, lng (double prec)  — pusat zona (NULL = "antar ke titik kamu")
--   - radius_km (double prec) — radius area delivery (NULL = unlimited)
--   - requires_address (bool)  — kalau true, customer harus isi alamat+koordinat
--   - sort_order, is_active
--
-- Buyer UX:
--   - Zona dengan (lat, lng, radius_km) terisi → fix (mis. Vihara, UVERS).
--     Customer tidak perlu pilih map.
--   - Zona dengan requires_address=true → customer harus pilih lokasi via map.
--
-- Backward compat: store_settings.delivery_zones masih dipakai kalau
-- tabel kosong — fallback ke jsonb lama.
-- ============================================================================

create table if not exists public.delivery_zones (
  id               text        not null primary key,
  name_id          text        not null,
  name_en          text        not null,
  fee              integer     not null default 0,
  lat              double precision,
  lng              double precision,
  radius_km        double precision,
  requires_address boolean     not null default true,
  sort_order       integer     not null default 0,
  is_active        boolean     not null default true,
  created_at       timestamptz not null default now()
);

-- Seed dengan zona default (Vihara, UVERS, Antar ke titik kamu).
-- Pickup tidak butuh baris karena metode 'pickup' sudah ditangani terpisah
-- (delivery_method enum).
insert into public.delivery_zones (id, name_id, name_en, fee, lat, lng, radius_km, requires_address, sort_order) values
  ('vihara', 'Vihara Tian En', 'Vihara Tian En', 10000, -6.917, 107.7, 0.5, false, 1),
  ('uvers',  'UVERS',          'UVERS',          10000, -6.917, 107.6, 0.5, false, 2),
  ('antar',  'Antar ke alamatmu', 'Deliver to your location', 5000, null, null, null, true, 3)
on conflict (id) do update set
  name_id = excluded.name_id,
  name_en = excluded.name_en,
  fee = excluded.fee,
  lat = excluded.lat,
  lng = excluded.lng,
  radius_km = excluded.radius_km,
  requires_address = excluded.requires_address,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

-- ---------------------------------------------------------------------------
-- RPC publik `list_active_zones()` — return zones aktif untuk customer.
-- Keamanan: anyone boleh baca zona aktif (public data, tidak ada privasi).
-- ---------------------------------------------------------------------------
-- Catatan idempotensi: `list_active_zones` biasanya sudah ada dengan return
-- type berbeda (mis. ikut diubah migration-32 yang menambah kolom `kind`).
-- `create or replace` tidak boleh mengubah return type, jadi drop dulu
-- signature tanpa argumen supaya file ini aman di-run ulang.
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
  requires_address boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    z.id::text,
    z.name_id::text,
    z.name_en::text,
    z.fee::integer,
    z.lat::text,
    z.lng::text,
    z.radius_km::text,
    z.requires_address
  from public.delivery_zones z
  where z.is_active
  order by z.sort_order asc, z.id asc;
$$;

grant execute on function public.list_active_zones() to anon, authenticated;

comment on function public.list_active_zones()
  is 'Daftar zona delivery aktif untuk customer. NULL lat/lng = "antar ke titik kamu".';

-- ---------------------------------------------------------------------------
-- RPC admin `admin_list_zones()` — full data dengan lat/lng numeric.
-- ---------------------------------------------------------------------------
-- Sama seperti `list_active_zones` di atas: drop dulu supaya return type
-- boleh berubah saat migration-32 menambah kolom `kind`.
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
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select z.id, z.name_id, z.name_en, z.fee, z.lat, z.lng, z.radius_km,
           z.requires_address, z.sort_order, z.is_active, z.created_at
    from public.delivery_zones z
    order by z.sort_order asc, z.id asc;
end;
$$;

comment on function public.admin_list_zones()
  is 'Admin: semua zona delivery (termasuk non-aktif).';

-- ---------------------------------------------------------------------------
-- RPC admin `admin_upsert_zone(p_payload jsonb)` — insert/update zona.
-- payload keys: id, name_id, name_en, fee, lat, lng, radius_km,
--               requires_address, sort_order, is_active.
-- ---------------------------------------------------------------------------
create or replace function public.admin_upsert_zone(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
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

  insert into public.delivery_zones (
    id, name_id, name_en, fee,
    lat, lng, radius_km,
    requires_address, sort_order, is_active
  ) values (
    v_id,
    coalesce(nullif(btrim(p_payload->>'name_id'), ''), v_id),
    coalesce(nullif(btrim(p_payload->>'name_en'), ''), v_id),
    greatest(coalesce((p_payload->>'fee')::integer, 0), 0),
    nullif(p_payload->>'lat', '')::double precision,
    nullif(p_payload->>'lng', '')::double precision,
    nullif(p_payload->>'radius_km', '')::double precision,
    coalesce((p_payload->>'requires_address')::boolean, true),
    coalesce((p_payload->>'sort_order')::integer, 0),
    coalesce((p_payload->>'is_active')::boolean, true)
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
    is_active = excluded.is_active
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
    'is_active', v_row.is_active
  );
end;
$$;

comment on function public.admin_upsert_zone(jsonb)
  is 'Admin: insert/update zona delivery. id wajib (slug).';

-- ---------------------------------------------------------------------------
-- RPC admin `admin_delete_zone(p_id text)` — soft-delete (is_active=false).
-- Tidak hapus baris supaya history pesanan lama tidak error.
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_zone(p_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  update public.delivery_zones
    set is_active = false
    where id = p_id;
  return found;
end;
$$;

comment on function public.admin_delete_zone(text)
  is 'Admin: soft-delete zona (is_active=false). History pesanan lama aman.';