-- =============================================================================
--  MIGRASI 3 — Hapus batch, tambah harga paket
--  Jalankan: npm run db:push   (aman diulang / idempotent)
-- =============================================================================


-- =============================================================================
-- 1. HARGA PAKET (bundle)
--
--  Aturannya: setiap `bundle_size` pcs jadi satu paket dengan harga tetap
--  `bundle_price`, berapa pun rasa yang dipilih. Sisa pcs di luar paket
--  dihitung dengan harga satuan biasa.
--
--    1 pcs  -> 0 paket + 1 biasa  = 18.000
--    2 pcs  -> 1 paket           = 35.000
--    3 pcs  -> 1 paket + 1 biasa = 53.000
--    4 pcs  -> 2 paket           = 70.000
--    5 pcs  -> 2 paket + 1 biasa = 88.000
--
--  Rumus: paket = total ÷ bundle_size (bulat ke bawah)
--          sisa  = total mod bundle_size
--          harga = paket × bundle_price + sisa × (harga satuan rata-rata)
--
--  Harga selalu dihitung ulang di server; nilai dari browser diabaikan.
-- =============================================================================

alter table public.store_settings
  add column if not exists bundle_enabled boolean not null default true,
  add column if not exists bundle_size    integer not null default 2,
  add column if not exists bundle_price   integer not null default 35000;

update public.store_settings set
  bundle_enabled = coalesce(bundle_enabled, true),
  bundle_size    = coalesce(bundle_size, 2),
  bundle_price   = coalesce(bundle_price, 35000)
where id = 1;


-- =============================================================================
-- 2. create_order dengan perhitungan harga paket
-- =============================================================================

create or replace function public.create_order(
  p_customer_name    text default '',
  p_phone            text default '',
  p_payment_method   text default 'cash',
  p_delivery_method  text default 'pickup',
  p_address          text default null,
  p_transfer_method  text default null,
  p_payment_proof    text default null,
  p_note             text default null,
  p_language         text default 'id',
  p_items            jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings   public.store_settings%rowtype;
  v_item       jsonb;
  v_flavor     public.flavors%rowtype;
  v_order_id   bigint;
  v_flavor_id  bigint;
  v_qty        integer;
  v_name       text;
  v_raw        integer := 0;   -- total harga tanpa paket (harga satuan x pcs)
  v_count      integer := 0;   -- total pcs
  v_bundles    integer := 0;   -- jumlah paket
  v_leftover   integer := 0;   -- pcs di luar paket
  v_avg_price  integer := 0;   -- harga satuan rata-rata
  v_subtotal   integer := 0;   -- harga akhir setelah paket
  v_items_ok   integer := 0;
  v_code       text;
  v_proof      text;
  v_delivery   integer := 0;
begin
  -- ---------- validasi input ----------
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(trim(p_customer_name)) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;

  if p_phone is null or length(public.normalize_phone(p_phone)) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if p_payment_method not in ('transfer', 'cash') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;

  if p_delivery_method = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then
    raise exception 'address_required' using errcode = '22023';
  end if;

  v_proof := nullif(trim(coalesce(p_payment_proof, '')), '');
  if p_payment_method = 'transfer' and v_proof is null then
    raise exception 'proof_required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  -- ---------- ambil settings ----------
  select * into v_settings from public.store_settings where id = 1 for update;
  if v_settings.id is null then
    raise exception 'settings_missing' using errcode = '22023';
  end if;
  if not v_settings.is_preorder_open then
    raise exception 'preorder_closed' using errcode = '22023';
  end if;

  -- ---------- validasi tiap rasa & hitung harga mentah ----------
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := (v_item ->> 'quantity')::integer;

    if v_flavor_id is null or v_qty is null or v_qty < 1 or v_qty > v_settings.max_per_order then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    select * into v_flavor
    from public.flavors
    where id = v_flavor_id and is_active;

    if not found then
      raise exception 'flavor_unavailable' using errcode = '22023';
    end if;

    v_raw    := v_raw + (v_flavor.price * v_qty);
    v_count  := v_count + v_qty;
    v_items_ok := v_items_ok + 1;
  end loop;

  if v_items_ok = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;

  if v_count < v_settings.min_order then
    raise exception 'below_min_order' using errcode = '22023';
  end if;

  -- ---------- hitung harga paket ----------
  if v_settings.bundle_enabled and v_settings.bundle_size > 1 and v_count >= v_settings.bundle_size then
    v_bundles  := v_count / v_settings.bundle_size;
    v_leftover := v_count - (v_bundles * v_settings.bundle_size);
  else
    v_bundles  := 0;
    v_leftover := v_count;
  end if;

  -- Harga paket tidak boleh lebih mahal dari harga satuan biasa
  if v_bundles > 0
     and v_settings.bundle_price >= v_settings.bundle_size * (v_raw / greatest(v_count, 1)) then
    v_bundles  := 0;
    v_leftover := v_count;
  end if;

  v_avg_price := round(v_raw::numeric / greatest(v_count, 1))::integer;
  v_subtotal  := (v_bundles * v_settings.bundle_price) + (v_leftover * v_avg_price);

  v_delivery := case when p_delivery_method = 'delivery' then v_settings.delivery_fee else 0 end;

  -- ---------- cek & kurangi stok GLOBAL ----------
  -- Baris settings sudah dikunci (for update) di atas, jadi dua pembeli yang
  -- memesan bersamaan tidak akan membuat stok minus.
  if v_settings.stock_enabled and v_count > v_settings.total_stock then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;

  if v_settings.stock_enabled then
    update public.store_settings set total_stock = total_stock - v_count where id = 1;
  end if;

  -- ---------- simpan pesanan ----------
  v_code := 'JS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_code_seq')::text, 3, '0');

  insert into public.orders (
    order_code, customer_name, phone, phone_normalized, delivery_method, address,
    payment_method, transfer_method, payment_proof_path, note,
    subtotal, delivery_fee, total_price, item_count, language
  ) values (
    v_code,
    trim(p_customer_name),
    trim(p_phone),
    public.normalize_phone(p_phone),
    p_delivery_method,
    nullif(trim(coalesce(p_address, '')), ''),
    p_payment_method,
    nullif(trim(coalesce(p_transfer_method, '')), ''),
    v_proof,
    left(coalesce(p_note, ''), 500),
    v_subtotal,
    v_delivery,
    v_subtotal + v_delivery,
    v_count,
    case when p_language = 'en' then 'en' else 'id' end
  )
  returning id into v_order_id;

  -- ---------- simpan item (harga satuan tetap disimpan apa adanya) ----------
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := (v_item ->> 'quantity')::integer;

    select * into v_flavor from public.flavors where id = v_flavor_id;

    v_name := case when coalesce(p_language, 'id') = 'en' then v_flavor.name_en else v_flavor.name_id end;

    insert into public.order_items (
      order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total
    ) values (
      v_order_id, v_flavor.id, v_flavor.slug, v_name, v_flavor.price, v_qty, v_flavor.price * v_qty
    );
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'order_code', v_code,
    'item_count', v_count,
    'bundle_count', v_bundles,
    'leftover_count', v_leftover,
    'bundle_price', case when v_bundles > 0 then v_settings.bundle_price else null end,
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery,
    'total_price', v_subtotal + v_delivery,
    'remaining_stock', (select case when stock_enabled then total_stock else null end
                        from public.store_settings where id = 1)
  );
