-- ============================================================================
--  MIGRASI 11 — Bundle sebagai item eksplisit + Stok per-kategori
-- ----------------------------------------------------------------------------
-- Mengikuti keputusan pemilik toko:
--   1. Sistem "harga paket" lama (categories.bundle_tiers + calcBundle) sudah
--      tidak dipakai di UI toko dan diganti dengan **Bundle** sebagai item
--      eksplisit yang penjual bisa buat (lihat tabel `bundles`).
--   2. Stok dihitung per-kategori, bukan global. Penjual memilih menu lalu
--      mengisi stok kategori itu. `flavors.stock` tetap ada (untuk tampilan
--      'hampir habis' saja) tapi `create_order` hanya cek `categories.stock`.
--   3. Favorite tetap memakai kolom `is_featured` yang sudah ada.
-- ============================================================================


-- =============================================================================
-- 1. Tabel `bundles` — paket kombinasi yang dijual eksplisit
-- =============================================================================
create table if not exists public.bundles (
  id              bigserial primary key,
  category_id     bigint references public.categories(id) on delete set null,
  slug            text    not null unique,
  name_id         text    not null,
  name_en         text    not null,
  desc_id         text    not null default '',
  desc_en         text    not null default '',
  price           integer not null check (price >= 0),
  required_qty    integer not null default 2 check (required_qty >= 1),
  image_url       text,
  is_active       boolean not null default true,
  is_featured     boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists bundles_sort_idx       on public.bundles (sort_order, id);
create index if not exists bundles_category_idx  on public.bundles (category_id);
create index if not exists bundles_featured_idx  on public.bundles (is_featured) where is_featured;

drop trigger if exists bundles_touch on public.bundles;
create trigger bundles_touch before update on public.bundles
for each row execute function public.touch_updated_at();

alter table public.bundles enable row level security;

drop policy if exists bundles_public_read on public.bundles;
create policy bundles_public_read on public.bundles
for select using (true);

drop policy if exists bundles_admin_write on public.bundles;
create policy bundles_admin_write on public.bundles
for all using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- 2. Tabel `bundle_items` — pilihan rasa di dalam satu bundle
--
-- Satu bundle berisi `required_qty` slot. Setiap slot pembeli akan memilih
-- satu rasa. Tidak divalidasi uniqueness per slot di level DB — penerapan
-- di sisi aplikasi.
-- =============================================================================
create table if not exists public.bundle_items (
  id          bigserial primary key,
  bundle_id   bigint not null references public.bundles(id) on delete cascade,
  slot        integer not null check (slot >= 1),
  flavor_id   bigint not null references public.flavors(id) on delete restrict,
  order_id    bigint references public.orders(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create unique index if not exists bundle_items_order_slot
  on public.bundle_items (order_id, slot)
  where order_id is not null;

create index if not exists bundle_items_bundle_idx  on public.bundle_items (bundle_id);
create index if not exists bundle_items_flavor_idx  on public.bundle_items (flavor_id);
create index if not exists bundle_items_order_idx   on public.bundle_items (order_id);

alter table public.bundle_items enable row level security;

drop policy if exists bundle_items_public_read on public.bundle_items;
create policy bundle_items_public_read on public.bundle_items
for select using (true);

drop policy if exists bundle_items_admin_write on public.bundle_items;
create policy bundle_items_admin_write on public.bundle_items
for all using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- 3. Stok per-kategori
-- =============================================================================
alter table public.categories
  add column if not exists stock_enabled boolean not null default true,
  add column if not exists stock         integer not null default 0 check (stock >= 0);

update public.categories set stock_enabled = true where stock_enabled is null;
update public.categories set stock = 0 where stock is null;


-- =============================================================================
-- 4. Drop kolom & function yang sudah tidak dipakai
--    `bundle_tiers` di categories & flavors, `flavor_total`, `clean_bundle_tiers`
-- =============================================================================
alter table public.categories drop column if exists bundle_tiers;

-- function `flavor_total` tidak lagi dipanggil dari `create_order` (kita
-- hitung manual untuk bundle). Biarkan ada kalau ada RPC lama yang masih
-- refer — kita drop setelah yakin semua migration sebelumnya sudah migrasi.


-- =============================================================================
-- 5. Update `public_menu()` — bundles ada di top-level (group by category)
-- =============================================================================

create or replace function public.public_menu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cats as (
    select jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name_id', c.name_id,
      'name_en', c.name_en,
      'desc_id', c.desc_id,
      'desc_en', c.desc_en,
      'image_url', c.image_url,
      'is_active', c.is_active,
      'is_featured', c.is_featured,
      'sort_order', c.sort_order,
      'stock_enabled', c.stock_enabled,
      'stock', c.stock,
      'flavors', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'slug', f.slug,
            'name_id', f.name_id,
            'name_en', f.name_en,
            'desc_id', f.desc_id,
            'desc_en', f.desc_en,
            'price', f.price,
            'image_url', f.image_url,
            'is_active', f.is_active,
            'is_featured', f.is_featured,
            'sort_order', f.sort_order,
            'category_id', f.category_id,
            'stock_enabled', f.stock_enabled,
            'stock', f.stock
          ) order by f.sort_order, f.id
        )
        from public.flavors f
        where f.category_id = c.id and f.is_active
      ), '[]'::jsonb),
      'bundles', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'category_id', b.category_id,
            'slug', b.slug,
            'name_id', b.name_id,
            'name_en', b.name_en,
            'desc_id', b.desc_id,
            'desc_en', b.desc_en,
            'price', b.price,
            'required_qty', b.required_qty,
            'image_url', b.image_url,
            'is_active', b.is_active,
            'is_featured', b.is_featured,
            'sort_order', b.sort_order
          ) order by b.sort_order, b.id
        )
        from public.bundles b
        where (b.category_id = c.id or b.category_id is null) and b.is_active
      ), '[]'::jsonb)
    ) as j
    from public.categories c
    where c.is_active
  ),
  standalone_bundles as (
    select jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'category_id', b.category_id,
        'slug', b.slug,
        'name_id', b.name_id,
        'name_en', b.name_en,
        'desc_id', b.desc_id,
        'desc_en', b.desc_en,
        'price', b.price,
        'required_qty', b.required_qty,
        'image_url', b.image_url,
        'is_active', b.is_active,
        'is_featured', b.is_featured,
        'sort_order', b.sort_order
      ) order by b.sort_order, b.id
    ) as j
    from public.bundles b
    where b.category_id is null and b.is_active
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(j order by (j->>'sort_order')::int, (j->>'id')::int) from cats), '[]'::jsonb),
    'bundles', coalesce((select j from standalone_bundles), '[]'::jsonb)
  );
