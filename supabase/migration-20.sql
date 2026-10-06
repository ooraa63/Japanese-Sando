-- ============================================================================
-- MIGRASI 20 — Halaman Mutasi Penjual
-- ----------------------------------------------------------------------------
-- Menambahkan RPC `admin_list_mutasi` yang mengembalikan:
--   1. Ringkasan total pendapatan + jumlah pesanan (filter: date range, rasa)
--   2. Daftar transaksi (filter: date range, rasa via order_items.flavor_name)
--
-- Filter "per-rasa" dilakukan via join ke order_items (left join untuk
-- menghindari exclude pesanan dengan item bundle tanpa flavor_name).
--
-- Status pesanan yang dihitung sebagai "pendapatan":
--   - accepted, ready, delivered (sudah jadi revenue, stok sudah dipakai)
--   - rejected & cancelled TIDAK dihitung sebagai revenue
--   - pending TIDAK dihitung (belum dikonfirmasi penjual)
-- ============================================================================

create or replace function public.admin_list_mutasi(
  p_from_date  date    default null,    -- inclusive (UTC date)
  p_to_date    date    default null,    -- inclusive (UTC date)
  p_flavor_id  integer default null,    -- null = semua rasa
  p_search     text    default null,
  p_limit      integer default 50,
  p_offset     integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  -- 1. Ringkasan revenue (semua pesanan yang dihitung sebagai revenue,
  --    tidak ter-filter pagination/offset)
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
    and (
      p_flavor_id is null
      or exists (
        select 1 from public.order_items oi2
        where oi2.order_id = o.id
          and oi2.flavor_id = p_flavor_id
      )
    );

  -- Revenue hari ini (pesanan status accepted/ready/delivered, created hari ini UTC)
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
$$;

comment on function public.admin_list_mutasi(date, date, integer, text, integer, integer)
  is 'Mutasi/halaman keuangan penjual: summary revenue + daftar transaksi dgn filter tanggal & rasa.';