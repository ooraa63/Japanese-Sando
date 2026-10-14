-- =============================================================================
--  MIGRASI 54 --
--  Bundle dua mode: isi terkunci (combo) vs pembeli pilih sendiri
-- =============================================================================
--
--  Permintaan Steven (14-10-2026):
--    "kadang kalau misal ada bundle combo: strawberry dan choco matcha, maka
--     langsung itu yang terpilih tapi ada juga saya mau buat misal, beli 2 lebih
--     gratis dan mereka bisa pilih rasanya sendiri"
--
--  Dua kebutuhan yang berbeda mekanismenya, sebelumnya cuma ada yang kedua:
--
--  1. **Combo / isi terkunci.** Penjual menentukan persis isi paket. Pembeli
--     tidak memilih apa-apa; popup paket tinggal menampilkan chip readonly.
--     Contoh: "Strawberry + Choco Matcha".
--
--  2. **Pilih sendiri.** Perilaku yang sudah ada: pembeli memilih
--     `required_qty` rasa dari `flavor_ids` (atau dari semua rasa kalau
--     `flavor_ids` kosong). Contoh: "Beli 2 lebih gratis".
--
--  Kolom baru `bundles.is_fixed` yang membedakan keduanya. Default `false`
--  supaya semua bundle yang sudah ada otomatis tetap mode "pilih sendiri" —
--  tidak ada perubahan perilaku untuk data lama.
--
--  ATURAN MODE TERKUNCI
--  --------------------
--  `bundle_flavors` menjadi ISI PAKET, bukan sekadar daftar yang boleh dipilih.
--  Karena itu jumlahnya HARUS sama dengan `required_qty` — kalau tidak, admin
--  akan menyimpan paket yang tidak bisa pernah dibeli. Dicek di `admin_save_bundle`.
--
--  Di `create_order`, mode terkunci divalidasi bahwa slots yang dikirim PERSIS
--  sama dengan `bundle_flavors`, masing-masing sekali. Tanpa cek ini ada celah:
--  validasi per-slot yang sudah ada (migration-45) hanya memastikan "slot ini
--  ada di daftar", jadi `[strawberry, strawberry]` tetap lolos untuk paket yang
--  isinya strawberry + choco matcha.
--
--  Semua definisi fungsi di bawah diambil VERBATIM dari migration-45 (versi
--  yang sedang live), lalu hanya bar yang relevan yang ditambahkan.
--  "create or replace" dipakai supaya grant execute untuk anon & authenticated
--  tetap utuh -- "drop" + "create" akan menghapus grant.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Kolom mode paket
-- -----------------------------------------------------------------------------
alter table public.bundles
  add column if not exists is_fixed boolean not null default false;

comment on column public.bundles.is_fixed is
  'true = isi paket sudah ditentukan penjual (bundle combo). '
  'Pada mode ini bundle_flavors adalah isi paket dan jumlahnya harus = required_qty. '
  'false = pembeli memilih required_qty rasa sendiri dari daftar (atau semua rasa '
  'kalau daftar kosong).';


-- -----------------------------------------------------------------------------
-- 2) public_menu: kirim is_fixed per bundle
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_menu()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            'is_new', f.is_new,
            'sort_order', f.sort_order,
            'category_id', f.category_id,
            'stock_enabled', f.stock_enabled,
            'stock', f.stock,
            'likes_count', f.likes_count
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
            'compare_price', b.compare_price,
            'required_qty', b.required_qty,
            'image_url', b.image_url,
            'is_active', b.is_active,
            'is_featured', b.is_featured,
            'sort_order', b.sort_order,
            'is_fixed', b.is_fixed,
            'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)
                                    from public.bundle_flavors bf where bf.bundle_id = b.id),
                                   '[]'::jsonb)
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
        'compare_price', b.compare_price,
        'required_qty', b.required_qty,
        'image_url', b.image_url,
        'is_active', b.is_active,
        'is_featured', b.is_featured,
        'sort_order', b.sort_order,
        'is_fixed', b.is_fixed,
        'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)
                                from public.bundle_flavors bf where bf.bundle_id = b.id),
                               '[]'::jsonb)
      ) order by b.sort_order, b.id
    ) as j
    from public.bundles b
    where b.category_id is null and b.is_active
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(j order by (j->>'sort_order')::int, (j->>'id')::int) from cats), '[]'::jsonb),
    'bundles', coalesce((select j from standalone_bundles), '[]'::jsonb)
  );
