-- Migration-52 — batch PO punya bundle sendiri (Steven 14-10-2026).
--
-- sama halnya dengan bundle, ... buat kita bisa set bundle juga untuk batch po".
--
-- Jadi tiap batch tidak hanya punya stok per jenis menu, tapi juga daftar paket
-- (bundle) yang ditawarkan — dengan harga khusus per batch kalau perlu.
--
-- Yang ditambahkan:
--   1. Tabel po_batch_bundles (batch_id, bundle_id, price, is_active).
--   2. RPC admin untuk menyimpan stok + pilihan bundle per batch.
--   3. admin_list_po_batch_detail diperluas: key bundles (semua bundle aktif +
--      apakah dipilih di batch ini) dan semua_bundle_aktif.
--   4. public_po_batch_for_date mengembalikan ke pembeli daftar bundle id yang
--      boleh dipesan untuk batch itu.
--   5. create_order di-patch: bundle yang tidak ada di batch ditolak, dan
--      subtotal memakai harga khusus batch kalau diisi.
--
-- ATURAN PENTING (backward-safe): batch yang BELUM PERNAH diset bundle (nol
-- baris di po_batch_bundles) tetap memakai SEMUA bundle aktif seperti mode
-- lama. Begitu Steven memilih minimal satu bundle untuk batch itu, barulah
-- hanya bundle terpilih yang boleh dipesan. Ini supaya batch yang sudah ada
-- sebelum migrasi ini tidak langsung tidak bisa dipesan paket.
--
-- Bundle TIDAK punya stok sendiri: setiap slot bundle tetap memakan 1 pcs dari
-- stok kategori rasa-nya, persis seperti sekarang. Yang dibatasi batch ini
-- hanya bundle mana yang boleh dibeli dan harganya berapa.

-- ---------------------------------------------------------------------------
-- 1. Tabel bundle per batch
-- ---------------------------------------------------------------------------
create table if not exists public.po_batch_bundles (
  batch_id bigint not null references public.po_batches(id) on delete cascade,
  bundle_id bigint not null references public.bundles(id) on delete cascade,
  -- NULL = pakai harga bawaan bundle. Diisi = harga khusus batch ini.
  price integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint po_batch_bundles_pkey primary key (batch_id, bundle_id),
  constraint po_batch_bundles_price_positive check (price is null or price > 0)
);

comment on table public.po_batch_bundles is
  'Bundle (paket) yang ditawarkan di satu batch PO. Kalau batch tidak punya '
  'baris sama sekali, semua bundle aktif tetap boleh dipakai (mode lama).';

create index if not exists po_batch_bundles_batch_idx
  on public.po_batch_bundles (batch_id);

-- RLS tanpa policy SELECT untuk anon: baris ini hanya dibaca lewat RPC admin
-- dan RPC publik yang security definer.
alter table public.po_batch_bundles enable row level security;

