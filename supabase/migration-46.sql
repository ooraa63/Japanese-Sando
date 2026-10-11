-- =============================================================================
--  MIGRASI 46 --
--  Diskon ongkir bertingkat, FAQ bisa diedit penjual, dan perbaikan
--  sumber ongkir di create_order
-- =============================================================================
--
--  Permintaan Steven (12-10-2026):
--   4. Kalau belanja sudah mencapai angka tertentu, ongkir dapat potongan
--      persen. Diset di admin, di bawah field "Delivery fee".
--   5. Isi FAQ harus bisa diedit / ditambah dari admin, seperti Contact dll.
--
--  Plus satu BUG yang ditemukan saat mengerjakan permintaan no. 4:
--  `create_order` membaca ongkir dari jsonb `store_settings.delivery_zones`
--  -- sumber LAMA yang sudah ditinggalkan migration-32. Admin mengubah fee
--  di tabel `delivery_zones`, jadi pembeli melihat Rp5.000 tapi backend
--  menagih Rp10.000, dan zona yang tidak ada di jsonb lama ("antar") ditagih
--  Rp0 alias gratis ongkir. Diperbaiki di bawah.
--
--  Semua definisi fungsi yang diubah diambil VERBATIM dari versi LIVE di
--  database, lalu hanya bar yang relevan yang ditambahkan. `create or replace`
--  dipakai supaya grant execute untuk anon & authenticated tetap utuh.
-- =============================================================================

-- =============================================================================
-- 1) DISKON ONGKIR BERTINGKAT
-- =============================================================================
--  Bentuk jsonb: [{"min": 50000, "percent": 50}, {"min": 150000, "percent": 100}]
--    min     = minimal belanja (dalam rupiah) supaya aturan ini aktif
--    percent = potongan ongkir 0-100 (100 = gratis ongkir)
--
--  Berlaku PER ZONA, jadi zona dekat bisa_diskon dan zona jauh tidak.
--  Aturan yang dipakai: `min` tertinggi yang sudah terlampaui subtotal.
alter table public.delivery_zones
  add column if not exists shipping_discounts jsonb not null default '[]'::jsonb;

comment on column public.delivery_zones.shipping_discounts is
  'Diskon ongkir bertingkat: [{"min": <minimal belanja>, "percent": <potongan 0-100>}]. migration-46.';

