-- Migration-51 — halaman detail per batch: filter pesanan/mutasi/pelanggan
-- hanya untuk satu batch pre-order.
--
-- Latar: Steven (14-10-2026) — "setelah kita buat batch kita bisa click itu
-- lalu nanti di dalamnya ada beberapa sidebar yang sama seperti mutasi, stok,
-- pesanan, pelanggan namun khusus untuk batch itu aja".
--
-- Yang ditambahkan di sini:
--   1. Index `orders (po_batch_id)`. Tanpa itu, setiap kali Steven membuka
--      satu batch, Postgres melakukan full scan di tabel pesanan.
--   2. Parameter `p_po_batch_id` pada tiga RPC admin yang sudah ada. Param
--      ditaruh di AKHIR daftar dan diberi DEFAULT NULL, jadi semua pemanggil
--      lama (halaman /admin/orders, /admin/sales, /admin/customers) tetap
--      jalan tanpa perubahan kode — NULL berarti "semua batch", persis
--      perilaku sekarang.
--   3. RPC baru `admin_list_po_batch_detail(p_batch_id)` untuk header batch
--      + rincian stok per jenis menu.
--
-- Catatan menghitung "terjual": dipakai semantik yang SAMA dengan kartu
-- batch di `admin_list_po_batches`, yaitu semua status kecuali rejected dan
-- cancelled. Pesanan yang ditolak/dibatalkan mengembalikan stoknya, jadi
-- menghitungnya sebagai terjual akan membuat angkanya tidak cocok dengan sisa
-- stok yang tampil. `admin_list_mutasi` memakai semantik lain (hanya
-- accepted/ready/delivered) — perbedaan itu memang disengaja sejak awal,
-- bukan bug.

-- ---------------------------------------------------------------------------
-- 1. Index untuk pengelompokan per batch
-- ---------------------------------------------------------------------------
create index if not exists orders_po_batch_idx
  on public.orders (po_batch_id, created_at desc)
  where po_batch_id is not null;

comment on index public.orders_po_batch_idx is
  'Migration-51: Untuk query halaman detail batch. Partial karena hanya '
  'batch yang punya batch_id yang perlu dikelompokkan.';

-- ---------------------------------------------------------------------------
-- 2. admin_list_orders + filter batch
-- ---------------------------------------------------------------------------
-- PENTING: `create or replace function` dengan JUMLAH ARGUMEN BERBEDA tidak
-- mengganti fungsi lama — Postgres membuat OVERLOAD baru. Kalau overload lama
-- dibiarkan, panggilan 4 argumen jadi ambigu ("function ... is not unique")
-- karena semua parameter baru punya DEFAULT. Jadi versi lama harus DI-DROP
-- lebih dulu, bukan cuma dibiarkan.
drop function if exists public.admin_list_orders(text, text, integer, integer);

create or replace function public.admin_list_orders(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_po_batch_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    with filtered as (
      select o.*
      from public.orders o
      where (p_status is null or o.status = p_status)
        -- Sembunyikan order QRIS Midtrans yang belum dibayar dari dashboard
        -- penjual. Setelah qris_status berubah (paid/expired/failed/cancelled)
        -- dan status order auto-transisi ke accepted/rejected, barulah order
        -- terlihat di sini.
        and not (
          o.payment_method = 'qris_midtrans'
          and o.qris_status is distinct from 'paid'
        )
        -- NULL = semua batch (perilaku lama). Diisi = hanya batch itu.
        and (p_po_batch_id is null or o.po_batch_id = p_po_batch_id)
        and (
          p_search is null
          or btrim(p_search) = ''
          or o.order_code ilike '%' || p_search || '%'
          or o.customer_name ilike '%' || p_search || '%'
          or o.phone ilike '%' || p_search || '%'
        )
      order by o.created_at desc
      limit greatest(1, least(p_limit, 200))
      offset greatest(0, p_offset)
    )
    select jsonb_build_object(
      'orders', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'order_code', f.order_code,
            'customer_name', f.customer_name,
            'phone', f.phone,
            'delivery_method', f.delivery_method,
            'delivery_zone', f.delivery_zone,
            'address', f.address,
            'payment_method', f.payment_method,
            'transfer_method', f.transfer_method,
            'payment_proof_path', f.payment_proof_path,
            'qris_status', f.qris_status,
            'note', f.note,
            'admin_note', f.admin_note,
            'subtotal', f.subtotal,
            'delivery_fee', f.delivery_fee,
            'total_price', f.total_price,
            'item_count', f.item_count,
            'status', f.status,
            'language', f.language,
            'po_batch_id', f.po_batch_id,
            'pickup_date', f.pickup_date,
            'created_at', f.created_at,
            'updated_at', f.updated_at,
            'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                'flavor_name', oi.flavor_name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total
              ) order by oi.id)
              from public.order_items oi where oi.order_id = f.id
            ), '[]'::jsonb)
          ) order by f.created_at desc
        ) from filtered f
      ), '[]'::jsonb),
      'total', (select count(*) from filtered)
    )
  );
