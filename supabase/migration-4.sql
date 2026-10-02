-- =============================================================================
--  MIGRASI 4 — Perbaiki admin_save_settings agar hanya mengubah sebagian
--
--  Bug: fungsi ini memakai INSERT ... ON CONFLICT DO UPDATE yang menulis
--  SELURUH kolom. Kalau dipanggil dengan payload sebagian (misalnya hanya
--  { is_preorder_open: false } dari tombol buka/tutup pre-order di
--  dashboard), semua field lain akan dikembalikan ke default — nomor
--  WhatsApp, catatan pengambilan, ongkir, jumlah stok, dan lain-lain
--  ikut terhapus.
--
--  Perbaikan: gabungkan payload dengan data yang sedang ada, jadi hanya
--  field yang benar-benar dikirim yang berubah.
-- =============================================================================


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
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Pastikan baris selalu ada
  insert into public.store_settings (id) values (1) on conflict (id) do nothing;

  select * into v_current from public.store_settings where id = 1 for update;

  -- Data sekarang sebagai jsonb, digabung dengan payload baru.
  -- Field yang tidak ada di payload tetap memakai nilai lama.
  v_merged := (to_jsonb(v_current) - 'id' - 'updated_at') || (p_payload - 'id' - 'updated_at');

  -- Pastikan store_name selalu ada supaya tidak wiped
  if not (v_merged ? 'store_name') then
    v_merged := v_merged || jsonb_build_object('store_name', v_current.store_name);
  end if;

  update public.store_settings set
    store_name           = coalesce(nullif(btrim(v_merged ->> 'store_name'), ''), v_current.store_name),
    tagline_id           = coalesce(v_merged ->> 'tagline_id', v_current.tagline_id),
    tagline_en           = coalesce(v_merged ->> 'tagline_en', v_current.tagline_en),
    description_id       = coalesce(v_merged ->> 'description_id', v_current.description_id),
    description_en       = coalesce(v_merged ->> 'description_en', v_current.description_en),
    whatsapp             = regexp_replace(coalesce(v_merged ->> 'whatsapp', v_current.whatsapp), '\D', '', 'g'),
    address              = coalesce(v_merged ->> 'address', v_current.address),
    maps_url             = coalesce(v_merged ->> 'maps_url', v_current.maps_url),
    instagram            = coalesce(v_merged ->> 'instagram', v_current.instagram),
    tiktok               = coalesce(v_merged ->> 'tiktok', v_current.tiktok),
    hours_id             = coalesce(v_merged ->> 'hours_id', v_current.hours_id),
    hours_en             = coalesce(v_merged ->> 'hours_en', v_current.hours_en),
    deadline_id          = coalesce(v_merged ->> 'deadline_id', v_current.deadline_id),
    deadline_en          = coalesce(v_merged ->> 'deadline_en', v_current.deadline_en),
    min_order            = case when v_merged ? 'min_order'
                               then greatest(1, coalesce((v_merged ->> 'min_order')::integer, v_current.min_order))
                               else v_current.min_order end,
    max_per_order        = case when v_merged ? 'max_per_order'
                               then greatest(1, coalesce((v_merged ->> 'max_per_order')::integer, v_current.max_per_order))
                               else v_current.max_per_order end,
    delivery_fee         = case when v_merged ? 'delivery_fee'
                               then greatest(0, coalesce((v_merged ->> 'delivery_fee')::integer, v_current.delivery_fee))
                               else v_current.delivery_fee end,
    free_shipping_min    = case when v_merged ? 'free_shipping_min'
                               then greatest(0, coalesce((v_merged ->> 'free_shipping_min')::integer, v_current.free_shipping_min))
                               else v_current.free_shipping_min end,
    bank_accounts        = case when jsonb_typeof(v_merged -> 'bank_accounts') = 'array'
                               then v_merged -> 'bank_accounts' else v_current.bank_accounts end,
    qris_enabled         = coalesce((v_merged ->> 'qris_enabled')::boolean, v_current.qris_enabled),
    qris_image_url       = case when v_merged ? 'qris_image_url'
                               then nullif(trim(coalesce(v_merged ->> 'qris_image_url', '')), '')
                               else v_current.qris_image_url end,
    announcement_id      = coalesce(v_merged ->> 'announcement_id', v_current.announcement_id),
    announcement_en      = coalesce(v_merged ->> 'announcement_en', v_current.announcement_en),
    is_preorder_open     = coalesce((v_merged ->> 'is_preorder_open')::boolean, v_current.is_preorder_open),
    stock_enabled        = coalesce((v_merged ->> 'stock_enabled')::boolean, v_current.stock_enabled),
    total_stock          = case when v_merged ? 'total_stock'
                               then greatest(0, coalesce((v_merged ->> 'total_stock')::integer, v_current.total_stock))
                               else v_current.total_stock end,
    hero_image_url       = case when v_merged ? 'hero_image_url'
                               then nullif(trim(coalesce(v_merged ->> 'hero_image_url', '')), '')
                               else v_current.hero_image_url end,
    hero_image_mobile_url = case when v_merged ? 'hero_image_mobile_url'
                               then nullif(trim(coalesce(v_merged ->> 'hero_image_mobile_url', '')), '')
                               else v_current.hero_image_mobile_url end,
    pickup_note_id       = coalesce(v_merged ->> 'pickup_note_id', v_current.pickup_note_id),
    pickup_note_en       = coalesce(v_merged ->> 'pickup_note_en', v_current.pickup_note_en),
    delivery_note_id     = coalesce(v_merged ->> 'delivery_note_id', v_current.delivery_note_id),
    delivery_note_en     = coalesce(v_merged ->> 'delivery_note_en', v_current.delivery_note_en),
    bundle_enabled       = coalesce((v_merged ->> 'bundle_enabled')::boolean, v_current.bundle_enabled),
    bundle_size          = case when v_merged ? 'bundle_size'
                               then greatest(2, coalesce((v_merged ->> 'bundle_size')::integer, v_current.bundle_size))
                               else v_current.bundle_size end,
    bundle_price         = case when v_merged ? 'bundle_price'
                               then greatest(0, coalesce((v_merged ->> 'bundle_price')::integer, v_current.bundle_price))
                               else v_current.bundle_price end
  where id = 1;

  select to_jsonb(s) into v_result from public.store_settings s where s.id = 1;

  return jsonb_build_object('ok', true, 'store_name', v_result ->> 'store_name',
                            'is_preorder_open', (v_result ->> 'is_preorder_open')::boolean,
                            'total_stock', (v_result ->> 'total_stock')::integer);
end;
$$;


-- Fungsi kecil khusus tombol buka/tutup pre-order, supaya tidak pernah
-- menyentuh field lain sama sekali.
create or replace function public.admin_toggle_preorder(p_open boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.store_settings
  set is_preorder_open = coalesce(p_open, is_preorder_open)
  where id = 1;

  return jsonb_build_object('ok', true, 'is_preorder_open', p_open);
end;
$$;


-- Segarkan cache PostgREST
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
