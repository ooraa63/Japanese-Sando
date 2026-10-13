-- =============================================================================
-- MIGRATION 49 — BATCH PRE-ORDER (PO)
--
-- Diminta Steven 13-10-2026. Ganti model "satu tombol buka/tutup pre-order"
-- dengan beberapa batch, masing-masing punya:
--   - tanggal buka  (buyer boleh memesan mulai tanggal ini)
--   - tanggal tutup (buyer tidak boleh memesan setelah tanggal ini)
--   - tanggal pengambilan (yang DIPILIH pembeli)
--   - stok sendiri per jenis menu
--
-- Contoh yang diminta Steven:
--   Batch A: buka 14-16 Okt, ambil 17 Okt, stok 30
--   Batch B: buka 15-18 Okt, ambil 19 Okt, stok 40
--   Pembeli hanya melihat TANGGAL PENGAMBILAN (17 atau 19 Okt), tidak tahu
--   nama batch. Kalau memilih 17 Okt, stok yang terpakai adalah stok Batch A.
--
-- Aturan yang dipakai kalau dua batch punya tanggal pengambilan sama
-- (jawaban Steven: "diset dulu ke yang stock dari paling dikit, kalau habis
-- baru ke stock banyak, ya pembeli tidak perlu tau"): batch dengan total
-- sisa stok paling sedikit yang dipilih lebih dulu.
--
-- Catatan penting soal data lama:
--   - 6 pesanan lama (prefix JS-) TIDAK ditulis ulang. Kolom po_batch_id
--     dan pickup_date nullable, jadi pesanan lama tetap utuh.
--   - Kalau belum ada batch yang dibuka, pemesanan tetap jalan seperti
--     sekarang: po_batch_id NULL dan stok dipotong dari categories.stock.
--     Jadi halaman ini tidak bisa membuat toko tutup mendadak.
--
-- Body create_order / admin_update_order_status / expire_stale_qris_orders
-- diambil VERBATIM dari definisi LIVE lewat pg_get_functiondef (lihat
-- .tmp-gen49.mjs), lalu hanya bagian yang perlu diubah yang diganti.
-- Migration historis 1-48 tidak disentuh sama sekali.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Tabel batch PO
-- ---------------------------------------------------------------------------
create table if not exists public.po_batches (
  id           bigint generated always as identity primary key,
  -- Nama bebas untuk penjual, mis. "PO Oktober A". Tidak pernah tampil ke
  -- pembeli, jadi boleh apa saja.
  label        text not null,
  open_at      date not null,
  close_at     date not null,
  pickup_date  date not null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint po_batches_urutan_tanggal check (open_at <= close_at),
  constraint po_batches_ambil_setelah_tutup check (pickup_date >= open_at)
);

comment on table public.po_batches is
  'Batch pre-order. Setiap batch punya jendela pemesanan sendiri, satu tanggal '
  'pengambilan, dan stok sendiri per jenis menu. Menggantikan tombol buka/tutup '
  'pre-order yang dulu ada di store_settings.is_preorder_open.';

create table if not exists public.po_batch_stock (
  batch_id    bigint not null references public.po_batches(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete cascade,
  stock       integer not null default 0,
  primary key (batch_id, category_id),
  constraint po_batch_stock_nonneg check (stock >= 0)
);

comment on table public.po_batch_stock is
  'Sisa stok per jenis menu per batch. Stok batch TIDAK sama dengan '
  'categories.stock: dua batch yang tanggal bukanya tumpang tindih punya stok '
  'yang terpisah.';

create index if not exists po_batches_jendela_idx
  on public.po_batches (open_at, close_at)
  where is_active;

create index if not exists po_batches_pickup_idx
  on public.po_batches (pickup_date)
  where is_active;


-- ---------------------------------------------------------------------------
-- 2. Kolom baru di orders
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists po_batch_id bigint references public.po_batches(id) on delete set null,
  add column if not exists pickup_date date;

comment on column public.orders.po_batch_id is
  'Batch PO asal pesanan. NULL = pesanan bukan batch (mode lama).';
comment on column public.orders.pickup_date is
  'Tanggal pengambilan yang dipilih pembeli. Salinan dari batch, disimpan di '
  'sini supaya pesanan tetap terbaca walau batch-nya nanti dihapus.';


-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.po_batches     enable row level security;
alter table public.po_batch_stock enable row level security;

drop policy if exists po_batches_read on public.po_batches;
create policy po_batches_read on public.po_batches
  for select to anon, authenticated
  using (is_active);

drop policy if exists po_batch_stock_read on public.po_batch_stock;
create policy po_batch_stock_read on public.po_batch_stock
  for select to anon, authenticated
  using (true);

-- Tulis hanya lewat RPC yang memanggil is_admin().


-- ---------------------------------------------------------------------------
-- 4. Fungsi stok bersama (dipakai create_order, admin_update_order_status,
--    dan expire_stale_qris_orders supaya semuanya mengetik logika yang sama)
-- ---------------------------------------------------------------------------

-- Kembalikan stok satu pesanan. Idempoten TIDAK; pemanggilnya yang pakai
-- flag orders.stock_restored sebagai pagar.
create or replace function public.restore_order_stock(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path TO 'public'
as $fn$
declare
  v_order public.orders%rowtype;
  v_cat_id  bigint;
  v_cat_pcs integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return;
  end if;

  for v_cat_id, v_cat_pcs in
    select f.category_id, sum(oi.quantity)::int
      from public.order_items oi
      join public.flavors f on f.id = oi.flavor_id
     where oi.order_id = p_order_id
       and f.category_id is not null
     group by f.category_id
  loop
    if v_order.po_batch_id is not null then
      insert into public.po_batch_stock (batch_id, category_id, stock)
      values (v_order.po_batch_id, v_cat_id, v_cat_pcs)
      on conflict (batch_id, category_id)
      do update set stock = public.po_batch_stock.stock + excluded.stock;
    else
      update public.categories c
         set stock = c.stock + v_cat_pcs
       where c.id = v_cat_id
         and c.stock_enabled;
    end if;
  end loop;
end;
$fn$;

comment on function public.restore_order_stock(bigint) is
  'Kembalikan stok satu pesanan ke batch asalnya, atau ke categories.stock '
  'kalau pesanan itu bukan batch.';

-- Kebalikan dari restore: pakai lagi stok. Dipanggil saat pesanan ditolak
-- lalu dikembalikan ke status menunggu.
create or replace function public.consume_order_stock(p_order_id bigint)
returns void
language plpgsql
security definer
set search_path TO 'public'
as $fn$
declare
  v_order      public.orders%rowtype;
  v_cat_id     bigint;
  v_cat_pcs    integer;
  v_category   public.categories%rowtype;
  v_batch_s    integer;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  for v_cat_id, v_cat_pcs in
    select f.category_id, sum(oi.quantity)::int
      from public.order_items oi
      join public.flavors f on f.id = oi.flavor_id
     where oi.order_id = p_order_id
       and f.category_id is not null
     group by f.category_id
  loop
    if v_order.po_batch_id is not null then
      select stock into v_batch_s
        from public.po_batch_stock
       where batch_id = v_order.po_batch_id and category_id = v_cat_id
       for update;
      if coalesce(v_batch_s, 0) < v_cat_pcs then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
      update public.po_batch_stock
         set stock = stock - v_cat_pcs
       where batch_id = v_order.po_batch_id and category_id = v_cat_id;
    else
      select * into v_category from public.categories where id = v_cat_id for update;
      if not found then continue; end if;
      if v_category.stock_enabled and v_cat_pcs > v_category.stock then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
      if v_category.stock_enabled then
        update public.categories
           set stock = greatest(0, stock - v_cat_pcs)
         where id = v_cat_id;
      end if;
    end if;
  end loop;
end;
$fn$;

comment on function public.consume_order_stock(bigint) is
  'Pakai lagi stok satu pesanan yang sebelumnya sudah dikembalikan (mis. saat '
  'pesanan ditolak lalu dikembalikan ke status menunggu).';


-- ---------------------------------------------------------------------------
-- 5. RPC publik untuk pembeli
-- ---------------------------------------------------------------------------

-- Tanggal pengambilan yang sedang bisa dipilih. Satu baris per tanggal, dan
-- TIDAK menyebut nama batch: pembeli cuma melihat "17 Oktober".
-- Tanggal disembunyikan kalau seluruh stoknya sudah habis.
create or replace function public.public_po_pickup_dates()
returns jsonb
language sql
stable
security definer
set search_path TO 'public'
as $fn$
  -- PENTING: sisa stok per batch harus dihitung di CTE terpisah dulu.
  -- Menulis max(sum(...)) langsung illegal ("aggregate function calls cannot
  -- be nested"), jadi dua tingkat: per batch, lalu per tanggal.
  with per_batch as (
    select b.id,
           b.pickup_date,
           coalesce(sum(s.stock), 0)::int as sisa
      from public.po_batches b
      left join public.po_batch_stock s on s.batch_id = b.id
     where b.is_active
       and current_date between b.open_at and b.close_at
     group by b.id, b.pickup_date
  ),
  per_tanggal as (
    select pickup_date, max(sisa)::int as sisa
      from per_batch
     group by pickup_date
  )
  select jsonb_build_object(
    'ada_batch', (select count(*) > 0 from per_batch),
    'tanggal', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'pickup_date', pickup_date,
          'sisa', sisa
        )
        order by pickup_date
      )
      from per_tanggal
      where sisa > 0
    ), '[]'::jsonb)
  );
