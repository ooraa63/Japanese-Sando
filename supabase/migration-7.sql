-- =============================================================================
--  MIGRASI 7 — Jaga agar nama toko & paket harga tidak bisa rusak
--
--  Dump: saat pengujian, nama toko pernah tersimpan sebagai "{}" (bukan teks
--  nama), dan daftar paket terkosongkan. Keduanya sekarang dicegah di level
--  database, bukan hanya di kode aplikasi.
-- =============================================================================


-- 1. Nama toko tidak boleh kosong, tidak boleh "{}"/"[]"/"null"
--    (pola garbage yang muncul kalau ada payload yang tidak semestinya).
--    Urutan: perbaiki datanya DULU, baru pasang constraint-nya.
update public.store_settings
set store_name = 'Rumakomugi'
where btrim(coalesce(store_name, '')) = ''
   or btrim(store_name) in ('{}', '[]', 'null', 'undefined', '[object Object]');

alter table public.store_settings
  drop constraint if exists store_settings_store_name_sane;

alter table public.store_settings
  add constraint store_settings_store_name_sane
  check (
    btrim(store_name) <> ''
    and btrim(store_name) <> '{}'
    and btrim(store_name) <> '[]'
    and btrim(store_name) <> 'null'
    and btrim(store_name) <> 'undefined'
    and btrim(store_name) <> '[object Object]'
  );


-- 2. admin_save_settings: bersihkan nilai nama sebelum disimpan
--    (belt-and-braces di samping check constraint di atas)
create or replace function public.clean_store_name(p_value text, p_fallback text)
returns text
language plpgsql
immutable
as $$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  -- Nilai yang bukan nama (JSON, null, kosong) dibuang
  if v = '' or v in ('{}', '[]', 'null', 'undefined', '[object Object]') then
    return coalesce(nullif(btrim(coalesce(p_fallback, '')), ''), 'Rumakomugi');
  end if;
  return left(v, 120);
end;
$$;

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
    bundle_tiers      = v_tiers
  where id = 1;

  select to_jsonb(s) into v_result from public.store_settings s where s.id = 1;

  return jsonb_build_object('ok', true,
                            'store_name', v_result ->> 'store_name',
                            'bundle_tiers', v_result -> 'bundle_tiers');
end;
$$;


-- 3. Bundle per produk: jaga agar tidak pernah berisi isian aneh
--    Urutan: bersihkan dulu, baru pasang constraint-nya.
update public.flavors set bundle_tiers = '[]'::jsonb
where bundle_tiers is null or jsonb_typeof(bundle_tiers) <> 'array';

alter table public.flavors
  drop constraint if exists flavors_bundle_tiers_array;

alter table public.flavors
  add constraint flavors_bundle_tiers_array
  check (jsonb_typeof(bundle_tiers) = 'array');

-- Kembalikan paket bawaan untuk produk Rp18.000 yang paketnya kosong
update public.flavors
set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
where is_active and price = 18000
  and (bundle_tiers is null or jsonb_array_length(bundle_tiers) = 0);

-- admin_save_flavor juga menyaring paket
create or replace function public.admin_save_flavor(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_slug   text;
  v_name   text;
  v_price  integer;
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_payload ->> 'name_id', ''));
  if v_name = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(v_name) > 80 then
    v_name := left(v_name, 80);
  end if;

  -- Slug dari "Cookies & Cream" harus jadi "cookies-cream", bukan
  -- "cookiescream" -- karena itu spasi dan "&" diganti tanda hubung.
  v_slug := trim(both '-' from
    regexp_replace(lower(coalesce(nullif(btrim(coalesce(p_payload ->> 'slug', '')), ''), v_name)),
                   '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := 'item-' || substr(md5(random()::text), 1, 6);
  end if;

  if v_id is not null then
    if exists (select 1 from public.flavors where slug = v_slug and id <> v_id) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end if;
  elsif exists (select 1 from public.flavors where slug = v_slug) then
    raise exception 'slug_taken' using errcode = '22023';
  end if;

  v_price := coalesce((p_payload ->> 'price')::integer, -1);
  if v_price < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.flavors set
      slug         = v_slug,
      name_id      = v_name,
      name_en      = left(coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name), 80),
      desc_id      = left(coalesce(p_payload ->> 'desc_id', ''), 500),
      desc_en      = left(coalesce(p_payload ->> 'desc_en', ''), 500),
      price        = v_price,
      image_url    = case when p_payload ? 'image_url'
                          then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                          else image_url end,
      is_active    = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured  = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order   = coalesce((p_payload ->> 'sort_order')::integer, 0),
      category_id  = case when p_payload ? 'category_id'
                          then nullif(p_payload ->> 'category_id', '')::bigint
                          else category_id end
    where id = v_id
    returning id into v_id;
  else
    insert into public.flavors (
      slug, name_id, name_en, desc_id, desc_en, price, image_url,
      is_active, is_featured, sort_order, category_id
    ) values (
      v_slug, v_name,
      left(coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name), 80),
      left(coalesce(p_payload ->> 'desc_id', ''), 500),
      left(coalesce(p_payload ->> 'desc_en', ''), 500),
      v_price,
      nullif(trim(coalesce(p_payload ->> 'image_url', '')), ''),
      coalesce((p_payload ->> 'is_active')::boolean, true),
      coalesce((p_payload ->> 'is_featured')::boolean, false),
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      coalesce(nullif(p_payload ->> 'category_id', '')::bigint,
               (select id from public.categories where is_active
                order by sort_order, id limit 1))
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;


-- =============================================================================
-- Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');