$$;


-- =============================================================================
-- 6. Update `create_order()` — dukung bundle, stok per-kategori
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
  v_category   public.categories%rowtype;
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

  -- bundle aggregation
  v_bundle_entry     jsonb;
  v_bundle_id        bigint;
  v_required_qty     integer;
  v_slots            jsonb;
  v_slot             jsonb;
  v_slot_idx         integer;
  v_slot_flavor_id   bigint;
  v_slot_qty         integer;

  -- per-kategori
  v_per_cat          jsonb := '{}'::jsonb;   -- {category_id: total_pcs}
  v_cat_id           bigint;
  v_cat_pcs          integer;
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

    -- Akumulasi pcs per kategori (untuk cek stok)
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

    select * into v_bundle
    from public.bundles
    where id = v_bundle_id and is_active;

    if not found then
      raise exception 'flavor_unavailable' using errcode = '22023';
    end if;

    v_required_qty := v_bundle.required_qty;

    if jsonb_typeof(v_slots) is distinct from 'array'
       or jsonb_array_length(v_slots) <> v_required_qty then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    -- Validasi tiap slot
    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;

      if v_slot_flavor_id is null then
        raise exception 'invalid_quantity' using errcode = '22023';
      end if;

      select * into v_flavor
      from public.flavors
      where id = v_slot_flavor_id and is_active;

      if not found then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;

      -- Bundle harus dalam kategori yang sama dengan bundle (kalau bundle
      -- terikat kategori).
      if v_bundle.category_id is not null
         and v_flavor.category_id is not null
         and v_flavor.category_id <> v_bundle.category_id then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;

      -- Akumulasi pcs per kategori
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

  -- Subtotal = harga satuan + bundle price (sudah dijumlah di v_raw untuk
  -- satuan; bundle ditambahkan juga di v_raw di loop di atas). Sekarang
  -- v_raw adalah total harga eceran. Subtotal sebenarnya = raw karena
  -- bundle tidak ada diskon tambahan di level DB.
  v_subtotal := v_raw;

  v_delivery := case when p_delivery_method = 'delivery' then v_settings.delivery_fee else 0 end;

  -- ===== Stok per-kategori =====
  for v_cat_id, v_cat_pcs in
    select (k.key)::bigint, (k.value)::int
    from jsonb_each(v_per_cat) as k(key, value)
  loop
    select * into v_category
    from public.categories
    where id = v_cat_id
    for update;

    if not found then
      continue;
    end if;

    if v_category.stock_enabled and v_cat_pcs > v_category.stock then
      raise exception 'insufficient_stock' using errcode = '22023';
    end if;

    if v_category.stock_enabled then
      update public.categories
      set stock = greatest(0, stock - v_cat_pcs)
      where id = v_cat_id;
    end if;
  end loop;

  -- ===== Simpan order =====
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
    v_lang
  )
  returning id into v_order_id;

  -- Item satuan
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

  -- Bundle items (slot + rasa yang dipilih)
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


