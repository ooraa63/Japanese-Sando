-- ============================================================================
--  MIGRASI 16 — Akun buyer (customer)
-- ----------------------------------------------------------------------------
-- Tujuannya: setiap akun auth.users bisa berperan sebagai "customer" (pembeli)
-- yang menyimpan identitas default (nama, telepon, Instagram) sehingga
-- halaman /order tidak harus diisi ulang tiap kali checkout.
--
-- Saat checkout, sistem akan menautkan order ke user_id (kalau login) —
-- baik untuk Riwayat Pesanan di halaman /account, maupun untuk auto-fill
-- identitas di /order pada pre-order berikutnya.
--
-- Guest checkout tetap bisa dilakukan tanpa akun — kolom `orders.user_id`
-- nullable, jadi order dari guest cukup null.
-- ============================================================================


-- =============================================================================
-- 1. Tabel customer_profiles
--    Setiap user yang pernah register sebagai customer dapat memiliki satu
--    baris profil di sini. Identitas ini dipakai untuk auto-fill di /order.
-- =============================================================================
create table if not exists public.customer_profiles (
  user_id       uuid        primary key references auth.users(id) on delete cascade,
  full_name     text        not null check (length(trim(full_name)) >= 2),
  phone         text        not null,
  instagram     text,
  -- Tanggal lahir customer. Wajib di sisi form signup, disimpan di sini
  -- untuk referensi promo ulang tahun & validasi umur. Nullable untuk
  -- backfill dari baris lama (lihat juga customer_bootstrap_from_metadata).
  date_of_birth date        check (date_of_birth <= current_date),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists customer_profiles_phone_idx
  on public.customer_profiles (public.normalize_phone(phone));

-- RLS: user hanya bisa baca/update profil sendiri.
alter table public.customer_profiles enable row level security;

drop policy if exists customer_profiles_self_select on public.customer_profiles;
create policy customer_profiles_self_select on public.customer_profiles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists customer_profiles_self_update on public.customer_profiles;
create policy customer_profiles_self_update on public.customer_profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Insert & delete via RPC (security definer) — lihat di bawah.
-- Tidak ada policy INSERT/DELETE untuk anon/authenticated; client HARUS
-- melalui RPC `customer_upsert_own_profile`.


-- =============================================================================
-- 2. Kolom user_id di orders (nullable)
--    Order dari guest checkout tidak punya user_id (tetap null).
-- =============================================================================
alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_id_idx
  on public.orders (user_id);

-- RLS: customer terautentikasi hanya boleh baca order miliknya sendiri.
-- Order milik guest (user_id IS NULL) tidak akan pernah terlihat via SELECT
-- karena customer terautentikasi tidak akan cocok dengan null.
alter table public.orders enable row level security;

drop policy if exists orders_customer_self_select on public.orders;
create policy orders_customer_self_select on public.orders
for select to authenticated
using (user_id = auth.uid());


-- =============================================================================
-- 3. RPC — customer_profile()
--    Ambil profil customer (nama, telepon, IG, DOB, email) dari auth context.
--    Return null kalau belum login / belum punya profil.
-- =============================================================================
create or replace function public.customer_profile()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
begin
  if v_user_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'user_id', cp.user_id,
    'email', u.email,
    'full_name', cp.full_name,
    'phone', cp.phone,
    'instagram', cp.instagram,
    'date_of_birth', cp.date_of_birth,
    'created_at', cp.created_at,
    'updated_at', cp.updated_at
  )
  into v_profile
  from public.customer_profiles cp
  join auth.users u on u.id = cp.user_id
  where cp.user_id = v_user_id;

  return v_profile;
end;
$$;

grant execute on function public.customer_profile() to anon, authenticated;