$function$;


-- -----------------------------------------------------------------------------
-- 3) admin_list_bundles: kirim is_fixed ke form admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_bundles()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'compare_price', b.compare_price,
        'required_qty', b.required_qty,
        'image_url', b.image_url,
        'is_active', b.is_active,
        'is_featured', b.is_featured,
        'sort_order', b.sort_order,
        'is_fixed', b.is_fixed,
        'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)
                                from public.bundle_flavors bf where bf.bundle_id = b.id),
                               '[]'::jsonb)
      ) order by b.sort_order, b.id
    ), '[]'::jsonb)
    from public.bundles b
  );
end;
$function$;


-- -----------------------------------------------------------------------------
-- 4) admin_save_bundle: simpan + validasi mode terkunci
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_bundle(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id        bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_slug      text;
  v_name      text;
  v_price     integer;
  v_compare   integer;
  v_qty       integer;
  v_is_fixed  boolean;
  v_flavor_cnt integer;
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

  -- Harga coret hanya valid kalau lebih besar dari harga jual.
  v_compare := nullif(p_payload ->> 'compare_price', '')::integer;
  if v_compare is not null and v_compare <= v_price then
    v_compare := null;
  end if;

  v_qty := nullif(p_payload ->> 'required_qty', '')::integer;
  if v_qty is null or v_qty < 1 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_is_fixed := coalesce((p_payload ->> 'is_fixed')::boolean, false);

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
      compare_price = case when p_payload ? 'compare_price' then v_compare
                           else compare_price end,
      required_qty = v_qty,
      image_url    = case when p_payload ? 'image_url'
                          then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                          else image_url end,
      is_active    = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured  = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order   = coalesce((p_payload ->> 'sort_order')::integer, 0),
      is_fixed     = case when p_payload ? 'is_fixed' then v_is_fixed else is_fixed end
    where id = v_id
    returning id into v_id;
  else
    if exists (select 1 from public.bundles where slug = v_slug) then
      raise exception 'slug_taken' using errcode = '22023';
    end if;

    insert into public.bundles (
      category_id, slug, name_id, name_en, desc_id, desc_en,
      price, compare_price, required_qty, image_url, is_active, is_featured,
      sort_order, is_fixed
    ) values (
      nullif(p_payload ->> 'category_id', '')::bigint,
      v_slug, v_name,
      coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      coalesce(p_payload ->> 'desc_id', ''),
      coalesce(p_payload ->> 'desc_en', ''),
      v_price, v_compare, v_qty,
      nullif(trim(coalesce(p_payload ->> 'image_url', '')), ''),
      coalesce((p_payload ->> 'is_active')::boolean, true),
      coalesce((p_payload ->> 'is_featured')::boolean, false),
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      v_is_fixed
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- Isi bundle dipilih PENJUAL lewat daftar rasa, bukan kategori tetap.
  -- Daftar kosong = semua rasa aktif yang boleh dipakai (bundle berdiri sendiri).
  if p_payload ? 'flavor_ids' and jsonb_typeof(p_payload -> 'flavor_ids') = 'array' then
    delete from public.bundle_flavors where bundle_id = v_id;
    insert into public.bundle_flavors (bundle_id, flavor_id)
    select distinct v_id, f.id
    from jsonb_array_elements_text(coalesce(p_payload -> 'flavor_ids', '[]'::jsonb)) as x(value)
    join public.flavors f on f.id::text = btrim(x.value)
    on conflict do nothing;
  end if;

  -- (migration-54) Mode terkunci: daftar rasa adalah ISI paket, jadi
  -- jumlahnya harus sama persis dengan required_qty. Kalau tidak, paket yang
  -- tersimpan tidak akan pernah bisa dibeli — pembeli tidak pernah bisa
  -- terkunci di jumlah rasa, padahal daftarnya sendiri lebih pendek dari itu.
  v_is_fixed := coalesce((select is_fixed from public.bundles where id = v_id), false);
  if v_is_fixed then
    select count(*) into v_flavor_cnt
    from public.bundle_flavors bf
    join public.flavors f on f.id = bf.flavor_id and f.is_active
    where bf.bundle_id = v_id;

    if v_flavor_cnt <> v_qty then
      raise exception 'invalid_bundle_fixed' using errcode = '22023';
    end if;
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$function$;

comment on function public.admin_save_bundle(jsonb) is
  'Admin: simpan bundle. comparison: key compare_price opsional — hanya dipakai '
  'kalau nilainya > price, selain itu disimpan NULL. Key yang tidak dikirim '
  'mempertahankan nilai lama (dipakai toggle cepat di admin). '
  'Migration-54: key is_fixed opsional menandai bundle combo (isi terkunci); '
  'kalau is_fixed=true, jumlah rasa di bundle_flavors harus = required_qty.';


-- -----------------------------------------------------------------------------
-- 5) create_order: mode terkunci wajib persis sama dengan isi paket
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order(p_customer_name text DEFAULT ''::text, p_customer_email text DEFAULT ''::text, p_instagram text DEFAULT ''::text, p_phone text DEFAULT ''::text, p_payment_method text DEFAULT 'transfer'::text, p_delivery_method text DEFAULT 'pickup'::text, p_delivery_zone text DEFAULT 'pickup'::text, p_address text DEFAULT NULL::text, p_address_note text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_transfer_method text DEFAULT NULL::text, p_payment_proof text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_language text DEFAULT 'id'::text, p_items jsonb DEFAULT '[]'::jsonb, p_bundles jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

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
    -- (migration-44) Batas per rasa dihapus: satu-satunya pembatas pesanan
    -- adalah stok kategori, yang divalidasi di bawah (insufficient_stock).
    if v_flavor_id is null or v_qty < 1 then
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
      -- Bundle yang punya daftar rasa (dipilih penjual) hanya boleh memakai
      -- rasa di daftar itu. Daftar kosong = semua rasa, jadi cek di-skip.
      if exists (select 1 from public.bundle_flavors where bundle_id = v_bundle_id)
         and not exists (select 1 from public.bundle_flavors
                          where bundle_id = v_bundle_id and flavor_id = v_slot_flavor_id) then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
      if v_flavor.category_id is not null then
        v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
        v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                               to_jsonb(v_cat_pcs + 1), true);
      end if;
    end loop;

    -- (migration-54) Bundle COMBO: slots harus PERSIS sama dengan isi paket
    -- yang dipilih penjual, masing-masing rasa muncul tepat satu kali.
    --
    -- Cek per-slot di atas sudah menolak rasa yang di luar daftar, tapi tidak
    -- menolak duplikat: [strawberry, strawberry] lolos untuk paket yang isinya
    -- strawberry + choco matcha. Di mode terkunci itu salah, jadi di sini
    -- setiap rasa di bundle_flavors harus ketemu tepat 1 di dalam slots.
    -- Karena len(slots) = required_qty sudah dijamin di atas dan
    -- count(bundle_flavors) = required_qty divalidasi saat admin menyimpan,
    -- "tiap rasa tepat 1x" berarti slots == isi paket.
    if v_bundle_rec.is_fixed then
      if (select count(*) from public.bundle_flavors where bundle_id = v_bundle_id) <> v_required_qty then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
      if exists (
        select 1
        from public.bundle_flavors bf
        where bf.bundle_id = v_bundle_id
          and (
            select count(*)
            from jsonb_array_elements(v_slots) s
            where (s ->> 'flavor_id')::bigint = bf.flavor_id
          ) <> 1
      ) then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
    end if;

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
$function$;


notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');