-- ---------------------------------------------------------------------------
-- 2. RPC admin: simpan stok + bundle untuk satu batch
-- ---------------------------------------------------------------------------
-- Dipisah dari admin_save_po_batch supaya halaman detail batch bisa menyimpan
-- keduanya tanpa perlu mengirim ulang tanggal dan label batch.
create or replace function public.admin_save_po_batch_stock(
  p_batch_id bigint,
  p_stock jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_batch public.po_batches%rowtype;
  v_entry record;
  v_cat_id bigint;
  v_val integer;
  v_reserved jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_batch from public.po_batches where id = p_batch_id;
  if not found then
    raise exception 'batch_not_found' using errcode = '22023';
  end if;

  -- Stok yang sudah dipesan tidak boleh turun. Logikanya sama dengan
  -- admin_save_po_batch (migration-49), diulang supaya halaman detail bisa
  -- menyimpan stok tanpa harus mengirim ulang field lain.
  --
  -- PENTING: harus dua tingkat. jsonb_object_agg(k, coalesce(sum(x), 0))
  -- illegal — Postgres menolak "aggregate function calls cannot be nested".
  -- Jadi jumlahkan per kategori dulu di CTE, baru object_agg.
  --
  -- Catatan kedua: jsonb_each mengembalikan DUA KOLOM (key, value), bukan satu
  -- objek jsonb. Kalau variabel dideklarasikan jsonb, v_entry.key akan
  -- ditafsirkan sebagai kolom dari tabel dan gagal. Karena itu declare
  -- key-nya langsung sebagai bigint/integer di level query.
  with per_cat as (
    select fl.category_id, sum(oi.quantity)::int as pcs
      from public.orders o
      join public.order_items oi on oi.order_id = o.id
      join public.flavors fl on fl.id = oi.flavor_id
     where o.po_batch_id = v_batch.id
       and o.status not in ('rejected', 'cancelled')
       and fl.category_id is not null
     group by fl.category_id
  )
  select coalesce(jsonb_object_agg(
           per_cat.category_id::text,
           per_cat.pcs
         ), '{}'::jsonb)
    into v_reserved
    from per_cat;

  -- Ganti seluruh isi stok batch ini.
  delete from public.po_batch_stock where batch_id = v_batch.id;

  for v_entry in
    select (e.key)::bigint as cat_id,
           greatest(0, coalesce((e.value ->> 'stock')::int, 0)) as val
      from jsonb_each(coalesce(p_stock, '{}'::jsonb)) e
  loop
    v_cat_id := v_entry.cat_id;
    v_val := v_entry.val;
    if coalesce((v_reserved ->> v_cat_id::text)::int, 0) > v_val then
      raise exception 'stock_below_reserved' using errcode = '22023';
    end if;
    insert into public.po_batch_stock (batch_id, category_id, stock)
    values (v_batch.id, v_cat_id, v_val)
    on conflict (batch_id, category_id)
    do update set stock = excluded.stock;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'stok', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id', s.category_id,
        'stock', s.stock
      ) order by s.category_id)
      from public.po_batch_stock s where s.batch_id = v_batch.id
    ), '[]'::jsonb)
  );
end;
$fn$;

comment on function public.admin_save_po_batch_stock(bigint, jsonb) is
  'Migration-52: simpan stok per jenis menu untuk satu batch. Stok tidak boleh '
  'turun di bawah yang sudah dipesan (stock_below_reserved).';

grant execute on function public.admin_save_po_batch_stock(bigint, jsonb) to authenticated, service_role;


create or replace function public.admin_save_po_batch_bundles(
  p_batch_id bigint,
  p_bundles jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_batch public.po_batches%rowtype;
  v_entry jsonb;
  v_bundle_id bigint;
  v_price integer;
  v_is_active boolean;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_batch from public.po_batches where id = p_batch_id;
  if not found then
    raise exception 'batch_not_found' using errcode = '22023';
  end if;

  -- Array kosong berarti "pakai semua bundle aktif" (mode lama). Baris yang
  -- ada di tabel inilah yang governs, jadi hapus semua dulu supaya tidak ada
  -- baris nyasar yang tetap aktif.
  delete from public.po_batch_bundles where batch_id = v_batch.id;

  for v_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_entry ->> 'bundle_id')::bigint;
    if v_bundle_id is null then continue; end if;
    if not exists (select 1 from public.bundles where id = v_bundle_id) then
      raise exception 'bundle_not_found' using errcode = '22023';
    end if;
    v_price := nullif((v_entry ->> 'price')::int, 0);
    if v_price is not null and v_price < 0 then
      raise exception 'bundle_price_invalid' using errcode = '22023';
    end if;
    v_is_active := coalesce((v_entry ->> 'is_active')::boolean, true);
    insert into public.po_batch_bundles (batch_id, bundle_id, price, is_active)
    values (v_batch.id, v_bundle_id, v_price, v_is_active)
    on conflict (batch_id, bundle_id)
    do update set price = excluded.price, is_active = excluded.is_active;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'jumlah', (select count(*)::int from public.po_batch_bundles where batch_id = v_batch.id)
  );
end;
$fn$;

comment on function public.admin_save_po_batch_bundles(bigint, jsonb) is
  'Migration-52: simpan daftar bundle yang ditawarkan di satu batch. Array '
  'kosong berarti semua bundle aktif boleh dipakai (mode lama).';