$fn$;

comment on function public.public_po_pickup_dates() is
  'Tanggal pengambilan yang sedang bisa dipilih pembeli, beserta sisa stok '
  'terbanyak di tanggal itu. Dipanggil sekali saat halaman pesanan dibuka.';

-- Batch yang dipakai untuk satu tanggal pengambilan.
--
-- Aturan Steven: kalau beberapa batch punya tanggal pengambilan sama, pakai
-- yang total sisa stoknya PALING SEDIKIT dulu, kalau habis baru yang lebih
-- banyak. Pembeli tidak pernah tahu bedanya.
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
      ), '{}'::jsonb)
    )
    from terpilih t
  ), 'null'::jsonb);
$fn$;

comment on function public.public_po_batch_for_date(date) is
  'Batch yang dipakai untuk satu tanggal pengambilan, beserta sisa stok per '
  'jenis menu. Kalau tanggalnya punya lebih dari satu batch, yang dipilih '
  'adalah yang sisa stoknya paling sedikit.';


-- ---------------------------------------------------------------------------
-- 6. RPC admin
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_po_batches()
returns jsonb
language plpgsql
stable
security definer
set search_path TO 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'batches', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'label', b.label,
          'open_at', b.open_at,
          'close_at', b.close_at,
          'pickup_date', b.pickup_date,
          'is_active', b.is_active,
          'status', case
            when not b.is_active then 'nonaktif'
            when current_date < b.open_at then 'akan_dibuka'
            when current_date > b.close_at then 'selesai'
            else 'buka'
          end,
          'terjual', coalesce((
            select count(*)::int
              from public.orders o
             where o.po_batch_id = b.id
               and o.status not in ('rejected', 'cancelled')
          ), 0),
          'pcs_terjual', coalesce((
            select coalesce(sum(oi.quantity), 0)::int
              from public.orders o
              join public.order_items oi on oi.order_id = o.id
             where o.po_batch_id = b.id
               and o.status not in ('rejected', 'cancelled')
          ), 0),
          'pendapatan', coalesce((
            select coalesce(sum(o.total_price), 0)::int
              from public.orders o
             where o.po_batch_id = b.id
               and o.status not in ('rejected', 'cancelled')
          ), 0),
          'stok', coalesce((
            select jsonb_object_agg(
              s.category_id::text,
              jsonb_build_object(
                'category_id', s.category_id,
                'nama', c.name_id,
                'stock', s.stock
              )
            )
            from public.po_batch_stock s
            join public.categories c on c.id = s.category_id
           where s.batch_id = b.id
          ), '{}'::jsonb)
        )
        order by b.pickup_date desc, b.id desc
      )
      from public.po_batches b
    ), '[]'::jsonb),
    'kategori', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'nama', c.name_id, 'aktif', c.is_active)
        order by c.sort_order, c.id
      )
      from public.categories c
    ), '[]'::jsonb)
  );
