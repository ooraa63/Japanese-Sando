-- =============================================================================
--  MIGRASI 40 — Section "Populer" & "Terlaris" di beranda dipilih penjual
--
--  Sebelumnya kedua section itu/isinya dihitung otomatis oleh frontend:
-- "Populer" = urutan berdasarkan jumlah like + terjual, "Terlaris" = yang
-- punya penjualan. Penjual tidak bisa menentukan apa yang ditonjolkan.
--
--  Sekarang penjual memilih sendiri lewat dashboard (Admin > Settings > Beranda),
--  maksimal 3 produk per section. Dua kolom jsonb ini yang menyimpan pilihan
--  tersebut, berupa array id flavor (UrutAN admin = urutan tampil).
--
--  Kalau kosong (`[]`), frontend tetap memakai perilaku lama (otomatis), jadi
--  website aman kalau admin belum pernah memilih apa pun.
-- =============================================================================


-- 1. Kolom baru
alter table public.store_settings
  add column if not exists popular_flavor_ids jsonb not null default '[]'::jsonb,
  add column if not exists best_selling_flavor_ids jsonb not null default '[]'::jsonb;

-- Urutkan datanya DULU (kirim NULL / bukan array jadi array kosong),
-- baru pasang constraint — kalau dibalik urutannya, ADD CONSTRAINT gagal
-- pada baris yang masih menyimpan JSON rusak.
update public.store_settings
   set popular_flavor_ids = '[]'::jsonb
 where popular_flavor_ids is null
    or jsonb_typeof(popular_flavor_ids) <> 'array';

update public.store_settings
   set best_selling_flavor_ids = '[]'::jsonb
 where best_selling_flavor_ids is null
    or jsonb_typeof(best_selling_flavor_ids) <> 'array';


-- 2. Jaga bentuk data: selalu array, dan memang maksimal 3 (batas yang sama
--    dengan yang diminta penjual). Perlindungannya ada di DB, bukan cuma di UI.
alter table public.store_settings
  drop constraint if exists settings_popular_flavor_ids_ok;

alter table public.store_settings
  add constraint settings_popular_flavor_ids_ok
  check (
    jsonb_typeof(popular_flavor_ids) = 'array'
    and jsonb_array_length(popular_flavor_ids) <= 3
  );

alter table public.store_settings
  drop constraint if exists settings_best_selling_flavor_ids_ok;

alter table public.store_settings
  add constraint settings_best_selling_flavor_ids_ok
  check (
    jsonb_typeof(best_selling_flavor_ids) = 'array'
    and jsonb_array_length(best_selling_flavor_ids) <= 3
  );


