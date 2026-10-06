-- ============================================================================
--  MIGRASI 18 — QRIS Dinamis via Midtrans
-- ----------------------------------------------------------------------------
-- Sebelum migrasi ini, payment_method cuma 'transfer'. Sekarang ditambah
-- 'qris_static' (image statis, manual confirm) dan 'qris_midtrans' (dynamic
-- QR via Midtrans, webhook + polling). Order dibuat dengan payment_method =
-- 'qris_midtrans' akan disimpan bersama transaction_id, qr image URL dan
-- expiry time dari Midtrans.
-- ============================================================================

-- 1. Tambah kolom untuk tracking QRIS Midtrans di orders.
alter table public.orders
  add column if not exists qris_transaction_id text,
  add column if not exists qris_status text,
  add column if not exists qris_qr_url text,
  add column if not exists qris_expires_at timestamptz,
  add column if not exists qris_paid_at timestamptz;

create index if not exists orders_qris_tx_idx on public.orders (qris_transaction_id);

-- 2. Ubah constraint payment_method di orders. Karena kolom `payment_method`
--    bertipe text (bukan enum), kita hanya perlu dokumentasi:
--    allowed values: 'transfer' | 'qris_static' | 'qris_midtrans'.
--    Backend (create_order) validasi nilai ini.

-- 3. Update `create_order` RPC untuk menerima payment_method = qris_midtrans
--    tanpa bukti transfer (proof_path null).
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
  p_bundles          jsonb default '[]'::jsonb,
  p_user_id          uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings   public.store_settings%rowtype;
  v_item       jsonb;
  v_flavor     public.flavors%rowtype;
  v_category   public.categories%rowtype;  -- pisah dari v_flavor biar gak salah assignment saat SELECT INTO
  v_bundle_rec public.bundles%rowtype;
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

  v_user_id          uuid;

  v_item_notes       jsonb := '[]'::jsonb;
  v_bundle_notes     jsonb := '[]'::jsonb;
  v_item_note_text   text;
  v_bundle_note_text text;

  v_payment_method   text;