grant execute on function public.admin_save_po_batch_bundles(bigint, jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. admin_list_po_batch_detail + key bundles
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_po_batch_detail(
  p_batch_id bigint
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_batch public.po_batches%rowtype;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_batch from public.po_batches where id = p_batch_id;
  if not found then
    raise exception 'batch_not_found' using errcode = '22023';
  end if;

  -- "Terjual" memakai semantik yang sama dengan kartu batch: semua status
  -- kecuali rejected dan cancelled, karena pesanan yang ditolak mengembalikan
  -- stoknya (lihat restore_order_stock).
  --
  -- stok_awal TIDAK disimpan di database, jadi diturunkan: sisa + terjual.
  select jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'label', v_batch.label,
      'open_at', v_batch.open_at,
      'close_at', v_batch.close_at,
      'pickup_date', v_batch.pickup_date,
      'is_active', v_batch.is_active,
      'status', case
        when not v_batch.is_active then 'nonaktif'
        when current_date < v_batch.open_at then 'akan_dibuka'
        when current_date > v_batch.close_at then 'selesai'
        else 'buka'
      end
    ),
    'stok', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'category_id', c.id,
          'nama', c.name_id,
          'sisa', coalesce(s.stock, 0)::int,
          'terjual', coalesce(t.pcs, 0)::int,
          'stok_awal', (coalesce(s.stock, 0) + coalesce(t.pcs, 0))::int
        ) order by c.sort_order, c.id
      )
      from public.categories c
      left join public.po_batch_stock s
        on s.category_id = c.id and s.batch_id = v_batch.id
      left join (
        select fl.category_id, sum(oi.quantity)::bigint as pcs
          from public.orders o
          join public.order_items oi on oi.order_id = o.id
          left join public.flavors fl on fl.id = oi.flavor_id
         where o.po_batch_id = v_batch.id
           and o.status not in ('rejected', 'cancelled')
         group by fl.category_id
      ) t on t.category_id = c.id
      where s.category_id is not null or t.category_id is not null
    ), '[]'::jsonb),
    -- Migration-52: semua bundle aktif, lengkap dengan status "dipakai di
    -- batch ini / tidak" plus harga khusus batch kalau ada.
    'bundles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'bundle_id', b.id,
          'nama', b.name_id,
          'desc', coalesce(b.desc_id, ''),
          'harga_bawaan', b.price,
          'required_qty', b.required_qty,
          'dipakai', coalesce(pb.bundle_id is not null, false),
          'harga_batch', pb.price
        ) order by b.sort_order, b.id
      )
      from public.bundles b
      left join public.po_batch_bundles pb
        on pb.bundle_id = b.id and pb.batch_id = v_batch.id
      where b.is_active
    ), '[]'::jsonb),
    -- Kalau belum ada satu pun baris, semua bundle aktif boleh dipakai.
    'semua_bundle_aktif', not exists (
      select 1 from public.po_batch_bundles where batch_id = v_batch.id
    ),
    'ringkasan', jsonb_build_object(
      'terjual', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id
                     and o.status not in ('rejected', 'cancelled')),
      'pcs_terjual', coalesce((
        select sum(oi.quantity)::bigint
          from public.orders o
          join public.order_items oi on oi.order_id = o.id
         where o.po_batch_id = v_batch.id
           and o.status not in ('rejected', 'cancelled')
      ), 0)::bigint,
      'pendapatan', coalesce((
        select sum(o.total_price)::bigint from public.orders o
         where o.po_batch_id = v_batch.id
           and o.status not in ('rejected', 'cancelled')
      ), 0)::bigint,
      'pending', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id and o.status = 'pending'),
      'selesai', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id
                     and o.status in ('accepted', 'ready', 'delivered')),
      'ditolak', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id
                     and o.status in ('rejected', 'cancelled'))
    )
  ) into v_result;

  return v_result;
end;
$fn$;

comment on function public.admin_list_po_batch_detail(bigint) is
  'Migration-52: tambah key bundles (semua bundle aktif + apakah dipakai di '
  'batch ini + harga khusus) dan semua_bundle_aktif ke detail batch.';

