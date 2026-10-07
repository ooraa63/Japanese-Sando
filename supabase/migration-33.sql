-- ============================================================================
-- MIGRATION 33 — IG optional + zone validation lewat tabel delivery_zones
-- ============================================================================

drop function if exists public.create_order(
    p_customer_name    text,
  p_customer_email   text,
  p_instagram        text,
  p_phone            text,
  p_payment_method   text,
  p_delivery_method  text,
  p_delivery_zone    text,
  p_address          text,
  p_address_note     text,
  p_lat              double precision,
  p_lng              double precision,
  p_transfer_method  text,
  p_payment_proof    text,
  p_note             text,
  p_language         text,
  p_items            jsonb,
  p_bundles          jsonb,
  p_user_id          uuid
);

create function public.create_order(
    p_customer_name    text DEFAULT ''::text,
  p_customer_email   text DEFAULT ''::text,
  p_instagram        text DEFAULT ''::text,
  p_phone            text DEFAULT ''::text,
  p_payment_method   text DEFAULT 'transfer'::text,
  p_delivery_method  text DEFAULT 'pickup'::text,
  p_delivery_zone    text DEFAULT 'pickup'::text,
  p_address          text DEFAULT NULL::text,
  p_address_note     text DEFAULT NULL::text,
  p_lat              double precision DEFAULT NULL::double precision,
  p_lng              double precision DEFAULT NULL::double precision,
  p_transfer_method  text DEFAULT NULL::text,
  p_payment_proof    text DEFAULT NULL::text,
  p_note             text DEFAULT NULL::text,
  p_language         text DEFAULT 'id'::text,
  p_items            jsonb DEFAULT '[]'::jsonb,
  p_bundles          jsonb DEFAULT '[]'::jsonb,
  p_user_id          uuid DEFAULT NULL::uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$

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

  -- Migration-33: instagram optional (cuma nama + phone wajib)

  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  -- Migration-32: zone sekarang dari tabel delivery_zones (admin-defined).
  -- Migration-33: support both 'pickup' legacy dan zone ID apa pun yang aktif di tabel.
  if not exists (
    select 1 from public.delivery_zones
      where id = p_delivery_zone and is_active = true
  ) and p_delivery_zone <> 'pickup' then
    raise exception 'invalid_zone' using errcode = '22023';
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
  -- Migration-33: min_order rule dihapus (setting gak punya min_order ini lagi).
  -- Skip validasi min_order — kalau admin mau aktifkan lagi, restore baris ini.
  -- if v_count < v_settings.min_order then raise exception 'below_min_order' using errcode = '22023'; end if;

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
$body$;

comment on function public.create_order(
  p_customer_name    text,
  p_customer_email   text,
  p_instagram        text,
  p_phone            text,
  p_payment_method   text,
  p_delivery_method  text,
  p_delivery_zone    text,
  p_address          text,
  p_address_note     text,
  p_lat              double precision,
  p_lng              double precision,
  p_transfer_method  text,
  p_payment_proof    text,
  p_note             text,
  p_language         text,
  p_items            jsonb,
  p_bundles          jsonb,
  p_user_id          uuid) is
  'RPC buyer: buat pesanan. Nama + phone wajib. Email & Instagram OPTIONAL (guest-friendly, migration-33). Zone validation lewat tabel delivery_zones (migration-32).';