end;
$$;


-- =============================================================================
-- 3. Fungsi bantu untuk menghitung harga paket (dipakai website)
--    supaya tampilan frontend sama persis dengan hitungan server.
-- =============================================================================

create or replace function public.calc_bundle_price(p_total_items integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings public.store_settings%rowtype;
  v_bundles  integer;
  v_leftover integer;
  v_min_price integer;
begin
  select * into v_settings from public.store_settings where id = 1;
  if v_settings.id is null then
    raise exception 'settings_missing' using errcode = '22023';
  end if;

  if p_total_items is null or p_total_items < 1 then
    return jsonb_build_object('bundles', 0, 'leftover', 0, 'bundle_price', null,
                              'unit_price', 0, 'total', 0, 'saving', 0);
  end if;

  select coalesce(min(price), 0) into v_min_price
  from public.flavors where is_active;

  if v_settings.bundle_enabled and v_settings.bundle_size > 1
     and p_total_items >= v_settings.bundle_size then
    v_bundles  := p_total_items / v_settings.bundle_size;
    v_leftover := p_total_items - (v_bundles * v_settings.bundle_size);
  else
    v_bundles  := 0;
    v_leftover := p_total_items;
  end if;

  return jsonb_build_object(
    'bundles', v_bundles,
    'leftover', v_leftover,
    'bundle_price', case when v_bundles > 0 then v_settings.bundle_price else null end,
    'bundle_size', v_settings.bundle_size,
    'unit_price', v_min_price,
    'total', (v_bundles * v_settings.bundle_price) + (v_leftover * v_min_price),
    'saving', greatest(0, (p_total_items * v_min_price)
                        - ((v_bundles * v_settings.bundle_price) + (v_leftover * v_min_price)))
  );
end;
$$;


-- =============================================================================
-- 4. HAPUS FITUR BATCH
-- =============================================================================

drop table if exists public.batches cascade;

drop function if exists public.admin_list_batches();
drop function if exists public.admin_batch_summary(bigint);
drop function if exists public.admin_close_batch(bigint);
drop function if exists public.admin_reopen_batch(bigint);
drop function if exists public.public_open_batch_id();

-- Kolom batch_id tidak dipakai lagi
alter table public.orders drop column if exists batch_id;

-- Perbarui admin_list_orders supaya tidak menyebut batch lagi
create or replace function public.admin_list_orders(
  p_status  text default null,
  p_search  text default null,
  p_limit   integer default 50,
  p_offset  integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    with filtered as (
      select o.*
      from public.orders o
      where (p_status is null or o.status = p_status)
        and (
          p_search is null
          or btrim(p_search) = ''
          or o.order_code ilike '%' || p_search || '%'
          or o.customer_name ilike '%' || p_search || '%'
          or o.phone ilike '%' || p_search || '%'
        )
      order by o.created_at desc
      limit greatest(1, least(p_limit, 200))
      offset greatest(0, p_offset)
    )
    select jsonb_build_object(
      'orders', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'order_code', f.order_code,
            'customer_name', f.customer_name,
            'phone', f.phone,
            'delivery_method', f.delivery_method,
            'address', f.address,
            'payment_method', f.payment_method,
            'transfer_method', f.transfer_method,
            'payment_proof_path', f.payment_proof_path,
            'note', f.note,
            'admin_note', f.admin_note,
            'subtotal', f.subtotal,
            'delivery_fee', f.delivery_fee,
            'total_price', f.total_price,
            'item_count', f.item_count,
            'status', f.status,
            'language', f.language,
            'created_at', f.created_at,
            'updated_at', f.updated_at,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'flavor_name', oi.flavor_name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total
              ) order by oi.id)
              from public.order_items oi where oi.order_id = f.id
            ), '[]'::jsonb)
          ) order by f.created_at desc
        ) from filtered f
      ), '[]'::jsonb),
      'total', (select count(*) from filtered)
    )
  );