end;
$fn$;

comment on function public.admin_list_orders(text, text, integer, integer, bigint) is
  'Migration-51: param terakhir p_po_batch_id menyaring pesanan ke satu batch '
  'pre-order. NULL (default) = semua batch, jadi halaman /admin/orders tidak '
  'berubah.';

grant execute on function public.admin_list_orders(text, text, integer, integer, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. admin_list_mutasi + filter batch
-- ---------------------------------------------------------------------------
-- Sama seperti di atas: tanpa drop, versi 6-argumen lama akan tetap ada dan
-- panggilan lama jadi ambigu.
drop function if exists public.admin_list_mutasi(date, date, integer, text, integer, integer);

create or replace function public.admin_list_mutasi(
  p_from_date date default null,
  p_to_date date default null,
  p_flavor_id integer default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_po_batch_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_revenue_total     bigint := 0;
  v_orders_count      bigint := 0;
  v_pcs_sold          bigint := 0;
  v_revenue_today     bigint := 0;
  v_orders_today      bigint := 0;
  v_top_flavors       jsonb := '[]'::jsonb;
  v_transactions      jsonb := '[]'::jsonb;
  v_total_filtered   bigint := 0;
  v_from_ts           timestamptz;
  v_to_ts             timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Convert date range (UTC) ke timestamptz boundary.
  if p_from_date is not null then
    v_from_ts := p_from_date::timestamptz;
  end if;
  if p_to_date is not null then
    -- +1 hari supaya to_date inklusif (akhir hari = 23:59:59)
    v_to_ts := (p_to_date + interval '1 day')::timestamptz;
  end if;

  ---------------------------------------------------------------------------
  -- 1. Ringkasan revenue
  ---------------------------------------------------------------------------
  select
    coalesce(sum(o.total_price), 0)::bigint,
    count(distinct o.id)::bigint,
    coalesce(sum(oi.qty), 0)::bigint
  into v_revenue_total, v_orders_count, v_pcs_sold
  from public.orders o
  left join (
    select order_id, sum(quantity) as qty
    from public.order_items
    group by order_id
  ) oi on oi.order_id = o.id
  where o.status in ('accepted', 'ready', 'delivered')
    and (v_from_ts is null or o.created_at >= v_from_ts)
    and (v_to_ts   is null or o.created_at <  v_to_ts)
    and (p_po_batch_id is null or o.po_batch_id = p_po_batch_id)
    and (
      p_flavor_id is null
      or exists (
        select 1 from public.order_items oi2
        where oi2.order_id = o.id
          and oi2.flavor_id = p_flavor_id
      )
    );

  -- Revenue hari ini. Di halaman per-batch ini sengaja TIDAK ikut
  -- difilter batch: "hari ini" itu selalu hari ini, bukan hari ini
  -- untuk batch tertentu. Field-nya hanya dipakai kartu ringkasan global,
  -- yang tidak dirender di halaman detail batch.
  select
    coalesce(sum(o.total_price), 0)::bigint,
    count(distinct o.id)::bigint
  into v_revenue_today, v_orders_today
  from public.orders o
  where o.status in ('accepted', 'ready', 'delivered')
    and o.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    and o.created_at <  (date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC';

  -- Top 5 rasa terlaris (qty terbesar) untuk summary card
  select coalesce(jsonb_agg(
    jsonb_build_object('flavor_name', t.flavor_name, 'qty', t.qty)
    order by t.qty desc
  ), '[]'::jsonb)
  into v_top_flavors
  from (
    select f.name_id as flavor_name, sum(oi.quantity)::bigint as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.flavors f on f.id = oi.flavor_id
    where o.status in ('accepted', 'ready', 'delivered')
      and (v_from_ts is null or o.created_at >= v_from_ts)
      and (v_to_ts   is null or o.created_at <  v_to_ts)
      and (p_po_batch_id is null or o.po_batch_id = p_po_batch_id)
    group by f.name_id
    order by sum(oi.quantity) desc
    limit 5
  ) t;

  ---------------------------------------------------------------------------
  -- 2. Daftar transaksi (paginated) — include item breakdown
  ---------------------------------------------------------------------------
  with filtered as (
    select o.id, o.order_code, o.customer_name, o.phone, o.created_at,
           o.status, o.payment_method, o.total_price, o.subtotal, o.delivery_fee
    from public.orders o
    where o.status in ('accepted', 'ready', 'delivered')
      and (v_from_ts is null or o.created_at >= v_from_ts)
      and (v_to_ts   is null or o.created_at <  v_to_ts)
      and (p_po_batch_id is null or o.po_batch_id = p_po_batch_id)
      and (
        p_flavor_id is null
        or exists (
          select 1 from public.order_items oi
          where oi.order_id = o.id
            and oi.flavor_id = p_flavor_id
        )
      )
      and (
        p_search is null or btrim(p_search) = ''
        or o.order_code   ilike '%' || p_search || '%'
        or o.customer_name ilike '%' || p_search || '%'
        or o.phone         ilike '%' || p_search || '%'
      )
    order by o.created_at desc
    limit greatest(1, least(p_limit, 200))
    offset greatest(0, p_offset)
  ),
  agg as (
    select
      coalesce(jsonb_agg(
        jsonb_build_object(
          'id', f.id,
          'order_code', f.order_code,
          'customer_name', f.customer_name,
          'phone', f.phone,
          'status', f.status,
          'payment_method', f.payment_method,
          'total_price', f.total_price,
          'subtotal', f.subtotal,
          'delivery_fee', f.delivery_fee,
          'created_at', f.created_at,
          'items', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'flavor_name', oi.flavor_name,
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'line_total', oi.line_total
              ) order by oi.id
            ), '[]'::jsonb)
            from public.order_items oi
            where oi.order_id = f.id
          )
        ) order by f.created_at desc
      ), '[]'::jsonb) as txns,
      count(*)::bigint as total_count
    from filtered f
  )
  select txns, total_count into v_transactions, v_total_filtered from agg;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'revenue_total',     v_revenue_total,
      'orders_count',      v_orders_count,
      'pcs_sold',          v_pcs_sold,
      'revenue_today',     v_revenue_today,
      'orders_today',      v_orders_today,
      'top_flavors',       v_top_flavors
    ),
    'transactions', v_transactions,
    'total', v_total_filtered
  );