grant execute on function public.admin_list_po_batch_detail(bigint) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 4. public_po_batch_for_date ikut mengirim daftar bundle yang boleh dipesan
-- ---------------------------------------------------------------------------
create or replace function public.public_po_batch_for_date(p_pickup_date date)
returns jsonb
language sql
stable
security definer
set search_path TO 'public'
as $fn$
  with per_batch as (
    select b.id,
           b.pickup_date,
           coalesce(sum(s.stock), 0)::int as sisa
      from public.po_batches b
      left join public.po_batch_stock s on s.batch_id = b.id
     where b.is_active
       and current_date between b.open_at and b.close_at
       and b.pickup_date = p_pickup_date
     group by b.id, b.pickup_date
  ),
  terpilih as (
    select id, pickup_date, sisa
      from per_batch
     order by sisa asc, id asc
     limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'batch_id', t.id,
      'pickup_date', t.pickup_date,
      'sisa', t.sisa,
      'stok', coalesce((
        select jsonb_object_agg(
          s.category_id::text,
          jsonb_build_object('nama', c.name_id, 'sisa', s.stock)
        )
        from public.po_batch_stock s
        join public.categories c on c.id = s.category_id
       where s.batch_id = t.id
      ), '{}'::jsonb),
      -- Migration-52: daftar bundle yang boleh dipesan untuk batch ini.
      -- Null = semua bundle aktif (mode lama), jadi sisi pembeli tidak
      -- memfilter apa pun.
      'bundles', (
        select jsonb_agg(
          jsonb_build_object(
            'bundle_id', pb.bundle_id,
            'price', coalesce(pb.price, bu.price)
          ) order by bu.sort_order, bu.id
        )
        from public.po_batch_bundles pb
        join public.bundles bu on bu.id = pb.bundle_id
       where pb.batch_id = t.id
         and pb.is_active
         and bu.is_active
      )
    )
    from terpilih t
  ), 'null'::jsonb);
$fn$;

comment on function public.public_po_batch_for_date(date) is
  'Migration-52: tambah key bundles — daftar bundle (id + harga batch) yang '
  'boleh dipesan untuk batch tanggal itu. Null = semua bundle aktif.';

grant execute on function public.public_po_batch_for_date(date) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. create_order: batasi bundle per batch + harga khusus batch
-- ---------------------------------------------------------------------------
-- Di-patch dari definisi LIVE (migration-49 sudah melakukan patch-patch
-- sebelumnya, jadi definisi di sini diambil dari database, bukan ditulis
-- ulang dari nol). Pola penggantian string WAJIB cocok persis.

