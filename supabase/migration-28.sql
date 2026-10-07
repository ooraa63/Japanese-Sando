-- ============================================================================
-- MIGRASI 28 — Hide QRIS unpaid dari order list seller
-- ----------------------------------------------------------------------------
-- Business rule:
--   * QRIS (qris_midtrans) → order hanya masuk ke dashboard penjual
--     SETELAH customer bayar (qris_status = 'paid'). Saat paid, status
--     order otomatis jadi 'accepted' (lihat `set_order_qris_status`).
--   * Transfer → order langsung masuk ke dashboard dengan status 'pending',
--     penjual yang accept/reject manual.
--
-- Sebelumnya `admin_list_orders` menampilkan semua order termasuk QRIS
-- yang belum dibayar (status='pending' + qris_status='pending'). Itu
-- bikin spam di dashboard untuk order yang sebenarnya belum final.
-- Sekarang filter: order hanya muncul kalau BUKAN QRIS pending.
-- ============================================================================

create or replace function public.admin_list_orders(
  p_status  text default null,
  p_search  text default null,
  p_limit   integer default 50,
  p_offset  integer default 0
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.admin_list_orders(text, text, integer, integer)
  to authenticated;

comment on function public.admin_list_orders(text, text, integer, integer)
  is 'Admin: daftar pesanan (filter status + search + pagination). QRIS Midtrans yang belum dibayar disembunyikan.';


-- Index untuk filter payment_method+qris_status (supaya filter di atas cepat
-- saat tabel orders besar).
create index if not exists orders_payment_qris_status_idx
  on public.orders (payment_method, qris_status, created_at desc);


-- 2. admin_dashboard_stats: pending_orders hanya hitung order yang BUTUH
--    aksi penjual (= transfer belum di-accept). QRIS yang belum dibayar
--    tidak masuk hitungan pending karena itu tanggung jawab customer.
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

  -- pending = transfer saja. QRIS unpaid tidak masuk karena belum masuk
  --          ke antrian produksi (lihat aturan di admin_list_orders).
  select count(*) into v_pending
    from public.orders
    where status = 'pending'
      and payment_method <> 'qris_midtrans';

  select count(*) into v_accepted from public.orders where status = 'accepted';
  select count(*) into v_ready    from public.orders where status = 'ready';
  -- Total = jumlah order yang masuk antrian (QRIS unpaid tidak dihitung).
  select count(*) into v_total
    from public.orders
    where not (payment_method = 'qris_midtrans' and qris_status is distinct from 'paid');

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

grant execute on function public.admin_dashboard_stats() to authenticated;