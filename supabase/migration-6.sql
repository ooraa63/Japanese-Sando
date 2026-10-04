-- =============================================================================
--  MIGRASI 6 — Paket per rasa + daftar akun admin
--
--  Paket dipindah dari pengaturan global ke tiap produk, karena tiap produk
--  bisa punya tabel harganya sendiri. Contoh Sando Sandwich @ Rp18.000:
--     2 pcs -> Rp35.000  (hemat Rp1.000 dari Rp36.000)
--     3 pcs -> paket 2 (Rp35.000) + 1 biasa (Rp18.000) = Rp53.000
--     4 pcs -> Rp65.000
--
--  Diatur dari halaman Menu, bukan Pengaturan.
-- =============================================================================


-- =============================================================================
-- 1. PAKET PER PRODUK
-- =============================================================================

alter table public.flavors
  add column if not exists bundle_tiers jsonb not null default '[]'::jsonb;

update public.flavors set
  bundle_tiers = coalesce(bundle_tiers, '[]'::jsonb)
where bundle_tiers is null;

-- Paket bawaan yang masuk akal: beli 2 = 35.000 (hemat 1.000 dari 36.000)
update public.flavors set
  bundle_tiers = '[{"qty": 2, "price": 35000}]'::jsonb
where (bundle_tiers is null or jsonb_array_length(bundle_tiers) = 0)
  and price = 18000;


-- ---------------------------------------------------------------------------
-- Susun daftar paket: hanya bentuknya yang divalidasi (qty >= 2, harga >= 0).
-- Paket tidak disaring berdasarkan harga di sini. Apakah sebuah paket
-- menguntungkan atau tidak ditentukan per pesanan oleh flavor_total(),
-- memakai harga produk itu sendiri.
-- ---------------------------------------------------------------------------
create or replace function public.clean_bundle_tiers(p_tiers jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out  jsonb := '[]'::jsonb;
  v_tier record;
begin
  for v_tier in
    select (e ->> 'qty')::int as qty, (e ->> 'price')::int as price
    from jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) as e
    where (e ->> 'qty') ~ '^[0-9]+$' and (e ->> 'price') ~ '^[0-9]+$'
    order by (e ->> 'qty')::int
  loop
    if v_tier.qty >= 2 and v_tier.price >= 0 then
      v_out := v_out || jsonb_build_array(
        jsonb_build_object('qty', v_tier.qty, 'price', v_tier.price)
      );
    end if;
  end loop;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------------
-- Hitung harga satu produk untuk sejumlah pcs.
-- Paket ditumpuk: ambil paket dengan qty terbesar yang masih muat, sebanyak
-- mungkin, lalu sisanya dibayar harga satuan.
-- ---------------------------------------------------------------------------
create or replace function public.flavor_total(
  p_tiers jsonb,
  p_qty   integer,
  p_unit  integer
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_tiers       jsonb := public.clean_bundle_tiers(p_tiers);
  v_bundles     jsonb := '[]'::jsonb;
  v_left        integer := coalesce(p_qty, 0);
  v_qty         integer := coalesce(p_qty, 0);
  v_unit        integer := coalesce(p_unit, 0);
  v_tier        jsonb;
  v_bundle_qty  integer := 0;
  v_bundle_sum  integer := 0;
  v_total       integer;
  v_base        integer;
begin
  v_base := v_qty * v_unit;

  if v_left >= 2 and jsonb_array_length(v_tiers) > 0 then
    while v_left >= 2 loop
      v_tier := null;
      select t into v_tier
      from jsonb_array_elements(v_tiers) as t
      where (t ->> 'qty')::int <= v_left
      order by (t ->> 'qty')::int desc
      limit 1;

      exit when v_tier is null;

      v_bundles   := v_bundles || jsonb_build_array(v_tier);
      v_bundle_qty := v_bundle_qty + (v_tier ->> 'qty')::int;
      v_bundle_sum := v_bundle_sum + (v_tier ->> 'price')::int;
      v_left       := v_left - (v_tier ->> 'qty')::int;
    end loop;
  end if;

  v_total := v_bundle_sum + (v_left * v_unit);

  -- Kalau paket ternyata tidak lebih murah dari beli satuan, pakai satuan saja.
  if v_bundle_qty > 0 and v_total >= v_base then
    return jsonb_build_object(
      'total', v_base, 'bundles', '[]'::jsonb, 'leftover', v_qty,
      'bundle_total', 0, 'leftover_total', v_base, 'base', v_base, 'saving', 0
    );
  end if;

  return jsonb_build_object(
    'total', v_total,
    'bundles', v_bundles,
    'leftover', v_left,
    'bundle_total', v_bundle_sum,
    'leftover_total', v_left * v_unit,
    'base', v_base,
    'saving', greatest(0, v_base - v_total)
  );
end;
$$;


-- =============================================================================
-- 2. create_order — paket dihitung per rasa
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
  v_calc       jsonb;
  v_subtotal   integer := 0;
  v_raw        integer := 0;
  v_count      integer := 0;
  v_items_ok   integer := 0;
  v_bundles    jsonb := '[]'::jsonb;
  v_code       text;
  v_proof      text;
  v_delivery   integer := 0;
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
  if p_payment_method = 'transfer' and v_proof is null then
    raise exception 'proof_required' using errcode = '22023';
  end if;

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

  -- ---------- validasi rasa & hitung harga per rasa ----------
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

    v_calc := public.flavor_total(v_flavor.bundle_tiers, v_qty, v_flavor.price);

    v_subtotal := v_subtotal + (v_calc ->> 'total')::integer;
    v_raw      := v_raw + (v_flavor.price * v_qty);
    v_count    := v_count + v_qty;
    v_items_ok := v_items_ok + 1;

    -- Paket yang terpakai, digabung untuk ditampilkan di dashboard
    v_bundles := v_bundles || coalesce(v_calc -> 'bundles', '[]'::jsonb);
  end loop;

  if v_items_ok = 0 then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if v_count < v_settings.min_order then
    raise exception 'below_min_order' using errcode = '22023';
  end if;

  v_delivery := case when p_delivery_method = 'delivery' then v_settings.delivery_fee else 0 end;

  -- ---------- stok global ----------
  if v_settings.stock_enabled and v_count > v_settings.total_stock then
    raise exception 'insufficient_stock' using errcode = '22023';
  end if;
  if v_settings.stock_enabled then
    update public.store_settings set total_stock = total_stock - v_count where id = 1;
  end if;

  -- ---------- simpan ----------
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
    'bundles', v_bundles,
    'base_total', v_raw,
    'subtotal', v_subtotal,
    'saving', v_raw - v_subtotal,
    'delivery_fee', v_delivery,
    'total_price', v_subtotal + v_delivery,
    'remaining_stock', (select case when stock_enabled then total_stock else null end
                        from public.store_settings where id = 1)
  );