-- Ada dua overload create_order di database. Yang 20 argumen (dengan
-- p_po_batch_id) adalah yang dipakai frontend dan sudah punya logika batch
-- dari migration-49. Yang 18 argumen adalah versi lama yang tidak punya
-- batch sama sekali dan tidak dipanggil siapa pun -- dibuang supaya tidak
-- ada versi yang Diam-diam berbeda perilakunya.
drop function if exists public.create_order(text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, jsonb, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_order(p_customer_name text DEFAULT ''::text, p_customer_email text DEFAULT ''::text, p_instagram text DEFAULT ''::text, p_phone text DEFAULT ''::text, p_payment_method text DEFAULT 'transfer'::text, p_delivery_method text DEFAULT 'pickup'::text, p_delivery_zone text DEFAULT 'pickup'::text, p_address text DEFAULT NULL::text, p_address_note text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_transfer_method text DEFAULT NULL::text, p_payment_proof text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_language text DEFAULT 'id'::text, p_items jsonb DEFAULT '[]'::jsonb, p_bundles jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_batch_id bigint DEFAULT NULL::bigint, p_pickup_date date DEFAULT NULL::date)
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
  -- Migration-52: bundle yang ditawarkan di batch + harga khusus batch.
  v_bundle_row public.po_batch_bundles%rowtype;
  v_bundle_price integer;
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

  -- Migration-49: batch PO. Kalau p_po_batch_id NULL, pesanan ini bukan
  -- batch (mode lama) dan stok tetap dipotong dari categories.stock.
  v_batch            public.po_batches%rowtype;
  v_batch_stock      integer;

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

  if p_delivery_method not in ('pickup', 'delivery', 'courier') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  -- Migration-32: zone sekarang dari tabel delivery_zones (admin-defined).
  -- Migration-33: support both 'pickup' legacy dan zone ID apa pun yang aktif di tabel.
  if not exists (
    select 1 from public.delivery_zones
      where id = p_delivery_zone and is_active = true
  ) and p_delivery_zone <> 'pickup' and p_delivery_method <> 'courier' then
    raise exception 'invalid_zone' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then
    raise exception 'address_required' using errcode = '22023';
  end if;

  -- Migration-49: validasi batch PO.
  if p_po_batch_id is not null then
    select * into v_batch from public.po_batches where id = p_po_batch_id;
    if not found then
      raise exception 'batch_not_found' using errcode = '22023';
    end if;
    if not v_batch.is_active
       or current_date < v_batch.open_at
       or current_date > v_batch.close_at then
      raise exception 'batch_closed' using errcode = '22023';
    end if;
    -- Tanggal ambil yang dikirim harus sama dengan tanggal ambil batch.
    -- Kalau tidak sama, tanggalnya bukan dari pilihan pembeli.
    if p_pickup_date is not null and p_pickup_date <> v_batch.pickup_date then
      raise exception 'batch_pickup_mismatch' using errcode = '22023';
    end if;
  else
    v_batch := null;
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
    -- Migration-52: kalau pesanan masuk ke batch, bundle yang boleh dipakai
    -- adalah yang Steven pilih untuk batch itu (dan masih aktif).
    -- PENTING: batch yang BELUM PERNAH diset bundle (nol baris) tetap memakai
    -- semua bundle aktif seperti mode lama — supaya batch yang sudah ada
    -- sebelum migrasi ini tidak langsung tidak bisa dipesan paket. Begitu
    -- Steven memilih satu bundle, itu yang berlaku.
    v_bundle_row := null;
    if v_batch.id is not null then
      select * into v_bundle_row from public.po_batch_bundles
       where batch_id = v_batch.id and bundle_id = v_bundle_id and is_active;
      if not found then
        if exists (select 1 from public.po_batch_bundles where batch_id = v_batch.id) then
          raise exception 'bundle_unavailable' using errcode = '22023';
        end if;
        v_bundle_row := null;
      end if;
    end if;
    -- Harga khusus batch kalau diisi; kalau tidak, harga bundle bawaan.
    v_bundle_price := coalesce(v_bundle_row.price, v_bundle_rec.price);
    if v_bundle_price is null or v_bundle_price <= 0 then
      v_bundle_price := v_bundle_rec.price;
    end if;
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
    v_raw := v_raw + v_bundle_price;
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
    if v_batch.id is not null then
      -- Stok milik batch: baris po_batch_stock dikunci supaya dua pembeli
      -- bersamaan tidak bisa sama-sama mengambil pcs terakhir.
      select stock into v_batch_stock
        from public.po_batch_stock
       where batch_id = v_batch.id and category_id = v_cat_id
       for update;
      if coalesce(v_batch_stock, 0) < v_cat_pcs then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
      update public.po_batch_stock
         set stock = stock - v_cat_pcs
       where batch_id = v_batch.id and category_id = v_cat_id;
    else
      select * into v_category from public.categories where id = v_cat_id for update;
      if not found then continue; end if;
      if v_category.stock_enabled and v_cat_pcs > v_category.stock then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
      if v_category.stock_enabled then
        update public.categories set stock = greatest(0, stock - v_cat_pcs) where id = v_cat_id;
      end if;
    end if;
  end loop;

  v_code := 'RK-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_code_seq')::text, 3, '0');

  insert into public.orders (
    order_code, customer_name, customer_email, instagram, phone, phone_normalized,
    delivery_method, delivery_zone, address, address_note, lat, lng,
    payment_method, transfer_method, payment_proof_path, note,
    subtotal, delivery_fee, total_price, item_count, language,
    user_id, notes,
    qris_transaction_id, qris_status, qris_qr_url, qris_expires_at,
    po_batch_id, pickup_date
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
    null,  -- qris_expires_at
    v_batch.id,  -- po_batch_id (NULL kalau pesanan ini bukan batch)
    case when v_batch.id is not null then v_batch.pickup_date else null end
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
        v_bundle_price / v_bundle_rec.required_qty, 1,
        v_bundle_price / v_bundle_rec.required_qty
      );
      insert into public.bundle_items (bundle_id, slot, flavor_id, order_id)
      values (v_bundle_rec.id, v_slot_idx, v_flavor.id, v_order_id);
    end loop;
  end loop;

  return jsonb_build_object('order_code', v_code, 'order_id', v_order_id);
end;
$function$;

comment on function public.create_order(text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, jsonb, jsonb, uuid, bigint, date) is
  'Migration-52: kalau p_po_batch_id terisi, bundle yang boleh dipesan hanya yang ada di po_batch_bundles untuk batch itu (batch tanpa baris bundle = semua bundle aktif). Harga memakai harga batch kalau po_batch_bundles.price diisi, kalau tidak harga bawaan bundle. Bundle tidak punya stok sendiri: setiap slot tetap memakan 1 pcs dari stok kategori rasa-nya.';

grant execute on function public.create_order(text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, jsonb, jsonb, uuid, bigint, date) to anon, authenticated, service_role;