-- =============================================================================
-- 2) FAQ BISA DIEDIT PENJUAL
-- =============================================================================
--  Sebelumnya isi FAQ ada di kode (src/lib/faq.ts), jadi tidak bisa diubah
--  dari dashboard. Sekarang pindah ke database dan punya halaman admin sendiri.
create table if not exists public.faq_items (
  id          bigserial primary key,
  question_id text    not null,
  question_en text    not null default '',
  answer_id   text    not null default '',
  answer_en   text    not null default '',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.faq_items enable row level security;

drop policy if exists faq_items_public_read on public.faq_items;
create policy faq_items_public_read on public.faq_items
  for select to anon, authenticated
  using (is_active);

drop policy if exists faq_items_admin_all on public.faq_items;
create policy faq_items_admin_all on public.faq_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.faq_items to anon, authenticated;
grant insert, update, delete on public.faq_items to authenticated;

-- Idempotent: trigger di-drop dulu supaya migrasi ini aman dijalankan ulang.
drop trigger if exists faq_items_touch on public.faq_items;
create trigger faq_items_touch before update on public.faq_items
  for each row execute function touch_updated_at();

-- Seed dengan isi FAQ yang sekarang (identik dengan src/lib/faq.ts versi lama),
-- supaya pindah ke database tidak menghilangkan apa pun dari halaman /faq.
--
-- Hanya kalau tabel masih kosong. `faq_items` tidak punya unique constraint,
-- jadi `on conflict do nothing` TIDAK mencegah duplikat kalau skrip ini
-- dijalankan dua kali.
do $$
begin
  if not exists (select 1 from public.faq_items) then
    insert into public.faq_items (question_id, question_en, answer_id, answer_en, sort_order, is_active)
    values
  ('Bagaimana cara memesan?', 'How do I place an order?',
   'Pilih rasa yang kamu mau di halaman Menu, tekan “Pesan Sekarang”, lalu isi nama dan nomor WhatsApp kamu. Kamu bisa ambil di toko atau diantar, lalu pilih metode pembayaran.',
   'Pick the flavors you want on the Menu page, tap “Order now”, then fill in your name and WhatsApp number. Choose pickup or delivery, then pick a payment method.',
   10, true),
  ('Apakah harus pesan dari jauh-jauh hari?', 'Do I have to order days in advance?',
   'Tidak wajib. Kami tetap menerima pesanan sampai batas pre-order yang tertera di halaman utama. Kalau stok suatu rasa habis, rasanya tidak akan muncul sebagai pilihan.',
   'Not necessarily. We keep taking orders until the pre-order deadline shown on the homepage. Once a flavor runs out, it disappears from the menu.',
   20, true),
  ('Metode pembayaran apa saja yang tersedia?', 'Which payment methods are available?',
   'QRIS (semua e-wallet & mobile banking) dan transfer bank. Kalau kamu pilih transfer, kamu perlu upload bukti transfer supaya pesanan diproses.',
   'QRIS (any e-wallet or mobile banking) and bank transfer. For bank transfer you need to upload your payment proof so we can process the order.',
   30, true),
  ('Kalau QRIS saya sudah scan tapi belum masuk?', 'What if I scanned the QRIS but it did not go through?',
   'Kadang butuh beberapa detik. Halaman pesanan akan otomatis terupdate begitu pembayaran masuk. Kalau lebih dari 5 menit belum terdeteksi, QRIS-nya kadaluarsa dan kamu bisa scan ulang dari halaman pesanan.',
   'It can take a few seconds. Your order page updates automatically as soon as the payment lands. If it is not detected after 5 minutes, the QRIS expires and you can request a fresh one from your order page.',
   40, true),
  ('Apakah bisa diantar ke tempat saya?', 'Do you deliver to my area?',
   'Bisa, untuk area yang tercakup di daftar zona pengiriman. Saat memesan kamu memilih zona, lalu menandai titik lokasi di peta supaya kami tahu persis ke mana harus dikirim.',
   'Yes, for areas covered by our delivery zones. While ordering you pick a zone, then drop a pin on the map so we know exactly where to send it.',
   50, true),
  ('Bisa ganti rasa kalau sudah pesan?', 'Can I change flavors after ordering?',
   'Bisa, selama pesanan belum kami mulai buat. Chat WhatsApp kami secepatnya, dan kami cek dulu ketersediaan stoknya.',
   'Yes, as long as we have not started making it. Message us on WhatsApp as early as possible and we will check availability first.',
   60, true);
  end if;
end;
$$;

-- =============================================================================
-- FUNGSI FAQ
-- =============================================================================

-- public_faq: yang dibaca halaman /faq (hanya bar aktif) ----------------------
create or replace function public.public_faq()
returns jsonb
language plpgsql
stable
set search_path = 'public'
as $body$
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', f.id,
        'question_id', f.question_id,
        'question_en', f.question_en,
        'answer_id', f.answer_id,
        'answer_en', f.answer_en,
        'sort_order', f.sort_order
      ) order by f.sort_order, f.id
    )
    from public.faq_items f
    where f.is_active
  ), '[]'::jsonb);
end;
$body$;

-- admin_list_faq: semua bar, termasuk yang disembunyikan -----------------------
create or replace function public.admin_list_faq()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $body$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'question_id', f.question_id,
          'question_en', f.question_en,
          'answer_id', f.answer_id,
          'answer_en', f.answer_en,
          'sort_order', f.sort_order,
          'is_active', f.is_active
        ) order by f.sort_order, f.id
      )
      from public.faq_items f
    ), '[]'::jsonb)
  );
end;
$body$;

