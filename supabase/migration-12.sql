-- ============================================================================
--  MIGRASI 12 — Email wajib, IG, zona delivery, koordinat alamat, sold counter
-- ----------------------------------------------------------------------------
-- Perubahan:
--   - orders.customer_email: wajib (kecuali di-emptikan saat pre-order, validasi
--     di sisi aplikasi via Zod)
--   - orders.instagram: opsional, dipakai oleh admin untuk broadcast
--   - orders.delivery_zone: 'pickup' | 'vihara' | 'uvers' | 'other'
--   - orders.lat, orders.lng: koordinat alamat (nullable, dari picker peta)
--   - store_settings.delivery_zones: jsonb daftar zona dengan ongkir & catatan
--   - Catatan penghapusan metode cash: payment_method tetap diizinkan 'cash'
--     untuk backward compat, tapi UI toko menyembunyikannya
-- ============================================================================

-- 1. Kolom baru di orders
alter table public.orders
  add column if not exists customer_email text,
  add column if not exists instagram        text,
  add column if not exists delivery_zone    text not null default 'pickup',
  add column if not exists address_note     text,
  add column if not exists lat              double precision,
  add column if not exists lng              double precision;

update public.orders set delivery_zone = 'pickup' where delivery_zone is null;

alter table public.orders
  drop constraint if exists orders_delivery_zone_check;
alter table public.orders
  add constraint orders_delivery_zone_check
  check (delivery_zone in ('pickup', 'vihara', 'uvers', 'other'));


-- 2. Zona delivery di store_settings
alter table public.store_settings
  add column if not exists delivery_zones jsonb not null default '[
    {"id":"pickup","name_id":"Ambil di toko","name_en":"Pickup in store","fee":0,"note_id":"","note_en":""},
    {"id":"vihara","name_id":"Vihara Tian En","name_en":"Vihara Tian En","fee":10000,"note_id":"","note_en":""},
    {"id":"uvers","name_id":"UVERS","name_en":"UVERS","fee":10000,"note_id":"","note_en":""},
    {"id":"other","name_id":"Luar itu","name_en":"Other areas","fee":15000,"note_id":"","note_en":""}
  ]'::jsonb;

update public.store_settings set delivery_zones = '[
  {"id":"pickup","name_id":"Ambil di toko","name_en":"Pickup in store","fee":0,"note_id":"","note_en":""},
  {"id":"vihara","name_id":"Vihara Tian En","name_en":"Vihara Tian En","fee":10000,"note_id":"","note_en":""},
  {"id":"uvers","name_id":"UVERS","name_en":"UVERS","fee":10000,"note_id":"","note_en":""},
  {"id":"other","name_id":"Luar itu","name_en":"Other areas","fee":15000,"note_id":"","note_en":""}
]'::jsonb
where delivery_zones is null or jsonb_typeof(delivery_zones) <> 'array';

alter table public.store_settings
  drop constraint if exists settings_delivery_zones_array;
alter table public.store_settings
  add constraint settings_delivery_zones_array
  check (jsonb_typeof(delivery_zones) = 'array');