end;
$fn$;

create or replace function public.admin_save_po_batch(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path TO 'public'
as $fn$
declare
  v_id      bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_label   text;
  v_open    date;
  v_close   date;
  v_pickup  date;
  v_active  boolean;
  v_stok    jsonb;
  v_key     text;
  v_cat     bigint;
  v_num     integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_label  := left(btrim(coalesce(p_payload ->> 'label', '')), 60);
  v_open   := nullif(btrim(coalesce(p_payload ->> 'open_at', '')), '')::date;
  v_close  := nullif(btrim(coalesce(p_payload ->> 'close_at', '')), '')::date;
  v_pickup := nullif(btrim(coalesce(p_payload ->> 'pickup_date', '')), '')::date;
  v_active := coalesce((p_payload ->> 'is_active')::boolean, true);
  v_stok   := coalesce(p_payload -> 'stock', '{}'::jsonb);

  if v_label = '' then
    raise exception 'label_required' using errcode = '22023';
  end if;
  if v_open is null or v_close is null or v_pickup is null then
    raise exception 'date_required' using errcode = '22023';
  end if;
  if v_open > v_close then
    raise exception 'invalid_window' using errcode = '22023';
  end if;
  if v_pickup < v_open then
    raise exception 'invalid_pickup' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.po_batches
       set label = v_label, open_at = v_open, close_at = v_close,
           pickup_date = v_pickup, is_active = v_active, updated_at = now()
     where id = v_id
     returning id into v_id;
  else
    insert into public.po_batches (label, open_at, close_at, pickup_date, is_active)
    values (v_label, v_open, v_close, v_pickup, v_active)
    returning id into v_id;
  end if;

  -- Stok hanya boleh diubah lewat RPC ini, dan SELALU lewat nilai absolut
  -- dari panel PO. Kalau stok batch sudah terpakai, nilai baru yang lebih
  -- kecil akan ditolak di sini supaya tidak mengarang stok yang sudah jadi.
  for v_key in select jsonb_object_keys(v_stok) loop
    v_cat := v_key::bigint;
    v_num := greatest(0, coalesce((v_stok ->> v_key)::int, 0));
    if not exists (select 1 from public.categories where id = v_cat) then
      continue;
    end if;

    if v_id is not null and exists (
      select 1 from public.po_batch_stock
       where batch_id = v_id and category_id = v_cat
    ) then
      -- Boleh turun selama sisa yang dikembalikan sudah cukup untuk menutup
      -- pesanan yang masih hidup.
      if (
        select s.stock < (
          select coalesce(sum(oi.quantity), 0)::int
            from public.orders o
            join public.order_items oi on oi.order_id = o.id
            join public.flavors f on f.id = oi.flavor_id
           where o.po_batch_id = v_id
             and f.category_id = v_cat
             and o.status not in ('rejected', 'cancelled')
        )
        from public.po_batch_stock s
         where s.batch_id = v_id and s.category_id = v_cat
      ) then
        raise exception 'stock_below_reserved' using errcode = '22023';
      end if;
    end if;

    insert into public.po_batch_stock (batch_id, category_id, stock)
    values (v_id, v_cat, v_num)
    on conflict (batch_id, category_id) do update set stock = excluded.stock;
  end loop;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$fn$;

create or replace function public.admin_delete_po_batch(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path TO 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Batch yang sudah dipakai pesanan TIDAK boleh dihapus: kolom
  -- orders.po_batch_id akan jadi NULL dan laporan penjualan per batch hilang.
  if exists (select 1 from public.orders where po_batch_id = p_id) then
    raise exception 'batch_has_orders' using errcode = '22023';
  end if;

  delete from public.po_batches where id = p_id;
  return jsonb_build_object('ok', true);
end;
$fn$;


-- ---------------------------------------------------------------------------
-- 7. create_order versi baru
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 8. Fungsi status & refund stok versi baru
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_order_status(p_order_id bigint, p_new_status text, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_new_status not in ('pending','accepted','rejected','ready','delivered','cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status = p_new_status then
    raise exception 'status_unchanged' using errcode = '22023';
  end if;

  -- Migration-49: stok dikembalikan ke batch asal pesanan, atau ke
  -- categories.stock kalau pesanan itu bukan batch.
  --
  -- Versi sebelumnya menulis ke store_settings.total_stock. Kolom itu sudah
  -- tidak ada sejak stok pindah ke per kategori (migration-11), jadi setiap
  -- penolakan atau pembatalan akan error. Diperbaiki di sini.
  if p_new_status in ('rejected', 'cancelled') and v_order.stock_restored = false then
    perform public.restore_order_stock(v_order.id);
    update public.orders set stock_restored = true where id = p_order_id;
  end if;

  -- Kembalikan pesanan ditolak ke menunggu => stok dipesan lagi
  if v_order.status in ('rejected','cancelled') and p_new_status = 'pending'
     and v_order.stock_restored = true then
    perform public.consume_order_stock(v_order.id);
    update public.orders set stock_restored = false where id = p_order_id;
  end if;

  update public.orders
  set status = p_new_status,
      admin_note = coalesce(nullif(trim(coalesce(p_admin_note, '')), ''), admin_note)
  where id = p_order_id;

  return jsonb_build_object(
    'id', p_order_id,
    'status', p_new_status
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.expire_stale_qris_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row        record;
  v_cat_id     bigint;
  v_cat_pcs    integer;
  v_restored   integer := 0;
begin
  -- Loop order QRIS yang sudah lewat masa berlaku dan belum dibayar.
  -- lock baris order supaya dua cron paralel tidak restore stok dua kali;
  -- `stock_restored = false` jadi pagar kedua (idempoten).
  for v_row in
    select o.id
    from public.orders o
    where o.payment_method = 'qris_midtrans'
      and o.qris_status = 'pending'
      and o.qris_expires_at is not null
      and o.qris_expires_at < now()
      and o.status not in ('rejected', 'cancelled')
      and o.stock_restored = false
    order by o.id
    for update of o skip locked
  loop
    -- Migration-49: stok dikembalikan ke batch asal (kalau ada), atau ke
    -- categories.stock kalau pesanan itu bukan batch.
    perform public.restore_order_stock(v_row.id);

    -- Status dibikin 'cancelled' (bukan 'rejected'): order ini memang tidak
    -- pernah dibayar, bukan ditolak penjual. Qris_status='expired' yang
    -- membuat admin_list_orders tetap menyembunyikannya dari antrian produksi.
    update public.orders
       set qris_status    = 'expired',
           status         = 'cancelled',
           stock_restored = true,
           updated_at     = now()
     where id = v_row.id;

    v_restored := v_restored + 1;
  end loop;

  return v_restored;
end;
$function$;


-- ---------------------------------------------------------------------------
-- 9. Grant + komentar
-- ---------------------------------------------------------------------------
-- Fungsi baru secara default boleh dipanggil PUBLIK. Dua fungsi di bawah
-- menyentuh stok, jadi harus ditutup untuk publik — kalau tidak, pembeli bisa
-- memanggil restore_order_stock dengan id pesanan sendiri.
revoke execute on function public.restore_order_stock(bigint) from public, anon, authenticated;
revoke execute on function public.consume_order_stock(bigint) from public, anon, authenticated;
grant execute on function public.restore_order_stock(bigint) to service_role;
grant execute on function public.consume_order_stock(bigint) to service_role;

grant execute on function public.public_po_pickup_dates() to anon, authenticated, service_role;
grant execute on function public.public_po_batch_for_date(date) to anon, authenticated, service_role;

grant execute on function public.admin_list_po_batches() to authenticated, service_role;
grant execute on function public.admin_save_po_batch(jsonb) to authenticated, service_role;
grant execute on function public.admin_delete_po_batch(bigint) to authenticated, service_role;

grant execute on function public.create_order(text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, jsonb, jsonb, uuid, bigint, date) to anon, authenticated, service_role;

comment on function public.create_order(text, text, text, text, text, text, text, text, text, double precision, double precision, text, text, text, text, jsonb, jsonb, uuid, bigint, date) is
  'RPC buyer: buat pesanan. Nama + phone wajib. Email & Instagram OPTIONAL. '
  'Zone validation lewat tabel delivery_zones. Prefix kode pesanan RK-. '
  'Migration-49: opsional p_po_batch_id + p_pickup_date. Kalau p_po_batch_id '
  'NULL, stok dipotong dari categories.stock seperti sebelumnya. Method '
  'pengambilan tambahan: courier (ongkir tanggung pembeli, tanpa alamat).';

comment on function public.admin_update_order_status(bigint, text, text) is
  'Ubah status pesanan. Migration-49: stok dikembalikan ke batch asal, bukan '
  'ke store_settings.total_stock yang sudah tidak ada.';

comment on function public.admin_save_po_batch(jsonb) is
  'Buat atau ubah batch PO beserta stok per jenis menu.';