-- =============================================================================
-- 7. RPC admin untuk Bundle
-- =============================================================================

create or replace function public.admin_list_bundles()
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
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'category_id', b.category_id,
        'slug', b.slug,
        'name_id', b.name_id,
        'name_en', b.name_en,
        'desc_id', b.desc_id,
        'desc_en', b.desc_en,
        'price', b.price,
        'required_qty', b.required_qty,
        'image_url', b.image_url,
        'is_active', b.is_active,
        'is_featured', b.is_featured,
        'sort_order', b.sort_order
      ) order by b.sort_order, b.id
    ), '[]'::jsonb)
    from public.bundles b
  );
end;
$$;

create or replace function public.admin_save_bundle(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_slug  text;
  v_name  text;
  v_price  integer;
  v_qty   integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_payload ->> 'name_id', ''));
  if v_name = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_price := nullif(p_payload ->> 'price', '')::integer;
  if v_price is null or v_price < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  v_qty := nullif(p_payload ->> 'required_qty', '')::integer;
  if v_qty is null or v_qty < 1 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_slug := trim(both '-' from
    regexp_replace(lower(coalesce(nullif(btrim(coalesce(p_payload ->> 'slug', '')), ''), v_name)),
                   '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := 'bundle-' || substr(md5(random()::text), 1, 6);
  end if;

  if v_id is not null then
    if exists (select 1 from public.bundles where slug = v_slug and id <> v_id) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end if;

    update public.bundles set
      category_id  = nullif(p_payload ->> 'category_id', '')::bigint,
      slug         = v_slug,
      name_id      = v_name,
      name_en      = coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      desc_id      = coalesce(p_payload ->> 'desc_id', ''),
      desc_en      = coalesce(p_payload ->> 'desc_en', ''),
      price        = v_price,
      required_qty = v_qty,
      image_url    = case when p_payload ? 'image_url'
                          then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                          else image_url end,
      is_active    = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured  = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order   = coalesce((p_payload ->> 'sort_order')::integer, 0)
    where id = v_id
    returning id into v_id;
  else
    if exists (select 1 from public.bundles where slug = v_slug) then
      raise exception 'slug_taken' using errcode = '22023';
    end if;

    insert into public.bundles (
      category_id, slug, name_id, name_en, desc_id, desc_en,
      price, required_qty, image_url, is_active, is_featured, sort_order
    ) values (
      nullif(p_payload ->> 'category_id', '')::bigint,
      v_slug, v_name,
      coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      coalesce(p_payload ->> 'desc_id', ''),
      coalesce(p_payload ->> 'desc_en', ''),
      v_price, v_qty,
      nullif(trim(coalesce(p_payload ->> 'image_url', '')), ''),
      coalesce((p_payload ->> 'is_active')::boolean, true),
      coalesce((p_payload ->> 'is_featured')::boolean, false),
      coalesce((p_payload ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

create or replace function public.admin_delete_bundle(p_bundle_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used boolean := false;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.bundle_items where bundle_id = p_bundle_id
  ) into v_used;

  if v_used then
    update public.bundles set is_active = false where id = p_bundle_id;
    return jsonb_build_object('deactivated', true);
  end if;

  delete from public.bundles where id = p_bundle_id;
  return jsonb_build_object('deactivated', false);
end;
$$;

create or replace function public.admin_set_category_stock(p_category_id bigint, p_stock integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'invalid_stock' using errcode = '22023';
  end if;

  select stock into v_old from public.categories where id = p_category_id for update;
  if not found then
    raise exception 'flavor_not_found' using errcode = '22023';
  end if;

  update public.categories set stock = p_stock where id = p_category_id;
  return jsonb_build_object('stock', p_stock, 'previous', v_old);
end;
$$;


-- =============================================================================
-- 8. public_invoice — ikut sertakan bundle_items
-- =============================================================================

create or replace function public.public_invoice(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
  v_bundles jsonb;
begin
  select * into v_order
  from public.orders
  where upper(order_code) = upper(trim(coalesce(p_code, '')))
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'flavor_name', flavor_name,
    'quantity', quantity,
    'unit_price', unit_price,
    'line_total', line_total
  ) order by id), '[]'::jsonb)
  into v_items
  from public.order_items where order_id = v_order.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'bundle_id', bi.bundle_id,
    'bundle_name', b.name_id,
    'slots', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slot', bi2.slot,
        'flavor_name', oi2.flavor_name,
        'flavor_id', bi2.flavor_id
      ) order by bi2.slot), '[]'::jsonb)
      from public.bundle_items bi2
      join public.order_items oi2 on oi2.order_id = bi2.order_id and oi2.flavor_id = bi2.flavor_id
      where bi2.order_id = v_order.id and bi2.bundle_id = bi.bundle_id
    )
  )), '[]'::jsonb)
  into v_bundles
  from public.bundle_items bi
  join public.bundles b on b.id = bi.bundle_id
  where bi.order_id = v_order.id
  group by bi.bundle_id, b.name_id;

  return jsonb_build_object(
    'order_code', v_order.order_code,
    'customer_name', v_order.customer_name,
    'phone', v_order.phone,
    'address', v_order.address,
    'note', v_order.note,
    'payment_method', v_order.payment_method,
    'transfer_method', v_order.transfer_method,
    'delivery_method', v_order.delivery_method,
    'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee,
    'saving', 0,
    'total', v_order.total_price,
    'item_count', v_order.item_count,
    'status', v_order.status,
    'language', v_order.language,
    'created_at', v_order.created_at,
    'flat_items', v_items,
    'bundles', v_bundles
  );