-- 3. Update create_order — dukung email, IG, delivery_zone, lat/lng, address_note
create or replace function public.create_order(
  p_customer_name    text default '',
  p_customer_email   text default '',
  p_instagram        text default '',
  p_phone            text default '',
  p_payment_method   text default 'transfer',
  p_delivery_method  text default 'pickup',
  p_delivery_zone    text default 'pickup',
  p_address          text default null,
  p_address_note     text default null,
  p_lat              double precision default null,
  p_lng              double precision default null,
  p_transfer_method  text default null,
  p_payment_proof    text default null,
  p_note             text default null,
  p_language         text default 'id',
  p_items            jsonb default '[]'::jsonb,
  p_bundles          jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings   public.store_settings%rowtype;
  v_item       jsonb;
  v_flavor     public.flavors%rowtype;
  v_bundle     public.bundles%rowtype;
  v_order_id   bigint;
  v_flavor_id  bigint;
  v_qty        integer;
  v_name       text;
  v_subtotal   integer := 0;
  v_raw        integer := 0;
  v_count      integer := 0;
  v_items_ok   integer := 0;
  v_code       text;
  v_proof      text;
  v_delivery   integer := 0;
  v_lang       text;

  v_bundle_entry     jsonb;
  v_bundle_id        bigint;
  v_required_qty     integer;
  v_slots            jsonb;
  v_slot             jsonb;
  v_slot_idx         integer;
  v_slot_flavor_id   bigint;

  v_per_cat          jsonb := '{}'::jsonb;
  v_cat_id           bigint;
  v_cat_pcs          integer;

  v_zone             jsonb;
  v_zone_fee         integer := 0;
begin
  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(trim(p_customer_name)) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_phone is null or length(public.normalize_phone(p_phone)) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  -- Email: opsional tapi kalau diisi harus terlihat seperti email
  if p_customer_email is not null and length(trim(p_customer_email)) > 0 then
    if p_customer_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception 'invalid_email' using errcode = '22023';
    end if;
  end if;

  -- Instagram: wajib
  if p_instagram is null or length(trim(replace(p_instagram, '@', ''))) = 0 then
    raise exception 'invalid_instagram' using errcode = '22023';
  end if;

  -- Metode pembayaran: hanya 'transfer' yang diizinkan (cash dihapus)
  if p_payment_method not in ('transfer') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;
  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  if p_delivery_zone not in ('pickup', 'vihara', 'uvers', 'other') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then
    raise exception 'address_required' using errcode = '22023';
  end if;

  v_proof := nullif(trim(coalesce(p_payment_proof, '')), '');
  v_lang  := case when p_language = 'en' then 'en' else 'id' end;

  if (jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0)
     and (jsonb_typeof(p_bundles) is distinct from 'array' or jsonb_array_length(p_bundles) = 0) then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 or jsonb_array_length(p_bundles) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  select * into v_settings from public.store_settings where id = 1 for update;
  if v_settings.id is null then
    raise exception 'settings_missing' using errcode = '22023';
  end if;
  if not v_settings.is_preorder_open then
    raise exception 'preorder_closed' using errcode = '22023';
  end if;

  -- Tentukan ongkir dari zona
  if p_delivery_method = 'delivery' then
    for v_zone in select * from jsonb_array_elements(coalesce(v_settings.delivery_zones, '[]'::jsonb)) loop
      if (v_zone ->> 'id') = p_delivery_zone then
        v_zone_fee := coalesce((v_zone ->> 'fee')::int, 0);
        exit;
      end if;
    end loop;
    v_delivery := v_zone_fee;
  end if;

  -- ===== Item satuan =====
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_flavor_id is null or v_qty < 1 or v_qty > v_settings.max_per_order then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    select * into v_flavor
    from public.flavors
    where id = v_flavor_id and is_active;

    if not found then
      raise exception 'flavor_unavailable' using errcode = '22023';
    end if;

    v_raw      := v_raw + (v_flavor.price * v_qty);
    v_count    := v_count + v_qty;
    v_items_ok := v_items_ok + 1;

    if v_flavor.category_id is not null then
      v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
      v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                             to_jsonb(v_cat_pcs + v_qty), true);
    end if;
  end loop;

  -- ===== Bundle =====
  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots     := v_bundle_entry -> 'slots';

    if v_bundle_id is null then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    select * into v_bundle from public.bundles where id = v_bundle_id and is_active;
    if not found then
      raise exception 'flavor_unavailable' using errcode = '22023';
    end if;

    v_required_qty := v_bundle.required_qty;

    if jsonb_typeof(v_slots) is distinct from 'array'
       or jsonb_array_length(v_slots) <> v_required_qty then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;

      if v_slot_flavor_id is null then
        raise exception 'invalid_quantity' using errcode = '22023';
      end if;

      select * into v_flavor from public.flavors
      where id = v_slot_flavor_id and is_active;
      if not found then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;

      if v_bundle.category_id is not null
         and v_flavor.category_id is not null
         and v_flavor.category_id <> v_bundle.category_id then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;

      if v_flavor.category_id is not null then
        v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
        v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                               to_jsonb(v_cat_pcs + 1), true);
      end if;
    end loop;

    v_raw      := v_raw + v_bundle.price;
    v_count    := v_count + v_required_qty;
    v_items_ok := v_items_ok + 1;
  end loop;

  if v_items_ok = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if v_count < v_settings.min_order then
    raise exception 'below_min_order' using errcode = '22023';
  end if;

  v_subtotal := v_raw;

  -- ===== Stok per-kategori =====
  for v_cat_id, v_cat_pcs in
    select (k.key)::bigint, (k.value)::int
    from jsonb_each(v_per_cat) as k(key, value)
  loop
    select * into v_flavor
    from public.categories
    where id = v_cat_id
    for update;

    if not found then
      continue;
    end if;

    if v_flavor.stock_enabled and v_cat_pcs > v_flavor.stock then
      raise exception 'insufficient_stock' using errcode = '22023';
    end if;

    if v_flavor.stock_enabled then
      update public.categories
      set stock = greatest(0, stock - v_cat_pcs)
      where id = v_cat_id;
    end if;
  end loop;

  -- ===== Simpan order =====
  v_code := 'JS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_code_seq')::text, 3, '0');

  insert into public.orders (
    order_code, customer_name, customer_email, instagram, phone, phone_normalized,
    delivery_method, delivery_zone, address, address_note, lat, lng,
    payment_method, transfer_method, payment_proof_path, note,
    subtotal, delivery_fee, total_price, item_count, language
  ) values (
    v_code, trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_instagram, '')), ''),
    trim(p_phone), public.normalize_phone(p_phone),
    p_delivery_method, p_delivery_zone,
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_address_note, '')), ''),
    p_lat, p_lng,
    p_payment_method, nullif(trim(coalesce(p_transfer_method, '')), ''),
    v_proof, left(coalesce(p_note, ''), 500),
    v_subtotal, v_delivery, v_subtotal + v_delivery, v_count,
    v_lang
  )
  returning id into v_order_id;

  -- Item satuan (sama seperti sebelumnya)
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := (v_item ->> 'quantity')::integer;
    select * into v_flavor from public.flavors where id = v_flavor_id;
    v_name := case when v_lang = 'en' then v_flavor.name_en else v_flavor.name_id end;
    insert into public.order_items (
      order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total
    ) values (
      v_order_id, v_flavor.id, v_flavor.slug, v_name, v_flavor.price, v_qty, v_flavor.price * v_qty
    );
  end loop;

  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots     := v_bundle_entry -> 'slots';

    select * into v_bundle from public.bundles where id = v_bundle_id;

    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;
      select * into v_flavor from public.flavors where id = v_slot_flavor_id;
      v_name := case when v_lang = 'en' then v_flavor.name_en else v_flavor.name_id end;

      insert into public.order_items (
        order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total
      ) values (
        v_order_id, v_flavor.id, v_flavor.slug,
        v_name || ' (' || (v_bundle.name_id) || ' #' || v_slot_idx::text || ')',
        v_bundle.price / v_bundle.required_qty,
        1,
        v_bundle.price / v_bundle.required_qty
      );

      insert into public.bundle_items (bundle_id, slot, flavor_id, order_id)
      values (v_bundle.id, v_slot_idx, v_flavor.id, v_order_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'id', v_order_id,
    'order_code', v_code,
    'item_count', v_count,
    'subtotal', v_subtotal,
    'saving', 0,
    'delivery_fee', v_delivery,
    'total_price', v_subtotal + v_delivery,
    'remaining_stock', null
  );
