-- =============================================================================
--  MIGRASI 43 -- Section "Menu Baru" di beranda
--
--  Permintaan Steven (11-10-2026): "Nantinya akan ada menu baru, dan ingin
--  diletak di mungkin atas bundle lalu seperti biasa namun mau tambahin satu
--  tulisan kayak 'New' jadi orang bisa tertarik, dan di admin dia bisa set
--  menu mana yang new kalau di set new nanti masuk ke sana."
--
--  Jadi tiga hal sekaligus:
--    1. Section "Menu Baru" di beranda, posisinya DI ATAS "Paket Hemat".
--    2. Tiap kartu di sana memakai komponen kartu yang SAMA dengan section
--       "Menu" (FlavorCard mode dense) + label "New" di foto.
--    3. Penjual memilih sendiri produk mana yang ditandai "New" dari dashboard.
--
--  Kenapa kolom jsonb di store_settings, bukan kolom boolean di `flavors`?
--  Karena ini keputusan yang bisa dibalik, dan strukturnya sama dengan
--  `popular_flavor_ids` (migration-40) yang sudah jalan. Pakai pola yang sudah
--  terbukti supaya tidak ada mekanisme kedua yang harus dipelihara.
--  Urutan klik di dashboard = urutan tampil di website (dipakai `clean_flavor_id_list`).
--
--  Bedanya dari "Populer": batasnya 6, bukan 3. Menu baru biasanya datang
--  lebih dari tiga item sekaligus, dan section ini berupa baris mendatar --
--  jadi lebih banyak item masih enak dilihat. Angka ini harus sama di tiga
--  tempat: `MAX_NEW_PICKS` (src/lib/utils.ts), tombol di dashboard, dan CHECK
--  constraint di bawah.
-- =============================================================================


-- 1. Kolom baru
alter table public.store_settings
  add column if not exists new_flavor_ids jsonb not null default '[]'::jsonb;


-- 2. Bersihkan nilai yang sudah ada (null / bukan array / rusak) supaya CHECK
--    constraint di bawah tidak gagal pada baris lama.
update public.store_settings
   set new_flavor_ids = '[]'::jsonb
 where new_flavor_ids is null
    or jsonb_typeof(new_flavor_ids) <> 'array';


-- 3. CHECK constraint: harus array dan maksimal 6 isinya.
alter table public.store_settings
  drop constraint if exists settings_new_flavor_ids_ok;

alter table public.store_settings
  add constraint settings_new_flavor_ids_ok
  check (
    jsonb_typeof(new_flavor_ids) = 'array'
    and jsonb_array_length(new_flavor_ids) <= 6
  );


-- 4. admin_save_settings: terima + bersihkan `new_flavor_ids`.
--    Salinan UTUH dari definisi terbaru (migration-40) lalu ditambah satu
--    baris -- kalau hanya sebagian, semua field lain ikut hilang.
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
           else v_current.best_selling_flavor_ids end, 3),
    new_flavor_ids = public.clean_flavor_id_list(
      case when jsonb_typeof(v_merged -> 'new_flavor_ids') = 'array'
           then v_merged -> 'new_flavor_ids'
           else v_current.new_flavor_ids end, 6)
  where id = 1;

  select to_jsonb(s) into v_result from public.store_settings s where s.id = 1;

  return jsonb_build_object('ok', true,
                            'store_name', v_result ->> 'store_name',
                            'bundle_tiers', v_result -> 'bundle_tiers',
                            'popular_flavor_ids', v_result -> 'popular_flavor_ids',
                            'best_selling_flavor_ids', v_result -> 'best_selling_flavor_ids',
                            'new_flavor_ids', v_result -> 'new_flavor_ids');
end;
$$;


-- =============================================================================
--  Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');