-- 3. Sanitizer: biar payload dari dashboard tidak bisa merusak kolom ini.
--    Yang dibuang: nilai bukan angka, id duplikat (urutan pertama yang dipakai),
--    id flavor yang sudah dihapus, dan apa pun lewat batas p_limit.
--    PENTING: urutan hasil tetap mengikuti urutan pilihan admin.
create or replace function public.clean_flavor_id_list(p_value jsonb, p_limit integer default 3)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_id  bigint;
begin
  if jsonb_typeof(p_value) <> 'array' then
    return v_out;
  end if;

  for v_id in
    -- Elemennya skalar (mis. 4), bukan objek. `e ->> '0'` tidak berlaku di
    -- sini — untuk skalar harus pakai path kosong `#>> '{}'`.
    -- Angka dan teks angka keduanya diterima: kalau someday payload datang
    -- dengan id sebagai string, pilihan penjual tidak boleh hilang diam-diam.
    select (e #>> '{}')::bigint as id
    from jsonb_array_elements(p_value) as e
    where jsonb_typeof(e) in ('number', 'string')
      and (e #>> '{}') ~ '^[0-9]+$'
  loop
    exit when jsonb_array_length(v_out) >= greatest(1, p_limit);

    -- Sudah pernah dipilih sebelumnya -> lewati (pertahankan urutan pertama).
    if v_out @> jsonb_build_array(v_id) then
      continue;
    end if;

    -- Menunjuk flavor yang sudah dihapus -> jangan simpan, biar tidak jadi
    -- id yatim yang tidak pernah ditampatkan.
    if not exists (select 1 from public.flavors f where f.id = v_id) then
      continue;
    end if;

    v_out := v_out || jsonb_build_array(v_id);
  end loop;

  return v_out;
end;
$$;


-- 4. admin_save_settings: terima + bersihkan kedua kolom baru.
--    Salinan utuh dari definisi terbaru (migration-7.sql) supaya tidak
--    ada field yang ikut hilang.
create or replace function public.admin_save_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.store_settings%rowtype;
  v_merged  jsonb;
  v_result  jsonb;
  v_tiers   jsonb;
  v_tier    record;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.store_settings (id) values (1) on conflict (id) do nothing;
  select * into v_current from public.store_settings where id = 1 for update;

  v_merged := (to_jsonb(v_current) - 'id' - 'updated_at') || (p_payload - 'id' - 'updated_at');

  -- Susun daftar paket: validasi bentuk saja. Apakah paket menguntungkan
  -- atau tidak ditentukan per pesanan oleh flavor_total().
  v_tiers := '[]'::jsonb;
  for v_tier in
    select (e ->> 'qty')::int as qty, (e ->> 'price')::int as price
    from jsonb_array_elements(
           case when jsonb_typeof(v_merged -> 'bundle_tiers') = 'array'
                then v_merged -> 'bundle_tiers' else '[]'::jsonb end
         ) as e
    where (e ->> 'qty') ~ '^[0-9]+$' and (e ->> 'price') ~ '^[0-9]+$'
    order by (e ->> 'qty')::int
  loop
    if v_tier.qty >= 2 and v_tier.price >= 0 then
      v_tiers := v_tiers || jsonb_build_array(
        jsonb_build_object('qty', v_tier.qty, 'price', v_tier.price)
      );
    end if;
  end loop;

  update public.store_settings set
    store_name        = public.clean_store_name(v_merged ->> 'store_name', v_current.store_name),
    tagline_id        = coalesce(v_merged ->> 'tagline_id', v_current.tagline_id),
    tagline_en        = coalesce(v_merged ->> 'tagline_en', v_current.tagline_en),
    description_id    = coalesce(v_merged ->> 'description_id', v_current.description_id),
    description_en    = coalesce(v_merged ->> 'description_en', v_current.description_en),
    whatsapp          = regexp_replace(coalesce(v_merged ->> 'whatsapp', v_current.whatsapp), '\D', '', 'g'),
    address           = coalesce(v_merged ->> 'address', v_current.address),
    maps_url          = coalesce(v_merged ->> 'maps_url', v_current.maps_url),
    instagram         = coalesce(v_merged ->> 'instagram', v_current.instagram),
    tiktok            = coalesce(v_merged ->> 'tiktok', v_current.tiktok),
    hours_id          = coalesce(v_merged ->> 'hours_id', v_current.hours_id),
    hours_en          = coalesce(v_merged ->> 'hours_en', v_current.hours_en),
    deadline_id       = coalesce(v_merged ->> 'deadline_id', v_current.deadline_id),
    deadline_en       = coalesce(v_merged ->> 'deadline_en', v_current.deadline_en),
    min_order         = case when v_merged ? 'min_order'
                              then greatest(1, coalesce((v_merged ->> 'min_order')::integer, v_current.min_order))
                              else v_current.min_order end,
    max_per_order     = case when v_merged ? 'max_per_order'
                              then greatest(1, coalesce((v_merged ->> 'max_per_order')::integer, v_current.max_per_order))
                              else v_current.max_per_order end,
    delivery_fee      = case when v_merged ? 'delivery_fee'
                              then greatest(0, coalesce((v_merged ->> 'delivery_fee')::integer, v_current.delivery_fee))
                              else v_current.delivery_fee end,
    free_shipping_min = case when v_merged ? 'free_shipping_min'
                              then greatest(0, coalesce((v_merged ->> 'free_shipping_min')::integer, v_current.free_shipping_min))
                              else v_current.free_shipping_min end,
    bank_accounts     = case when jsonb_typeof(v_merged -> 'bank_accounts') = 'array'
                              then v_merged -> 'bank_accounts' else v_current.bank_accounts end,
    qris_enabled      = coalesce((v_merged ->> 'qris_enabled')::boolean, v_current.qris_enabled),
    qris_image_url    = case when v_merged ? 'qris_image_url'
                              then nullif(trim(coalesce(v_merged ->> 'qris_image_url', '')), '')
                              else v_current.qris_image_url end,
    announcement_id   = coalesce(v_merged ->> 'announcement_id', v_current.announcement_id),
    announcement_en   = coalesce(v_merged ->> 'announcement_en', v_current.announcement_en),
    is_preorder_open  = coalesce((v_merged ->> 'is_preorder_open')::boolean, v_current.is_preorder_open),
    stock_enabled     = coalesce((v_merged ->> 'stock_enabled')::boolean, v_current.stock_enabled),
    total_stock       = case when v_merged ? 'total_stock'
                              then greatest(0, coalesce((v_merged ->> 'total_stock')::integer, v_current.total_stock))
                              else v_current.total_stock end,
    hero_image_url    = case when v_merged ? 'hero_image_url'
                              then nullif(trim(coalesce(v_merged ->> 'hero_image_url', '')), '')
                              else v_current.hero_image_url end,
    hero_image_mobile_url = case when v_merged ? 'hero_image_mobile_url'
                              then nullif(trim(coalesce(v_merged ->> 'hero_image_mobile_url', '')), '')
                              else v_current.hero_image_mobile_url end,
    pickup_note_id    = coalesce(v_merged ->> 'pickup_note_id', v_current.pickup_note_id),
    pickup_note_en    = coalesce(v_merged ->> 'pickup_note_en', v_current.pickup_note_en),
    delivery_note_id  = coalesce(v_merged ->> 'delivery_note_id', v_current.delivery_note_id),
    delivery_note_en  = coalesce(v_merged ->> 'delivery_note_en', v_current.delivery_note_en),
    logo_url          = case when v_merged ? 'logo_url'
                              then nullif(trim(coalesce(v_merged ->> 'logo_url', '')), '')
                              else v_current.logo_url end,
    brand_line        = left(coalesce(v_merged ->> 'brand_line', v_current.brand_line), 80),
    bundle_tiers      = v_tiers,
    popular_flavor_ids = public.clean_flavor_id_list(
      case when jsonb_typeof(v_merged -> 'popular_flavor_ids') = 'array'
           then v_merged -> 'popular_flavor_ids'
           else v_current.popular_flavor_ids end, 3),
    best_selling_flavor_ids = public.clean_flavor_id_list(
      case when jsonb_typeof(v_merged -> 'best_selling_flavor_ids') = 'array'
           then v_merged -> 'best_selling_flavor_ids'
           else v_current.best_selling_flavor_ids end, 3)
  where id = 1;

  select to_jsonb(s) into v_result from public.store_settings s where s.id = 1;

  return jsonb_build_object('ok', true,
                            'store_name', v_result ->> 'store_name',
                            'bundle_tiers', v_result -> 'bundle_tiers',
                            'popular_flavor_ids', v_result -> 'popular_flavor_ids',
                            'best_selling_flavor_ids', v_result -> 'best_selling_flavor_ids');
end;
$$;


-- =============================================================================
--  Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