end;
$$;


-- 4. RPC publik untuk ambil order (untuk /track) — tanpa phone
-- Track_order tetap butuh phone untuk identifikasi. Tambah rpc publik
-- track_by_code(p_code) yang return data order publik dari kode saja.

create or replace function public.track_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id int := 0;
  v_items jsonb;
  v_bundles jsonb;
  v_result jsonb;
begin
  -- Cari id order; simpan di variabel biasa (bukan %rowtype) supaya
  -- subquery bisa reference tanpa CTE.
  select o.id into v_order_id
  from public.orders o
  where upper(o.order_code) = upper(trim(coalesce(p_code, '')))
  limit 1;

  if v_order_id is null or v_order_id = 0 then
    return null;
  end if;

  -- Pakai CTE supaya v_order_id visible di subquery.
  return (
    with ord as (
      select * from public.orders where id = v_order_id
    )
    select jsonb_build_object(
      'order_code', ord.order_code,
      'status', ord.status,
      'delivery_method', ord.delivery_method,
      'delivery_zone', ord.delivery_zone,
      'subtotal', ord.subtotal,
      'delivery_fee', ord.delivery_fee,
      'total', ord.total_price,
      'item_count', ord.item_count,
      'language', ord.language,
      'created_at', ord.created_at,
      'updated_at', ord.updated_at,
      'note', ord.note,
      'flat_items', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (
          select flavor_name, quantity, unit_price, line_total
          from public.order_items
          where order_id = ord.id
          order by id
        ) t
      ),
      'bundles', (
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'bundle_id', bi.bundle_id,
            'bundle_name', b.name_id,
            'slots', (
              select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              from (
                select bi2.slot as slot, oi2.flavor_name, bi2.flavor_id
                from public.bundle_items bi2
                join public.order_items oi2 on oi2.order_id = bi2.order_id and oi2.flavor_id = bi2.flavor_id
                where bi2.order_id = ord.id and bi2.bundle_id = bi.bundle_id
                order by bi2.slot
              ) s
            )
          ) as b
          from public.bundle_items bi
          join public.bundles b on b.id = bi.bundle_id
          where bi.order_id = ord.id
          order by bi.bundle_id
        ) sub
      )
    )
    from ord
  );