-- admin_save_faq: simpan satu pertanyaan --------------------------------------
create or replace function public.admin_save_faq(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $body$
declare
  v_id    bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_q     text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_q := btrim(coalesce(p_payload ->> 'question_id', ''));
  if v_q = '' then
    v_q := btrim(coalesce(p_payload ->> 'question_en', ''));
  end if;
  if v_q = '' then
    raise exception 'invalid_question' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.faq_items set
      question_id = left(v_q, 200),
      question_en = left(coalesce(p_payload ->> 'question_en', ''), 200),
      answer_id   = left(coalesce(p_payload ->> 'answer_id', ''), 2000),
      answer_en   = left(coalesce(p_payload ->> 'answer_en', ''), 2000),
      sort_order  = coalesce((p_payload ->> 'sort_order')::integer, 0),
      is_active   = case when p_payload ? 'is_active'
                         then coalesce((p_payload ->> 'is_active')::boolean, true)
                         else is_active end
    where id = v_id
    returning id into v_id;
  else
    insert into public.faq_items (question_id, question_en, answer_id, answer_en, sort_order, is_active)
    values (
      left(v_q, 200),
      left(coalesce(p_payload ->> 'question_en', ''), 200),
      left(coalesce(p_payload ->> 'answer_id', ''), 2000),
      left(coalesce(p_payload ->> 'answer_en', ''), 2000),
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      coalesce((p_payload ->> 'is_active')::boolean, true)
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  return jsonb_build_object('id', v_id);
end;
$body$;

-- admin_delete_faq: hapus pertanyaan -------------------------------------------
create or replace function public.admin_delete_faq(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $body$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.faq_items where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  return jsonb_build_object('deleted', true);
end;
$body$;

-- =============================================================================
-- ZONA ONGKIR
-- =============================================================================

-- admin_upsert_zone: simpan zona + diskon bertingkat ----------------------------
CREATE OR REPLACE FUNCTION public.admin_upsert_zone(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
  v_kind text;
  v_row public.delivery_zones%rowtype;
  v_discounts jsonb := '[]'::jsonb;
  v_d jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_id := trim(coalesce(p_payload->>'id', ''));
  if v_id = '' then
    raise exception 'invalid_id' using errcode = '22023';
  end if;
  if length(v_id) > 50 or v_id !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid_id' using errcode = '22023';
  end if;

  -- Kind wajib salah satu dari dua nilai yang valid.
  v_kind := coalesce(nullif(btrim(p_payload->>'kind'), ''), 'delivery');
  if v_kind not in ('delivery', 'pickup') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  -- Diskon ongkir bertingkat (req. Steven 12-10-2026): tiap aturan = minimal
  -- belanja + persen potongan. Bentuk jsonb: [{"min": 50000, "percent": 50}]
  -- Tidak valid (min bukan angka / percent di luar 0-100 / duplikat) DIABAIKAN,
  -- bukan error, supaya satu bar rusak tidak membuat seluruh zona gagal disimpan.
  for v_d in select * from jsonb_array_elements(
    case when jsonb_typeof(p_payload->'shipping_discounts') = 'array'
         then p_payload->'shipping_discounts' else '[]'::jsonb end)
  loop
    if jsonb_typeof(v_d) <> 'object' then continue; end if;
    if coalesce((v_d->>'percent')::int, -1) not between 0 and 100 then continue; end if;
    v_discounts := v_discounts || jsonb_build_array(jsonb_build_object(
      'min',      greatest(coalesce((v_d->>'min')::int, 0), 0),
      'percent',  (v_d->>'percent')::int));
  end loop;
  v_discounts := (
    select coalesce(jsonb_agg(d order by (d->>'min')::int), '[]'::jsonb)
    from (select distinct jsonb_build_object('min', (x->>'min')::int, 'percent', (x->>'percent')::int) as d
          from jsonb_array_elements(v_discounts) x) s
  );
  -- Titik pengambilan tidak pernah pakai ongkir, jadi juga tidak ada diskon.
  if v_kind = 'pickup' then v_discounts := '[]'::jsonb; end if;

  insert into public.delivery_zones (
    id, name_id, name_en, fee,
    lat, lng, radius_km,
    requires_address, sort_order, is_active,
    kind, note_id, note_en, shipping_discounts
  ) values (
    v_id,
    coalesce(nullif(btrim(p_payload->>'name_id'), ''), v_id),
    coalesce(nullif(btrim(p_payload->>'name_en'), ''), v_id),
    -- Titik pengambilan tidak pernah pakai ongkir.
    case when v_kind = 'pickup' then 0
         else greatest(coalesce((p_payload->>'fee')::integer, 0), 0) end,
    nullif(p_payload->>'lat', '')::double precision,
    nullif(p_payload->>'lng', '')::double precision,
    nullif(p_payload->>'radius_km', '')::double precision,
    -- Titik pengambilan = pembeli datang ke lokasi, bukan minta diantar.
    case when v_kind = 'pickup' then false
         else coalesce((p_payload->>'requires_address')::boolean, true) end,
    coalesce((p_payload->>'sort_order')::integer, 0),
    coalesce((p_payload->>'is_active')::boolean, true),
    v_kind,
    nullif(btrim(p_payload->>'note_id'), ''),
    nullif(btrim(p_payload->>'note_en'), ''),
    v_discounts
  )
  on conflict (id) do update set
    name_id = excluded.name_id,
    name_en = excluded.name_en,
    fee = excluded.fee,
    lat = excluded.lat,
    lng = excluded.lng,
    radius_km = excluded.radius_km,
    requires_address = excluded.requires_address,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    kind = excluded.kind,
    note_id = excluded.note_id,
    note_en = excluded.note_en,
    shipping_discounts = excluded.shipping_discounts
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'name_id', v_row.name_id,
    'name_en', v_row.name_en,
    'fee', v_row.fee,
    'lat', v_row.lat,
    'lng', v_row.lng,
    'radius_km', v_row.radius_km,
    'requires_address', v_row.requires_address,
    'sort_order', v_row.sort_order,
    'is_active', v_row.is_active,
    'kind', v_row.kind,
    'note_id', v_row.note_id,
    'note_en', v_row.note_en,
    'shipping_discounts', v_row.shipping_discounts
  );
end;
$function$;

-- list_active_zones: kirim diskon ke pembeli ------------------------------------
-- (RETURNS TABLE berubah -> wajib drop; grant di pasang ulang di bawah)
drop function if exists public.list_active_zones();

CREATE FUNCTION public.list_active_zones()
 RETURNS TABLE(id text, name_id text, name_en text, fee integer, lat text, lng text, radius_km text, requires_address boolean, kind text, note_id text, note_en text, shipping_discounts jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    z.id::text,
    z.name_id::text,
    z.name_en::text,
    z.fee::integer,
    z.lat::text,
    z.lng::text,
    z.radius_km::text,
    z.requires_address,
    z.kind::text,
    z.note_id::text,
    z.note_en::text,
    z.shipping_discounts
  from public.delivery_zones z
  where z.is_active
  order by
    -- 'delivery' < 'pickup' secara alfabetis, jadi zona antaran tampil dulu
    -- supaya urutan di UI admin/pembeli tetap masuk akal.
    case z.kind when 'delivery' then 0 else 1 end,
    z.sort_order asc,
    z.id asc;
$function$;

grant execute on function public.list_active_zones() to anon, authenticated, service_role;

-- admin_list_zones: kirim diskon ke form admin ----------------------------------
-- (RETURNS TABLE berubah -> wajib drop; grant di pasang ulang di bawah)
drop function if exists public.admin_list_zones();

CREATE FUNCTION public.admin_list_zones()
 RETURNS TABLE(id text, name_id text, name_en text, fee integer, lat double precision, lng double precision, radius_km double precision, requires_address boolean, sort_order integer, is_active boolean, created_at timestamp with time zone, kind text, note_id text, note_en text, shipping_discounts jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    z.id::text,
    z.name_id::text,
    z.name_en::text,
    z.fee::integer,
    z.lat::double precision,
    z.lng::double precision,
    z.radius_km::double precision,
    z.requires_address::boolean,
    z.sort_order::integer,
    z.is_active::boolean,
    z.created_at::timestamptz,
    z.kind::text,
    z.note_id::text,
    z.note_en::text,
    z.shipping_discounts
  from public.delivery_zones z
  order by
    case z.kind when 'delivery' then 0 else 1 end,
    z.sort_order asc,
    z.id asc;
$function$;

grant execute on function public.admin_list_zones() to anon, authenticated, service_role;

-- create_order: fee dari TABEL + terapkan potongan sesuai subtotal ---------------
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

  v_zone_row         public.delivery_zones%rowtype;
  v_zone_fee         integer := 0;
  v_zone_discounts   jsonb := '[]'::jsonb;
  v_discount_pct     integer := 0;

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

  -- (migration-46) Ongkir SELALU dibaca dari tabel `delivery_zones`.
  -- Sebelumnya dibaca dari jsonb `store_settings.delivery_zones` -- sumber
  -- LAMA yang sudah ditinggalkan migration-32. Akibatnya pembeli melihat
  -- fee yang diedit admin (mis. Rp5.000) tapi backend menagih nilai jsonb lama
  -- (Rp10.000), dan zona yang tidak ada di jsonb itu (mis. 'antar') ditagih
  -- Rp0 alias gratis.
  if p_delivery_method = 'delivery' then
    select * into v_zone_row from public.delivery_zones where id = p_delivery_zone;
    if found then
      v_zone_fee := greatest(coalesce(v_zone_row.fee, 0), 0);
      v_zone_discounts := coalesce(v_zone_row.shipping_discounts, '[]'::jsonb);
    else
      v_zone_fee := 0;
      v_zone_discounts := '[]'::jsonb;
    end if;
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

  -- (migration-46) Diskon ongkir. Dipakai aturan dengan `min` tertinggi yang
  -- sudah terlampaui subtotal, jadi pembeli selalu dapat potongan terbaik yang
  -- berhak dia dapat. Ongkir tidak pernah minus.
  if p_delivery_method = 'delivery' and v_zone_fee > 0 and v_zone_discounts <> '[]'::jsonb then
    select coalesce(max((d->>'percent')::int), 0) into v_discount_pct
    from jsonb_array_elements(v_zone_discounts) d
    where (d->>'min')::int <= v_subtotal;

    if v_discount_pct > 0 then
      v_delivery := v_zone_fee - round(v_zone_fee * v_discount_pct / 100.0);
    else
      v_delivery := v_zone_fee;
    end if;
  else
    v_delivery := v_zone_fee;
  end if;

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

-- public_faq dibaca halaman /faq dari sisi anonymous -----------------------------
grant execute on function public.public_faq() to anon, authenticated, service_role;
grant execute on function public.admin_list_faq() to authenticated, service_role;
grant execute on function public.admin_save_faq(jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_faq(bigint) to authenticated, service_role;

notify pgrst, 'reload schema';