-- =============================================================================
-- 4. RPC — customer_upsert_own_profile(p_full_name, p_phone, p_instagram, p_date_of_birth)
--    Simpan profil customer yang sedang login (insert atau update).
--    Dipakai setelah register / saat user update identitas.
-- =============================================================================
create or replace function public.customer_upsert_own_profile(
  p_full_name     text,
  p_phone         text,
  p_instagram     text default null,
  p_date_of_birth date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '22023';
  end if;
  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(trim(p_full_name)) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_phone is null or length(public.normalize_phone(p_phone)) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  insert into public.customer_profiles (user_id, full_name, phone, instagram, date_of_birth)
  values (
    v_user_id,
    trim(p_full_name),
    trim(p_phone),
    nullif(trim(coalesce(p_instagram, '')), ''),
    p_date_of_birth
  )
  on conflict (user_id) do update
    set full_name     = excluded.full_name,
        phone         = excluded.phone,
        instagram     = excluded.instagram,
        date_of_birth = excluded.date_of_birth,
        updated_at    = now();

  return public.customer_profile();
end;
$$;

grant execute on function public.customer_upsert_own_profile(text, text, text, date) to authenticated;


-- =============================================================================
-- 4b. RPC — customer_bootstrap_from_metadata()
--      Buat customer_profiles row dari raw_user_meta_data Supabase Auth,
--      kalau user sudah login tapi belum punya profil.
--
--      Dipakai untuk flow "Confirm email ON" di Supabase: signup user
--      dibuat + field user disimpan ke user_metadata, tapi customer_profiles
--      tidak bisa dibuat karena sesi null saat signup. Setelah user verifikasi
--      email dan login, RPC ini membuat profil dari user_metadata sehingga
--      identitas bisa di-auto-fill di /order.
--
--      Kalau user sudah punya profil, return existing (idempotent).
-- =============================================================================
create or replace function public.customer_bootstrap_from_metadata()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_meta       jsonb;
  v_full_name  text;
  v_phone      text;
  v_instagram  text;
  v_dob_text   text;
  v_dob        date;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '22023';
  end if;

  -- Kalau profil sudah ada, return existing — tidak double-write.
  if exists (select 1 from public.customer_profiles where user_id = v_user_id) then
    return public.customer_profile();
  end if;

  -- Ambil dari raw_user_meta_data (di-set saat auth.signUp options.data).
  select raw_user_meta_data into v_meta
  from auth.users
  where id = v_user_id;

  v_full_name := nullif(trim(coalesce(v_meta ->> 'full_name', '')), '');
  v_phone     := nullif(trim(coalesce(v_meta ->> 'phone', '')), '');
  v_instagram := nullif(trim(coalesce(v_meta ->> 'instagram', '')), '');
  v_dob_text  := nullif(trim(coalesce(v_meta ->> 'date_of_birth', '')), '');

  if v_dob_text is not null then
    begin
      v_dob := v_dob_text::date;
    exception when others then
      v_dob := null;
    end;
  end if;

  if v_full_name is null or length(v_full_name) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if v_phone is null or length(public.normalize_phone(v_phone)) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  insert into public.customer_profiles (user_id, full_name, phone, instagram, date_of_birth)
  values (v_user_id, v_full_name, v_phone, v_instagram, v_dob);

  return public.customer_profile();
end;
$$;

grant execute on function public.customer_bootstrap_from_metadata() to authenticated;


-- =============================================================================
-- 5. RPC — customer_orders()
--    Daftar pesanan customer yang sedang login, urut dari yang terbaru.
--    Hanya untuk ringkasan atas (status, total, tanggal). User bisa pakai
--    halaman tracking publik /track?code=... untuk lihat detail lengkap.
-- =============================================================================
create or replace function public.customer_orders()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(row_to_json), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', o.id,
      'order_code', o.order_code,
      'status', o.status,
      'subtotal', o.subtotal,
      'delivery_fee', o.delivery_fee,
      'total_price', o.total_price,
      'item_count', o.item_count,
      'delivery_method', o.delivery_method,
      'delivery_zone', o.delivery_zone,
      'created_at', o.created_at,
      'updated_at', o.updated_at,
      'language', o.language
    ) as row_to_json
    from public.orders o
    where o.user_id = auth.uid()
    order by o.created_at desc
    limit 100
  ) s;
$$;

grant execute on function public.customer_orders() to authenticated;


-- =============================================================================
-- 6. Update create_order — simpan user_id kalau customer login
--    Sumber user_id = auth.uid() (lebih trustworthy dari input client).
--    Parameter p_user_id hanya dicatat untuk audit / debugging.
--
--    Catatan: function ini adalah copy-paste dari migration-12 dengan
--    penambahan (1) parameter p_user_id, (2) deklarasi v_user_id, dan
--    (3) simpan ke kolom user_id saat insert ke public.orders.
-- =============================================================================
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
begin
  -- Sumber user_id: preferensi session Supabase (auth.uid()) daripada
  -- parameter client (bisa dimanipulasi). Kalau tidak ada keduanya,
  -- order disimpan tanpa tautan (guest checkout).
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
    user_id
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
    v_user_id
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

  -- ===== Bundle (insert ke order_items per slot + bundle_items untuk audit) =====
  -- bundle_items (dari migration-11) adalah tabel yang mencatat pilihan rasa
  -- per slot per order. Tabel ini yang dipakai oleh public_invoice() untuk
  -- merender daftar bundle di halaman sukses.
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


notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');