end;
$$;


-- =============================================================================
-- 5. Simpan pengaturan: tambah kolom paket
-- =============================================================================

create or replace function public.admin_save_settings(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.store_settings (
    id, store_name, tagline_id, tagline_en, description_id, description_en,
    whatsapp, address, maps_url, instagram, tiktok, hours_id, hours_en,
    deadline_id, deadline_en, min_order, max_per_order, delivery_fee,
    free_shipping_min, bank_accounts, qris_enabled, qris_image_url,
    announcement_id, announcement_en, is_preorder_open,
    stock_enabled, total_stock, hero_image_url, hero_image_mobile_url,
    pickup_note_id, pickup_note_en, delivery_note_id, delivery_note_en,
    bundle_enabled, bundle_size, bundle_price
  ) values (
    1,
    coalesce(nullif(btrim(p_payload ->> 'store_name'), ''), 'Rumakomugi'),
    coalesce(p_payload ->> 'tagline_id', ''),
    coalesce(p_payload ->> 'tagline_en', ''),
    coalesce(p_payload ->> 'description_id', ''),
    coalesce(p_payload ->> 'description_en', ''),
    regexp_replace(coalesce(p_payload ->> 'whatsapp', ''), '\D', '', 'g'),
    coalesce(p_payload ->> 'address', ''),
    coalesce(p_payload ->> 'maps_url', ''),
    coalesce(p_payload ->> 'instagram', ''),
    coalesce(p_payload ->> 'tiktok', ''),
    coalesce(p_payload ->> 'hours_id', ''),
    coalesce(p_payload ->> 'hours_en', ''),
    coalesce(p_payload ->> 'deadline_id', ''),
    coalesce(p_payload ->> 'deadline_en', ''),
    greatest(1, coalesce((p_payload ->> 'min_order')::integer, 1)),
    greatest(1, coalesce((p_payload ->> 'max_per_order')::integer, 20)),
    greatest(0, coalesce((p_payload ->> 'delivery_fee')::integer, 0)),
    greatest(0, coalesce((p_payload ->> 'free_shipping_min')::integer, 0)),
    case when jsonb_typeof(p_payload -> 'bank_accounts') = 'array'
         then p_payload -> 'bank_accounts' else '[]'::jsonb end,
    coalesce((p_payload ->> 'qris_enabled')::boolean, false),
    nullif(trim(coalesce(p_payload ->> 'qris_image_url', '')), ''),
    coalesce(p_payload ->> 'announcement_id', ''),
    coalesce(p_payload ->> 'announcement_en', ''),
    coalesce((p_payload ->> 'is_preorder_open')::boolean, true),
    coalesce((p_payload ->> 'stock_enabled')::boolean, true),
    greatest(0, coalesce((p_payload ->> 'total_stock')::integer, 20)),
    nullif(trim(coalesce(p_payload ->> 'hero_image_url', '')), ''),
    nullif(trim(coalesce(p_payload ->> 'hero_image_mobile_url', '')), ''),
    coalesce(p_payload ->> 'pickup_note_id', ''),
    coalesce(p_payload ->> 'pickup_note_en', ''),
    coalesce(p_payload ->> 'delivery_note_id', ''),
    coalesce(p_payload ->> 'delivery_note_en', ''),
    coalesce((p_payload ->> 'bundle_enabled')::boolean, true),
    greatest(2, coalesce((p_payload ->> 'bundle_size')::integer, 2)),
    greatest(0, coalesce((p_payload ->> 'bundle_price')::integer, 35000))
  )
  on conflict (id) do update set
    store_name        = excluded.store_name,
    tagline_id        = excluded.tagline_id,
    tagline_en        = excluded.tagline_en,
    description_id    = excluded.description_id,
    description_en    = excluded.description_en,
    whatsapp          = excluded.whatsapp,
    address           = excluded.address,
    maps_url          = excluded.maps_url,
    instagram         = excluded.instagram,
    tiktok            = excluded.tiktok,
    hours_id          = excluded.hours_id,
    hours_en          = excluded.hours_en,
    deadline_id       = excluded.deadline_id,
    deadline_en       = excluded.deadline_en,
    min_order         = excluded.min_order,
    max_per_order     = excluded.max_per_order,
    delivery_fee      = excluded.delivery_fee,
    free_shipping_min = excluded.free_shipping_min,
    bank_accounts     = excluded.bank_accounts,
    qris_enabled      = excluded.qris_enabled,
    qris_image_url    = excluded.qris_image_url,
    announcement_id   = excluded.announcement_id,
    announcement_en   = excluded.announcement_en,
    is_preorder_open  = excluded.is_preorder_open,
    stock_enabled     = excluded.stock_enabled,
    total_stock       = excluded.total_stock,
    hero_image_url    = excluded.hero_image_url,
    hero_image_mobile_url = excluded.hero_image_mobile_url,
    pickup_note_id    = excluded.pickup_note_id,
    pickup_note_en    = excluded.pickup_note_en,
    delivery_note_id  = excluded.delivery_note_id,
    delivery_note_en  = excluded.delivery_note_en,
    bundle_enabled    = excluded.bundle_enabled,
    bundle_size       = excluded.bundle_size,
    bundle_price      = excluded.bundle_price;

  return jsonb_build_object('ok', true);
end;
$$;


-- =============================================================================
-- 6. Statistik dashboard tanpa batch
-- =============================================================================

create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'pending_orders',  (select count(*) from public.orders where status = 'pending'),
    'accepted_orders', (select count(*) from public.orders where status = 'accepted'),
    'ready_orders',    (select count(*) from public.orders where status = 'ready'),
    'total_orders',    (select count(*) from public.orders),
    'revenue_today', coalesce((
      select sum(total_price) from public.orders
      where created_at::date = current_date
        and status in ('accepted','ready','delivered')
    ), 0),
    'orders_today',  (select count(*) from public.orders where created_at::date = current_date),
    'revenue_month', coalesce((
      select sum(total_price) from public.orders
      where created_at >= date_trunc('month', now())
        and status in ('accepted','ready','delivered')
    ), 0),
    'flavor_count',  (select count(*) from public.flavors where is_active),
    'stock_enabled', (select stock_enabled from public.store_settings where id = 1),
    'total_stock',   (select total_stock from public.store_settings where id = 1),
    'stock_used', coalesce((
      select sum(item_count) from public.orders
      where status not in ('rejected','cancelled') and created_at::date = current_date
    ), 0),
    'bundle_enabled', (select bundle_enabled from public.store_settings where id = 1),
    'bundle_size',    (select bundle_size from public.store_settings where id = 1),
    'bundle_price',   (select bundle_price from public.store_settings where id = 1),
    'sales_by_flavor', coalesce((
      select jsonb_agg(
        jsonb_build_object('flavor_name', t.flavor_name, 'qty', t.qty)
        order by t.qty desc
      )
      from (
        select oi.flavor_name, sum(oi.quantity)::int as qty
        from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where o.created_at >= date_trunc('month', now())
          and o.status in ('accepted','ready','delivered')
        group by oi.flavor_name
      ) t
    ), '[]'::jsonb)
  );
end;
$$;


-- =============================================================================
-- 7. Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
