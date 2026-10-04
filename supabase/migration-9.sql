-- ============================================================================
-- 9. RPC publik untuk halaman invoice pembeli
-- ----------------------------------------------------------------------------
-- Sebelumnya invoice pembeli ditampilkan dari snapshot sessionStorage di
-- /order/success/[code]. Kalau pembeli refresh halaman (atau menutup tab),
-- data hilang dan halaman cuma menampilkan kode pesanan.
--
-- RPC `public_invoice(p_code)` ini memungkinkan halaman sukses mencari data
-- pesanan publik hanya dari kode pesanan. Karena kode pesanan itu:
--   1. Panjang dan acak (urutan sequence `JS-YYMMDD-NNN`),
--   2. Hanya ditampilkan kepada pembeli yang baru saja pesan,
-- boleh dikembalikan ke publik tanpa syarat tambahan.
--
-- RPC `security definer` + `set search_path = public` supaya hanya membaca
-- dari schema public dan bisa dipanggil tanpa login.
-- ============================================================================

create or replace function public.public_invoice(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_items jsonb;
begin
  select * into v_order
  from public.orders
  where upper(order_code) = upper(trim(coalesce(p_code, '')))
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'flavor_name', flavor_name,
    'quantity', quantity,
    'unit_price', unit_price,
    'line_total', line_total
  ) order by id), '[]'::jsonb)
  into v_items
  from public.order_items where order_id = v_order.id;

  return jsonb_build_object(
    'order_code', v_order.order_code,
    'customer_name', v_order.customer_name,
    'phone', v_order.phone,
    'address', v_order.address,
    'note', v_order.note,
    'payment_method', v_order.payment_method,
    'transfer_method', v_order.transfer_method,
    'delivery_method', v_order.delivery_method,
    'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee,
    'saving', 0,
    'total', v_order.total_price,
    'item_count', v_order.item_count,
    'status', v_order.status,
    'language', v_order.language,
    'created_at', v_order.created_at,
    'flat_items', v_items
  );
end;
$$;

-- Boleh dipanggil siapa saja (anon & authenticated) supaya halaman
-- /order/success/[code] bisa menarik invoice tanpa login.
grant execute on function public.public_invoice(text) to anon, authenticated;