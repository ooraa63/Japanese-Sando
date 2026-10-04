-- =============================================================================
--  MIGRASI 8 — Paket harga per JENIS MAKANAN (kategori), bukan per rasa
--
--  Paket pindah dari tabel `flavors` ke tabel `categories`.
--  Contoh: jenis "Sando Sandwich" punya paket 2 = 35.000 dan 4 = 65.000,
--  berlaku untuk semua rasa di dalam jenis itu.
--
--  Halaman Menu: pengaturan paket pindah ke layar jenis makanan
--  (klik jenis -> ubah), bukan lagi di layar rasa.
-- =============================================================================


-- 1. Kolom paket di kategori
alter table public.categories
  add column if not exists bundle_tiers jsonb not null default '[]'::jsonb;

-- Bersihkan dulu, baru pasang constraint
update public.categories set bundle_tiers = '[]'::jsonb
where bundle_tiers is null or jsonb_typeof(bundle_tiers) <> 'array';

alter table public.categories
  drop constraint if exists categories_bundle_tiers_array;

alter table public.categories
  add constraint categories_bundle_tiers_array
  check (jsonb_typeof(bundle_tiers) = 'array');

-- 2. Pindahkan paket yang sekarang ada di flavor ke kategorinya
--    (ambil paket pertama yang ada, lalu pakai untuk seluruh jenis itu)
update public.categories c
set bundle_tiers = sub.tiers
from (
  select distinct on (category_id) category_id, bundle_tiers as tiers
  from public.flavors
  where category_id is not null
    and bundle_tiers is not null
    and jsonb_array_length(bundle_tiers) > 0
  order by category_id, id
) sub
where c.id = sub.category_id
  and (c.bundle_tiers is null or jsonb_array_length(c.bundle_tiers) = 0);

-- 3. Paket bawaan untuk kategori yang belum punya
update public.categories
set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
where jsonb_array_length(bundle_tiers) = 0;


-- =============================================================================
-- 4. public_menu() — kategori membawa paketnya
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
      'is_active', c.is_active,
      'is_featured', c.is_featured,
      'sort_order', c.sort_order,
      'bundle_tiers', c.bundle_tiers,
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
-- 5. create_order — paket dihitung per jenis makanan
--
--    Semua pcs dari satu jenis dihitung bersama, apa pun rasa yang dipilih.
--    Contoh: 1 Choco Matcha + 1 Cookies & Cream (dua rasa, satu jenis)
--    dihitung sebagai 2 pcs dari Sando Sandwich, jadi dapat paket 2.
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
  v_flavors    jsonb;   -- daftar rasa yang dipesan
  v_cat        record;  -- hasil pengelompokan per jenis makanan
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

  -- ---------- validasi item, kumpulkan per jenis makanan ----------
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

  -- ---------- hitung harga per jenis makanan ----------
  -- Semua pcs dari satu jenis dihitung bersama (rasa boleh beda-bedanya).
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
    -- Harga satuan memakai rata-rata rasa di jenis makanan itu
    v_calc := public.flavor_total(
      v_cat.tiers,
      v_cat.total_qty,
      public.v_avg_of_category(v_cat.cat_id)
    );
    v_subtotal := v_subtotal + (v_calc ->> 'total')::integer;
  end loop;

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
    'subtotal', v_subtotal,
    'saving', v_raw - v_subtotal,
    'delivery_fee', v_delivery,
    'total_price', v_subtotal + v_delivery,
    'remaining_stock', (select case when stock_enabled then total_stock else null end
                        from public.store_settings where id = 1)
  );
end;
$$;


-- Rata-rata harga satuan di satu jenis makanan
create or replace function public.v_avg_of_category(p_category_id bigint)
returns integer
language sql
stable
as $$
  select coalesce(round(avg(price))::integer, 0)
  from public.flavors
  where category_id = p_category_id and is_active;
$$;


-- =============================================================================
-- 6. admin_list_categories & admin_save_category — ikut paket
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
        'bundle_tiers', c.bundle_tiers,
        'flavor_count', (select count(*) from public.flavors f
                         where f.category_id = c.id and f.is_active)
      ) order by c.sort_order, c.id
    ), '[]'::jsonb)
    from public.categories c
  );
end;
$$;

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

  -- Slug dari "Sando Sandwich" harus jadi "sando-sandwich", bukan
  -- "sandosandwich" -- karena itu spasi dan "&" diganti tanda hubung.
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
      bundle_tiers = case when p_payload ? 'bundle_tiers'
                          then public.clean_bundle_tiers(p_payload -> 'bundle_tiers')
                          else bundle_tiers end,
      image_url    = case when p_payload ? 'image_url'
                          then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                          else image_url end,
      is_active    = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured  = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order   = coalesce((p_payload ->> 'sort_order')::integer, 0)
    where id = v_id
    returning id into v_id;
  else
    insert into public.categories (
      slug, name_id, name_en, desc_id, desc_en, bundle_tiers, image_url,
      is_active, is_featured, sort_order
    ) values (
      v_slug, v_name,
      coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      coalesce(p_payload ->> 'desc_id', ''),
      coalesce(p_payload ->> 'desc_en', ''),
      public.clean_bundle_tiers(
        case when jsonb_typeof(p_payload -> 'bundle_tiers') = 'array'
             then p_payload -> 'bundle_tiers' else '[]'::jsonb end
      ),
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


-- =============================================================================
-- 7. Kolom bundle_tiers di flavors tidak lagi dipakai
-- =============================================================================

alter table public.flavors drop column if exists bundle_tiers;

-- public_menu() sudah tidak memanggilnya (lihat di atas).


-- =============================================================================
-- Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');