begin
  v_user_id := coalesce(auth.uid(), p_user_id);

  -- Normalisasi + validasi payment_method
  v_payment_method := lower(coalesce(p_payment_method, 'transfer'));
  if v_payment_method not in ('transfer', 'qris_static', 'qris_midtrans') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(trim(p_customer_name)) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_phone is null or length(public.normalize_phone(p_phone)) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if p_customer_email is not null and length(trim(p_customer_email)) > 0 then
    if p_customer_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception 'invalid_email' using errcode = '22023';
    end if;
  end if;

  if p_instagram is null or length(trim(replace(p_instagram, '@', ''))) = 0 then
    raise exception 'invalid_instagram' using errcode = '22023';
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

  -- QRIS Midtrans tidak butuh bukti upload (pembayaran otomatis dikonfirmasi
  -- via webhook). Static QRIS & transfer masih boleh tanpa bukti.

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

  if p_delivery_method = 'delivery' then
    for v_zone in select * from jsonb_array_elements(coalesce(v_settings.delivery_zones, '[]'::jsonb)) loop
      if (v_zone ->> 'id') = p_delivery_zone then
        v_zone_fee := coalesce((v_zone ->> 'fee')::int, 0);
        exit;
      end if;
    end loop;
    v_delivery := v_zone_fee;
  end if;

  -- Item satuan
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_flavor_id is null or v_qty < 1 or v_qty > v_settings.max_per_order then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    select * into v_flavor from public.flavors where id = v_flavor_id and is_active;
    if not found then raise exception 'flavor_unavailable' using errcode = '22023'; end if;
    v_raw := v_raw + (v_flavor.price * v_qty);
    v_count := v_count + v_qty;
    v_items_ok := v_items_ok + 1;
    if v_flavor.category_id is not null then
      v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
      v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                             to_jsonb(v_cat_pcs + v_qty), true);
    end if;
    v_item_note_text := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if v_item_note_text is not null then
      if length(v_item_note_text) > 200 then v_item_note_text := left(v_item_note_text, 200); end if;
      v_item_notes := v_item_notes || jsonb_build_object('flavor_id', v_flavor_id, 'note', v_item_note_text);
    end if;
  end loop;

  -- Bundle
  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots := v_bundle_entry -> 'slots';
    if v_bundle_id is null then raise exception 'invalid_quantity' using errcode = '22023'; end if;
    select * into v_bundle_rec from public.bundles where id = v_bundle_id and is_active;
    if not found then raise exception 'flavor_unavailable' using errcode = '22023'; end if;
    v_required_qty := v_bundle_rec.required_qty;
    if jsonb_typeof(v_slots) is distinct from 'array' or jsonb_array_length(v_slots) <> v_required_qty then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;
      if v_slot_flavor_id is null then raise exception 'invalid_quantity' using errcode = '22023'; end if;
      select * into v_flavor from public.flavors where id = v_slot_flavor_id and is_active;
      if not found then raise exception 'flavor_unavailable' using errcode = '22023'; end if;
      if v_bundle_rec.category_id is not null and v_flavor.category_id is not null
         and v_flavor.category_id <> v_bundle_rec.category_id then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
      if v_flavor.category_id is not null then
        v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
        v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                               to_jsonb(v_cat_pcs + 1), true);
      end if;
    end loop;
    v_bundle_note_text := nullif(trim(coalesce(v_bundle_entry ->> 'note', '')), '');
    if v_bundle_note_text is not null then
      if length(v_bundle_note_text) > 200 then v_bundle_note_text := left(v_bundle_note_text, 200); end if;
      v_bundle_notes := v_bundle_notes || jsonb_build_object('bundle_id', v_bundle_id, 'note', v_bundle_note_text);
    end if;
    v_raw := v_raw + v_bundle_rec.price;
    v_count := v_count + v_required_qty;
    v_items_ok := v_items_ok + 1;
  end loop;

  if v_items_ok = 0 then raise exception 'empty_cart' using errcode = '22023'; end if;
  if v_count < v_settings.min_order then raise exception 'below_min_order' using errcode = '22023'; end if;

  v_subtotal := v_raw;

  for v_cat_id, v_cat_pcs in
    select (k.key)::bigint, (k.value)::int from jsonb_each(v_per_cat) as k(key, value)
  loop
    select * into v_category from public.categories where id = v_cat_id for update;
    if not found then continue; end if;
    if v_category.stock_enabled and v_cat_pcs > v_category.stock then
      raise exception 'insufficient_stock' using errcode = '22023';
    end if;
    if v_category.stock_enabled then
      update public.categories set stock = greatest(0, stock - v_cat_pcs) where id = v_cat_id;
    end if;
  end loop;

  v_code := 'JS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_code_seq')::text, 3, '0');

  insert into public.orders (
    order_code, customer_name, customer_email, instagram, phone, phone_normalized,
    delivery_method, delivery_zone, address, address_note, lat, lng,
    payment_method, transfer_method, payment_proof_path, note,
    subtotal, delivery_fee, total_price, item_count, language,
    user_id, notes,
    qris_transaction_id, qris_status, qris_qr_url, qris_expires_at
  ) values (
    v_code, trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_instagram, '')), ''),
    trim(p_phone), public.normalize_phone(p_phone),
    p_delivery_method, p_delivery_zone,
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_address_note, '')), ''),
    p_lat, p_lng,
    v_payment_method, nullif(trim(coalesce(p_transfer_method, '')), ''),
    v_proof, left(coalesce(p_note, ''), 500),
    v_subtotal, v_delivery, v_subtotal + v_delivery, v_count,
    v_lang,
    v_user_id,
    case when v_item_notes = '[]'::jsonb and v_bundle_notes = '[]'::jsonb then null
         else jsonb_build_object('items', v_item_notes, 'bundles', v_bundle_notes) end,
    -- Untuk QRIS Midtrans: transaction_id, qr_url, expires_at di-update
    -- nanti via RPC `set_order_qris_charge` setelah Midtrans charge sukses.
    -- qris_status di-set 'pending' dulu supaya ada di DB.
    null,  -- qris_transaction_id
    case when v_payment_method = 'qris_midtrans' then 'pending' else null end,  -- qris_status
    null,  -- qris_qr_url
    null   -- qris_expires_at
  )
  returning id into v_order_id;

  -- Insert order_items (sama dengan migration-16/17)
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty := (v_item ->> 'quantity')::integer;
    select * into v_flavor from public.flavors where id = v_flavor_id;
    v_name := case when v_lang = 'en' then v_flavor.name_en else v_flavor.name_id end;
    insert into public.order_items (order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total)
    values (v_order_id, v_flavor.id, v_flavor.slug, v_name, v_flavor.price, v_qty, v_flavor.price * v_qty);
  end loop;

  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots := v_bundle_entry -> 'slots';
    select * into v_bundle_rec from public.bundles where id = v_bundle_id;
    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;
      select * into v_flavor from public.flavors where id = v_slot_flavor_id;
      v_name := case when v_lang = 'en' then v_flavor.name_en else v_flavor.name_id end;
      insert into public.order_items (order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total)
      values (
        v_order_id, v_flavor.id, v_flavor.slug,
        v_name || ' (' || v_bundle_rec.name_id || ' #' || v_slot_idx::text || ')',
        v_bundle_rec.price / v_bundle_rec.required_qty, 1,
        v_bundle_rec.price / v_bundle_rec.required_qty
      );
      insert into public.bundle_items (bundle_id, slot, flavor_id, order_id)
      values (v_bundle_rec.id, v_slot_idx, v_flavor.id, v_order_id);
    end loop;
  end loop;

  return jsonb_build_object('order_code', v_code, 'order_id', v_order_id);
end;
$$;

grant execute on function public.create_order(
  text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text,
  jsonb, jsonb, uuid
) to anon, authenticated;


