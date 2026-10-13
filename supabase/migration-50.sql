-- Migration-50 — tampilkan tanggal ambil & batch di daftar pesanan admin.
--
-- Migration-49 sudah menambah kolom `orders.pickup_date` + `orders.po_batch_id`,
-- tapi `admin_list_orders` tidak pernahsalinnya ke JSON, jadi penjual tidak
-- bisa tahu pesanan itu untuk batch tanggal berapa. Tanpa ini, begitu Steven
-- mulai memakai batch, dia tidak punya cara melihat tanggal ambil dari
-- halaman pesanan.
--
-- Hanya menambah tiga key ke jsonb_build_object. Tidak mengubah filter,
-- urutan, RLS, atau granted role apa pun.

create or replace function public.admin_list_orders(
  p_status text default null,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Baru migration-49: kolom ini ada, tapi RPC lama tidak pernahsalinnya ke
  -- JSON sehingga penjual tidak bisa melihat tanggal ambil pesanan.
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

comment on function public.admin_list_orders(text, text, integer, integer) is
  'Migration-50: jsonb pesanan sekarang ikut membawa delivery_zone, '
  'po_batch_id, dan pickup_date supaya penjual bisa melihat tanggal ambil.';

grant execute on function public.admin_list_orders(text, text, integer, integer) to authenticated, service_role;