end;
$fn$;

comment on function public.admin_list_mutasi(date, date, integer, text, integer, integer, bigint) is
  'Migration-51: param terakhir p_po_batch_id menyaring mutasi ke satu batch '
  'pre-order. NULL (default) = semua batch.';

grant execute on function public.admin_list_mutasi(date, date, integer, text, integer, integer, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. admin_list_customers + filter batch
-- ---------------------------------------------------------------------------
-- Tanpa drop, versi tanpa-argumen lama akan tetap ada dan panggilan
-- `admin_list_customers()` jadi ambigu.
drop function if exists public.admin_list_customers();

create or replace function public.admin_list_customers(
  p_po_batch_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    with src as (
      select
        -- Pakai coalesce untuk NULL email biar tetep ke-group konsisten
        -- (Postgres: NULL = NULL tapi GROUP BY memperlakukan NULL sebagai
        -- group sendiri; coalesce -> sentinel string supaya konsisten).
        coalesce(nullif(trim(coalesce(o.customer_email, '')), ''), '__no_email__') as email_key,
        o.phone_normalized,
        min(o.created_at) as first_order_at,
        max(o.created_at) as last_order_at,
        count(*)::int as order_count,
        sum(o.total_price)::int as total_spent,
        -- Pakai data dari order paling baru sebagai "representatif"
        (array_agg(o.customer_name order by o.created_at desc))[1] as customer_name,
        (array_agg(o.customer_email order by o.created_at desc))[1] as customer_email,
        (array_agg(o.instagram order by o.created_at desc))[1] as instagram,
        (array_agg(o.phone order by o.created_at desc))[1] as phone,
        (array_agg(o.order_code order by o.created_at desc))[1] as last_order_code,
        (array_agg(o.status::text order by o.created_at desc))[1] as last_status
      from public.orders o
      where o.phone_normalized is not null
        and length(o.phone_normalized) > 0
        and (p_po_batch_id is null or o.po_batch_id = p_po_batch_id)
      group by
        coalesce(nullif(trim(coalesce(o.customer_email, '')), ''), '__no_email__'),
        o.phone_normalized
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', src.email_key || '|' || src.phone_normalized,
      'customer_name', src.customer_name,
      'customer_email', src.customer_email,
      'instagram', src.instagram,
      'phone', src.phone,
      'phone_normalized', src.phone_normalized,
      'last_order_code', src.last_order_code,
      'last_status', src.last_status,
      'first_order_at', src.first_order_at,
      'last_order_at', src.last_order_at,
      'order_count', src.order_count,
      'total_spent', src.total_spent
    ) order by src.last_order_at desc), '[]'::jsonb)
    from src
  );