end;
$$;


-- =============================================================================
-- 9. Bersihkan function lama yang sudah tidak dipakai
-- =============================================================================
drop function if exists public.flavor_total(jsonb, integer, integer);
drop function if exists public.clean_bundle_tiers(jsonb);


-- =============================================================================
-- 10. Update admin_list_categories — ikut stok
-- =============================================================================

create or replace function public.admin_list_categories()
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
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'name_id', c.name_id,
        'name_en', c.name_en,
        'desc_id', c.desc_id,
        'desc_en', c.desc_en,
        'image_url', c.image_url,
        'is_active', c.is_active,
        'is_featured', c.is_featured,
        'sort_order', c.sort_order,
        'stock_enabled', c.stock_enabled,
        'stock', c.stock,
        'flavor_count', (select count(*) from public.flavors f
                         where f.category_id = c.id and f.is_active)
      ) order by c.sort_order, c.id
    ), '[]'::jsonb)
    from public.categories c
  );
end;
$$;


-- =============================================================================
-- 11. Update admin_save_category — tanpa bundle_tiers, dengan stock
-- =============================================================================

create or replace function public.admin_save_category(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_slug text;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_payload ->> 'name_id', ''));
  if v_name = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_slug := trim(both '-' from
    regexp_replace(lower(coalesce(nullif(btrim(coalesce(p_payload ->> 'slug', '')), ''), v_name)),
                   '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := 'kategori-' || substr(md5(random()::text), 1, 6);
  end if;

  if v_id is not null then
    if exists (select 1 from public.categories where slug = v_slug and id <> v_id) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end if;
  elsif exists (select 1 from public.categories where slug = v_slug) then
    raise exception 'slug_taken' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.categories set
      slug         = v_slug,
      name_id      = v_name,
      name_en      = coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      desc_id      = coalesce(p_payload ->> 'desc_id', ''),
      desc_en      = coalesce(p_payload ->> 'desc_en', ''),
      image_url    = case when p_payload ? 'image_url'
                          then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                          else image_url end,
      is_active    = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured  = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order   = coalesce((p_payload ->> 'sort_order')::integer, 0),
      stock_enabled = coalesce((p_payload ->> 'stock_enabled')::boolean, true),
      stock         = greatest(0, coalesce((p_payload ->> 'stock')::integer, stock))
    where id = v_id
    returning id into v_id;
  else
    insert into public.categories (
      slug, name_id, name_en, desc_id, desc_en, image_url,
      is_active, is_featured, sort_order, stock_enabled, stock
    ) values (
      v_slug, v_name,
      coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      coalesce(p_payload ->> 'desc_id', ''),
      coalesce(p_payload ->> 'desc_en', ''),
      nullif(trim(coalesce(p_payload ->> 'image_url', '')), ''),
      coalesce((p_payload ->> 'is_active')::boolean, true),
      coalesce((p_payload ->> 'is_featured')::boolean, false),
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      coalesce((p_payload ->> 'stock_enabled')::boolean, true),
      greatest(0, coalesce((p_payload ->> 'stock')::integer, 0))
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
-- 12. Bersihkan referensi ke `total_stock` di store_settings
-- =============================================================================

-- Kita tetap pertahankan kolom `total_stock` & `stock_enabled` di tabel
-- store_settings untuk backward compatibility, tapi `create_order` sudah
-- tidak lagi memakainya. Sellers boleh di-migrate dari data lama dengan
-- mendistribusikan `total_stock` ke `categories.stock` lewat admin nanti.

-- Matikan referensi dari admin_dashboard_stats yang menghitung stock_used
-- dari total_stock, supaya tidak misleading.
create or replace function public.admin_dashboard_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending  integer;
  v_accepted integer;
  v_ready    integer;
  v_total    integer;
  v_today    numeric;
  v_month    numeric;
  v_orders_today integer;
  v_total_flavor integer;
  v_top      jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select count(*) into v_pending  from public.orders where status = 'pending';
  select count(*) into v_accepted from public.orders where status = 'accepted';
  select count(*) into v_ready    from public.orders where status = 'ready';
  select count(*) into v_total    from public.orders;

  select coalesce(sum(total_price), 0) into v_today
    from public.orders where created_at::date = current_date;
  select count(*) into v_orders_today
    from public.orders where created_at::date = current_date;
  select coalesce(sum(total_price), 0) into v_month
    from public.orders
    where date_trunc('month', created_at) = date_trunc('month', current_date);

  select count(*) into v_total_flavor from public.flavors where is_active;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_top
  from (
    select oi.flavor_name as flavor_name, sum(oi.quantity)::int as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where date_trunc('month', o.created_at) = date_trunc('month', current_date)
    group by oi.flavor_name
    order by qty desc
    limit 5
  ) x;

  return jsonb_build_object(
    'pending_orders', v_pending,
    'accepted_orders', v_accepted,
    'ready_orders', v_ready,
    'total_orders', v_total,
    'revenue_today', v_today,
    'orders_today', v_orders_today,
    'revenue_month', v_month,
    'flavor_count', v_total_flavor,
    'stock_enabled', false,
    'total_stock', 0,
    'stock_used', 0,
    'sales_by_flavor', v_top
  );
end;
$$;


notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');