-- ============================================================================
--  MIGRASI 17 — Catatan per bundle (dan per item, opsional)
-- ----------------------------------------------------------------------------
-- Sebelum migrasi ini, `create_order` menerima `note` di payload item dan
-- bundle tapi tidak menyimpan ke mana-mana. Migration ini menambah kolom
-- `notes jsonb` di tabel `orders` untuk menyimpan catatan terstruktur
-- (keyed by `bundle_id` atau `flavor_id`), supaya penjual bisa lihat di
-- dashboard admin tanpa migrasi besar.
--
-- Format JSON:
--   {
--     "items":   [{"flavor_id": 3, "note": "jangan pakai cabe"}, ...],
--     "bundles": [{"bundle_id": 1, "note": "jangan pakai saus"}, ...]
--   }
--
-- Backward compat: kolom nullable dan store_settings tidak berubah, jadi
-- migrasi ini safe untuk data lama (kolom akan NULL di baris yang sudah
-- ada).
-- ============================================================================

-- 1. Tambah kolom `notes jsonb` di orders.
alter table public.orders
  add column if not exists notes jsonb;

-- 2. Update `create_order` (yang didefinisikan terakhir di migration-16)
--    untuk menerima note per item dan per bundle, lalu simpan ke kolom
--    `notes` di orders sebagai JSON terstruktur.
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

  -- Catatan terstruktur untuk disimpan ke orders.notes (jsonb).
  v_item_notes       jsonb := '[]'::jsonb;
  v_bundle_notes     jsonb := '[]'::jsonb;
  v_item_note_text   text;
  v_bundle_note_text text;
begin
  v_user_id := coalesce(auth.uid(), p_user_id);

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

  if p_delivery_method = 'delivery' then
    for v_zone in select * from jsonb_array_elements(coalesce(v_settings.delivery_zones, '[]'::jsonb)) loop
      if (v_zone ->> 'id') = p_delivery_zone then
        v_zone_fee := coalesce((v_zone ->> 'fee')::int, 0);
        exit;
      end if;
    end loop;
    v_delivery := v_zone_fee;
  end if;

  -- ===== Item satuan (validasi + catat notes) =====
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_flavor_id is null or v_qty < 1 or v_qty > v_settings.max_per_order then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    select * into v_flavor from public.flavors where id = v_flavor_id and is_active;
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

    -- Catatan per item (opsional). Panjang maks 200 char supaya payload
    -- JSONB tetap ringkas.
    v_item_note_text := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if v_item_note_text is not null then
      if length(v_item_note_text) > 200 then
        v_item_note_text := left(v_item_note_text, 200);
      end if;
      v_item_notes := v_item_notes || jsonb_build_object(
        'flavor_id', v_flavor_id,
        'note', v_item_note_text
      );
    end if;
  end loop;

  -- ===== Bundle (validasi + catat notes) =====
  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots     := v_bundle_entry -> 'slots';

    if v_bundle_id is null then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    select * into v_bundle_rec from public.bundles where id = v_bundle_id and is_active;
    if not found then
      raise exception 'flavor_unavailable' using errcode = '22023';
    end if;

    v_required_qty := v_bundle_rec.required_qty;

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

      if v_bundle_rec.category_id is not null
         and v_flavor.category_id is not null
         and v_flavor.category_id <> v_bundle_rec.category_id then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;

      if v_flavor.category_id is not null then
        v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
        v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                               to_jsonb(v_cat_pcs + 1), true);
      end if;
    end loop;

    -- Catatan per bundle (1 note per bundle). Berlaku untuk semua slot
    -- di bundle tsb. Hanya disimpan kalau ada isinya.
    v_bundle_note_text := nullif(trim(coalesce(v_bundle_entry ->> 'note', '')), '');
    if v_bundle_note_text is not null then
      if length(v_bundle_note_text) > 200 then
        v_bundle_note_text := left(v_bundle_note_text, 200);
      end if;
      v_bundle_notes := v_bundle_notes || jsonb_build_object(
        'bundle_id', v_bundle_id,
        'note', v_bundle_note_text
      );
    end if;

    v_raw      := v_raw + v_bundle_rec.price;
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
    subtotal, delivery_fee, total_price, item_count, language,
    user_id, notes
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
    v_lang,
    v_user_id,
    case
      when v_item_notes = '[]'::jsonb and v_bundle_notes = '[]'::jsonb then null
      else jsonb_build_object('items', v_item_notes, 'bundles', v_bundle_notes)
    end
  )
  returning id into v_order_id;

  -- ===== Item satuan (insert ke order_items) =====
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

  -- ===== Bundle (insert ke order_items per slot + bundle_items audit) =====
  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots     := v_bundle_entry -> 'slots';

    select * into v_bundle_rec from public.bundles where id = v_bundle_id;

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
        v_name || ' (' || v_bundle_rec.name_id || ' #' || v_slot_idx::text || ')',
        v_bundle_rec.price / v_bundle_rec.required_qty,
        1,
        v_bundle_rec.price / v_bundle_rec.required_qty
      );

      insert into public.bundle_items (bundle_id, slot, flavor_id, order_id)
      values (v_bundle_rec.id, v_slot_idx, v_flavor.id, v_order_id);
    end loop;
  end loop;

  return jsonb_build_object(
    'order_code', v_code,
    'order_id',   v_order_id
  );
end;
$$;

grant execute on function public.create_order(
  text, text, text, text, text, text, text, text, text,
  double precision, double precision, text, text, text, text,
  jsonb, jsonb, uuid
) to anon, authenticated;


-- 3. Update `public_invoice` untuk mengembalikan `notes` di JSON
--    supaya halaman sukses menampilkan catatan bundle & item.
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
          with bundle_rows as (
            select
              bi.order_id,
              bi.bundle_id,
              bi.slot,
              bi.flavor_id,
              f.name_id as flavor_name_id,
              f.name_en as flavor_name_en,
              f.slug    as flavor_slug
            from public.bundle_items bi
            join public.flavors f on f.id = bi.flavor_id
            where bi.order_id = ord.id
          ),
          bundle_groups as (
            select
              order_id,
              bundle_id,
              jsonb_agg(
                jsonb_build_object(
                  'slot', br.slot,
                  'flavor_id', br.flavor_id,
                  'flavor_name',
                    case
                      when ord.language = 'en' then br.flavor_name_en
                      else br.flavor_name_id
                    end
                )
                order by br.slot
              ) as slots,
              (
                select b.name_id from public.bundles b where b.id = br.bundle_id
              ) as bundle_name_id,
              (
                select b.name_en from public.bundles b where b.id = br.bundle_id
              ) as bundle_name_en
            from bundle_rows br
            group by order_id, bundle_id
          )
          select jsonb_build_object(
            'bundle_id', bg.bundle_id,
            'bundle_name',
              case
                when ord.language = 'en' then bg.bundle_name_en
                else bg.bundle_name_id
              end,
            'slots', bg.slots,
            'note', (
              select n.note
              from jsonb_array_elements(coalesce(ord.notes -> 'bundles', '[]'::jsonb)) n
              where (n ->> 'bundle_id')::bigint = bg.bundle_id
              limit 1
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