end;
$fn$;

comment on function public.admin_list_customers(bigint) is
  'Migration-51: p_po_batch_id menyaring pelanggan ke mereka yang pernah '
  'pesan di satu batch pre-order, dan order_count/total_spent ikut dihitung '
  'dari batch itu saja. NULL (default) = semua pelanggan.';

grant execute on function public.admin_list_customers(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC baru: header batch + rincian stok per jenis menu
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

  -- "Terjual" dihitung dengan semantik yang sama dengan kartu batch:
  -- semua status kecuali rejected dan cancelled. Pesanan yang ditolak
  -- mengembalikan stoknya (lihat restore_order_stock), jadi menghitungnya
  -- sebagai terjual akan membuat kolom ini tidak cocok dengan sisa stok.
  --
  -- `stok_awal` TIDAK disimpan di database, jadi diturunkan:
  -- stok_awal = sisa sekarang + pcs terjual. Ini akurat karena stok awal
  -- hanya pernah turun karena penjualan dan naik lagi karena pembatalan.
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
      -- Hanya kategori yang punya baris stok ATAU pernah terjual di batch
      -- ini. Kategori lain tidak relevan untuk batch ini dan hanya menambah
      -- ruang kosong di tabel.
      where s.category_id is not null or t.category_id is not null
    ), '[]'::jsonb),
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
  'Migration-51: detail satu batch — header, rincian stok per jenis menu '
  '(sisa / terjual / stok awal), dan ringkasan pesanan. Dipakai halaman '
  '/admin/po/[id]. Raise batch_not_found kalau id tidak ada.';

grant execute on function public.admin_list_po_batch_detail(bigint) to authenticated, service_role;