-- 4. RPC untuk update qris_transaction_id / qr_url / expires_at setelah
--    Midtrans charge sukses. Dipakai oleh server action `createQrisOrderAction`
--    setelah kita panggil Midtrans API.
create or replace function public.set_order_qris_charge(
  p_order_code text,
  p_transaction_id text,
  p_qr_url text,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_payment_method text;
begin
  select id, payment_method into v_order_id, v_payment_method
  from public.orders
  where upper(order_code) = upper(p_order_code)
  limit 1;

  if v_order_id is null then
    raise exception 'order_not_found' using errcode = '22023';
  end if;
  if v_payment_method is distinct from 'qris_midtrans' then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  update public.orders
  set qris_transaction_id = p_transaction_id,
      qris_status         = 'pending',
      qris_qr_url         = p_qr_url,
      qris_expires_at     = p_expires_at
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'qris_status', 'pending'
  );
end;
$$;

grant execute on function public.set_order_qris_charge(text, text, text, timestamptz) to anon, authenticated;


-- 5. RPC untuk update qris_status (dipakai webhook + polling).
create or replace function public.set_order_qris_status(
  p_transaction_id text,
  p_status text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id bigint;
  v_allowed_status text[] := array['pending', 'paid', 'expired', 'failed', 'refunded', 'cancelled'];
begin
  if lower(p_status) <> all(v_allowed_status) then
    raise exception 'invalid_qris_status' using errcode = '22023';
  end if;

  select id into v_order_id
  from public.orders
  where qris_transaction_id = p_transaction_id
  limit 1;

  if v_order_id is null then
    raise exception 'order_not_found' using errcode = '22023';
  end if;

  update public.orders
  set qris_status = lower(p_status),
      -- Kalau status paid, set qris_paid_at ke now(). Kalau ke paid dan
      -- order status masih 'pending', naikkan ke 'accepted' (siap dibuat).
      qris_paid_at = case when lower(p_status) = 'paid' then now() else qris_paid_at end,
      status = case
        when lower(p_status) = 'paid' and status = 'pending' then 'accepted'
        when lower(p_status) in ('expired', 'failed', 'cancelled') and status = 'pending' then 'rejected'
        else status
      end
  where id = v_order_id;

  return jsonb_build_object('order_id', v_order_id, 'qris_status', lower(p_status));
end;
$$;

grant execute on function public.set_order_qris_status(text, text) to anon, authenticated;


-- 6. RPC publik untuk polling status QRIS (dipakai frontend tanpa login).
--    Return null kalau order tidak ditemukan. Hanya return field minimum
--    supaya tidak bocor data sensitif.
create or replace function public.public_order_qris_status(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_qris_status text;
  v_qris_paid_at timestamptz;
  v_order_status text;
begin
  select id, qris_status, qris_paid_at, status
    into v_id, v_qris_status, v_qris_paid_at, v_order_status
  from public.orders
  where upper(order_code) = upper(p_code)
  limit 1;

  if v_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'order_code', p_code,
    'qris_status', v_qris_status,
    'qris_paid_at', v_qris_paid_at,
    'order_status', v_order_status
  );
end;
$$;

grant execute on function public.public_order_qris_status(text) to anon, authenticated;


-- 7. Update public_invoice untuk expose qris_status + qris_paid_at supaya
--    halaman sukses & track bisa menampilkan status pembayaran.
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
  where upper(o.order_code) = upper(p_code)
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
      'notes', ord.notes,
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
      'qris_status', ord.qris_status,
      'qris_paid_at', ord.qris_paid_at,
      'flat_items', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (
          select flavor_name, quantity, unit_price, line_total
          from public.order_items where order_id = ord.id order by id
        ) t
      ),
      'bundles', (
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          with bundle_rows as (
            select bi.order_id, bi.bundle_id, bi.slot, bi.flavor_id,
                   f.name_id as flavor_name_id, f.name_en as flavor_name_en, f.slug as flavor_slug
            from public.bundle_items bi
            join public.flavors f on f.id = bi.flavor_id
            where bi.order_id = ord.id
          ),
          bundle_groups as (
            select order_id, bundle_id,
              jsonb_agg(jsonb_build_object(
                'slot', br.slot,
                'flavor_id', br.flavor_id,
                'flavor_name', case when ord.language = 'en' then br.flavor_name_en else br.flavor_name_id end
              ) order by br.slot) as slots,
              (select b.name_id from public.bundles b where b.id = br.bundle_id) as bundle_name_id,
              (select b.name_en from public.bundles b where b.id = br.bundle_id) as bundle_name_en
            from bundle_rows br
            group by order_id, bundle_id
          )
          select jsonb_build_object(
            'bundle_id', bg.bundle_id,
            'bundle_name', case when ord.language = 'en' then bg.bundle_name_en else bg.bundle_name_id end,
            'slots', bg.slots,
            'note', (
              select n ->> 'note' from jsonb_array_elements(coalesce(ord.notes -> 'bundles', '[]'::jsonb)) n
              where (n ->> 'bundle_id')::bigint = bg.bundle_id limit 1
            )
          ) as b
          from bundle_groups bg
        ) sub
      ),
      'item_notes', (
        select coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
        from jsonb_array_elements(coalesce(ord.notes -> 'items', '[]'::jsonb)) n
      )
    )
    from ord
  );
end;
$$;

grant execute on function public.public_invoice(text) to anon, authenticated;


notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');