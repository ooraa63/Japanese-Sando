-- =============================================================================
-- 10. Bukti transfer jadi OPSIONAL saat pesan
--
-- Sebelumnya `create_order` selalu raise `proof_required` bila payment_method
-- adalah 'transfer' dan bukti belum diupload. Itu membuat alur chat terasa
-- kaku — pembeli yang baru mau lihat nomor rekening & invoice belum tentu
-- sudah selesai transfer saat submit.
--
-- Setelah diskusi: toko lebih prefer menjual dulu, lalu verifikasi bukti via
-- WhatsApp setelahnya. Bukti yang ada saat submit tetap disimpan; bukti
-- yang datang belakangan akan dikirim via link WA / halaman track (lihat
-- TODO admin upload proof manual, belum dibangun).
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
  v_category   public.categories%rowtype;
  v_order_id   bigint;
  v_flavor_id  bigint;
  v_qty        integer;
  v_name       text;
  v_calc       jsonb;
  v_subtotal   integer := 0;
  v_raw        integer := 0;
  v_count      integer := 0;
  v_items_ok   integer := 0;
  v_code       text;
  v_proof      text;
  v_delivery   integer := 0;
  v_flavors    jsonb;
  v_cat        record;
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
  if p_payment_method not in ('transfer', 'cash') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;
  if p_delivery_method not in ('pickup', 'delivery') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then
    raise exception 'address_required' using errcode = '22023';
  end if;

  -- Bukti transfer jadi OPSIONAL: boleh null saat pesan. Penjual akan
  -- minta via WhatsApp kalau belum ada. Yang penting: kalau diisi,
  -- formatnya harus path yang valid (bukan string kosong).
  v_proof := nullif(trim(coalesce(p_payment_proof, '')), '');

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  select * into v_settings from public.store_settings where id = 1 for update;
  if v_settings.id is null then
    raise exception 'settings_missing' using errcode = '22023';
  end if;
  if not v_settings.is_preorder_open then
    raise exception 'preorder_closed' using errcode = '22023';
  end if;

  v_flavors := '[]'::jsonb;

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

    v_raw      := v_raw + (v_flavor.price * v_qty);
    v_count    := v_count + v_qty;
    v_items_ok := v_items_ok + 1;
    v_flavors  := v_flavors || jsonb_build_array(
      jsonb_build_object('id', v_flavor.id, 'qty', v_qty)
    );
  end loop;

  if v_items_ok = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if v_count < v_settings.min_order then
    raise exception 'below_min_order' using errcode = '22023';
  end if;

  v_subtotal := 0;
  for v_cat in
    select c.id as cat_id,
           c.bundle_tiers as tiers,
           sum(coalesce((f ->> 'qty')::int, 0))::int as total_qty
    from jsonb_array_elements(v_flavors) f
    join public.flavors fl on fl.id = (f ->> 'id')::bigint
    left join public.categories c on c.id = fl.category_id
    group by c.id, c.bundle_tiers
  loop
    v_calc := public.flavor_total(
      v_cat.tiers,
      v_cat.total_qty,
      public.v_avg_of_category(v_cat.cat_id)
    );
    v_subtotal := v_subtotal + (v_calc ->> 'total')::integer;
  end loop;

  v_delivery := case when p_delivery_method = 'delivery' then v_settings.delivery_fee else 0 end;

  if v_settings.stock_enabled and v_count > v_settings.total_stock then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;
  if v_settings.stock_enabled then
    update public.store_settings set total_stock = total_stock - v_count where id = 1;
  end if;

  v_code := 'JS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.order_code_seq')::text, 3, '0');

  insert into public.orders (
    order_code, customer_name, phone, phone_normalized, delivery_method, address,
    payment_method, transfer_method, payment_proof_path, note,
    subtotal, delivery_fee, total_price, item_count, language
  ) values (
    v_code, trim(p_customer_name), trim(p_phone), public.normalize_phone(p_phone),
    p_delivery_method, nullif(trim(coalesce(p_address, '')), ''),
    p_payment_method, nullif(trim(coalesce(p_transfer_method, '')), ''),
    v_proof, left(coalesce(p_note, ''), 500),
    v_subtotal, v_delivery, v_subtotal + v_delivery, v_count,
    case when p_language = 'en' then 'en' else 'id' end
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := (v_item ->> 'quantity')::integer;
    select * into v_flavor from public.flavors where id = v_flavor_id;
    v_name := case when coalesce(p_language, 'id') = 'en'
                   then v_flavor.name_en else v_flavor.name_id end;
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
    'subtotal', v_subtotal,
    'saving', v_raw - v_subtotal,
    'delivery_fee', v_delivery,
    'total_price', v_subtotal + v_delivery,
    'remaining_stock', (select case when stock_enabled then total_stock else null end
                        from public.store_settings where id = 1)
  );
end;
$$;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');