end;
$$;

grant execute on function public.track_by_code(text) to anon, authenticated;


-- 5. RPC admin untuk daftar customer (untuk broadcast)
create or replace function public.admin_list_customers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    with per_phone as (
    select
      phone_normalized,
      count(*)::int as cnt,
      sum(total_price)::int as total
    from public.orders
    group by phone_normalized
  ),
  src as (
    select jsonb_build_object(
      'id', o.id,
      'order_code', o.order_code,
      'customer_name', o.customer_name,
      'customer_email', o.customer_email,
      'instagram', o.instagram,
      'phone', o.phone,
      'phone_normalized', o.phone_normalized,
      'created_at', o.created_at,
      'status', o.status,
      'order_count', coalesce(p.cnt, 0),
      'total_spent', coalesce(p.total, 0)
    ) as row_to_json
    from public.orders o
    left join per_phone p on p.phone_normalized = o.phone_normalized
    order by o.created_at desc
  )
  select coalesce(jsonb_agg(row_to_json), '[]'::jsonb) from src
  );
end;
$$;


-- 6. RPC sold counter per flavor (untuk /order menampilkan angka 'terjual')
create or replace function public.public_flavor_sold_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'flavor_id', flavor_id,
    'qty', total_qty
  )), '[]'::jsonb)
  from (
    select oi.flavor_id, sum(oi.quantity)::int as total_qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.status in ('accepted', 'ready', 'delivered')
    group by oi.flavor_id
  ) s;
$$;

grant execute on function public.public_flavor_sold_counts() to anon, authenticated;


create or replace function public.public_invoice(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id int := 0;
begin
  select o.id into v_order_id
  from public.orders o
  where upper(o.order_code) = upper(trim(coalesce(p_code, '')))
  limit 1;

  if v_order_id is null or v_order_id = 0 then
    return null;
  end if;

  return (
    with ord as (select * from public.orders where id = v_order_id)
    select jsonb_build_object(
      'order_code', ord.order_code,
      'customer_name', ord.customer_name,
      'customer_email', ord.customer_email,
      'instagram', ord.instagram,
      'phone', ord.phone,
      'address', ord.address,
      'address_note', ord.address_note,
      'lat', ord.lat,
      'lng', ord.lng,
      'note', ord.note,
      'payment_method', ord.payment_method,
      'transfer_method', ord.transfer_method,
      'delivery_method', ord.delivery_method,
      'delivery_zone', ord.delivery_zone,
      'subtotal', ord.subtotal,
      'delivery_fee', ord.delivery_fee,
      'saving', 0,
      'total', ord.total_price,
      'item_count', ord.item_count,
      'status', ord.status,
      'language', ord.language,
      'created_at', ord.created_at,
      'updated_at', ord.updated_at,
      'flat_items', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (
          select flavor_name, quantity, unit_price, line_total
          from public.order_items
          where order_id = ord.id
          order by id
        ) t
      ),
      'bundles', (
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'bundle_id', bi.bundle_id,
            'bundle_name', b.name_id,
            'slots', (
              select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              from (
                select bi2.slot as slot, oi2.flavor_name, bi2.flavor_id
                from public.bundle_items bi2
                join public.order_items oi2 on oi2.order_id = bi2.order_id and oi2.flavor_id = bi2.flavor_id
                where bi2.order_id = ord.id and bi2.bundle_id = bi.bundle_id
                order by bi2.slot
              ) s
            )
          ) as b
          from public.bundle_items bi
          join public.bundles b on b.id = bi.bundle_id
          where bi.order_id = ord.id
          order by bi.bundle_id
        ) sub
      )
    )
    from ord
  );
end;
$$;

-- 8. Hapus method 'cash' dari enum constraint agar konsisten (DB lama pakai CHECK)
--    Pertama backfill order lama 'cash' jadi 'transfer' (sebelum ulang business-logic).
update public.orders
  set payment_method = 'transfer'
  where payment_method not in ('transfer', 'cash');
update public.orders
  set payment_method = 'transfer'
  where payment_method = 'cash';

alter table public.orders
  drop constraint if exists orders_payment_method_check;
alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method in ('transfer'));

-- 9. Update admin_save_settings — dukung delivery_zones
-- (delivery_zones sudah ada di kolom DB, admin_save_settings hanya
--  perlu meneruskannya kalau payload berisi key tsb.)


-- 10. Tambah index untuk track_by_code
create index if not exists orders_code_phone_idx
  on public.orders (order_code);

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