end;
$$;


-- =============================================================================
-- 3. admin_save_flavor — ikut menyimpan paket
-- =============================================================================

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
  v_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_payload ->> 'name_id', ''));
  if v_name = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_slug := lower(regexp_replace(trim(both '-' from regexp_replace(
    coalesce(p_payload ->> 'slug', v_name), '[^a-zA-Z0-9]+', '-', 'g')), '-', ''));
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

  if coalesce((p_payload ->> 'price')::integer, -1) < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.flavors set
      slug        = v_slug,
      name_id     = v_name,
      name_en     = coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      desc_id     = coalesce(p_payload ->> 'desc_id', ''),
      desc_en     = coalesce(p_payload ->> 'desc_en', ''),
      price       = (p_payload ->> 'price')::integer,
      bundle_tiers = case when p_payload ? 'bundle_tiers'
                         then public.clean_bundle_tiers(p_payload -> 'bundle_tiers')
                         else bundle_tiers end,
      image_url   = case when p_payload ? 'image_url'
                         then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                         else image_url end,
      is_active   = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order  = coalesce((p_payload ->> 'sort_order')::integer, 0),
      category_id = case when p_payload ? 'category_id'
                         then nullif(p_payload ->> 'category_id', '')::bigint
                         else category_id end
    where id = v_id
    returning id into v_id;
  else
    insert into public.flavors (
      slug, name_id, name_en, desc_id, desc_en, price, bundle_tiers, image_url,
      is_active, is_featured, sort_order, category_id
    ) values (
      v_slug, v_name,
      coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      coalesce(p_payload ->> 'desc_id', ''),
      coalesce(p_payload ->> 'desc_en', ''),
      (p_payload ->> 'price')::integer,
      public.clean_bundle_tiers(coalesce(p_payload -> 'bundle_tiers', '[]'::jsonb)),
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
-- 4. Menu publik ikut membawa paket per rasa
-- =============================================================================

create or replace function public.public_menu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name_id', c.name_id,
      'name_en', c.name_en,
      'desc_id', c.desc_id,
      'desc_en', c.desc_en,
      'image_url', c.image_url,
      'is_featured', c.is_featured,
      'sort_order', c.sort_order,
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
            'bundle_tiers', f.bundle_tiers,
            'image_url', f.image_url,
            'is_active', f.is_active,
            'is_featured', f.is_featured,
            'sort_order', f.sort_order,
            'category_id', f.category_id
          ) order by f.sort_order, f.id
        )
        from public.flavors f
        where f.category_id = c.id and f.is_active
      ), '[]'::jsonb)
    ) order by c.sort_order, c.id
  ), '[]'::jsonb)
  from public.categories c
  where c.is_active;
$$;


-- =============================================================================
-- 5. Daftar akun admin (untuk halaman Account di Pengaturan)
-- =============================================================================

create or replace function public.admin_list_users()
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
        'user_id', a.user_id,
        'email', a.email,
        'full_name', a.full_name,
        'role', a.role,
        'is_active', a.is_active,
        'created_at', a.created_at,
        'last_sign_in', u.last_sign_in_at,
        'confirmed', (u.email_confirmed_at is not null)
      ) order by a.created_at
    ), '[]'::jsonb)
    from public.admins a
    left join auth.users u on u.id = a.user_id
  );
end;
$$;

-- Cabut akses admin (user tetap bisa login Supabase, tapi tidak bisa masuk dashboard)
create or replace function public.admin_revoke_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select count(*) into v_active
  from public.admins where is_active and user_id <> p_user_id;

  -- Jangan sampai tidak ada satu pun admin yang aktif
  if v_active < 1 then
    raise exception 'last_admin' using errcode = '22023';
  end if;

  update public.admins set is_active = false where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'user_id', p_user_id);
end;
$$;

-- Beri akses admin ke user yang sudah ada di Supabase (cari lewat email)
create or replace function public.admin_grant_user(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user auth.users%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_user
  from auth.users
  where lower(email) = lower(trim(coalesce(p_email, '')))
  limit 1;

  if v_user.id is null then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;

  insert into public.admins (user_id, email, full_name, role, is_active)
  values (
    v_user.id,
    v_user.email,
    coalesce(v_user.raw_user_meta_data ->> 'full_name', ''),
    'staff',
    true
  )
  on conflict (user_id) do update
    set is_active = true, email = excluded.email;

  return jsonb_build_object('ok', true, 'user_id', v_user.id, 'email', v_user.email);
end;
$$;


-- =============================================================================
-- 6. Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');
