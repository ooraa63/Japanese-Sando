-- ============================================================================
-- MIGRATION 31 — Customer list: dedupe by (customer_email, phone_normalized)
-- ----------------------------------------------------------------------------
-- Sebelumnya admin_list_customers() nge-return 1 row per order. Kalau customer
-- yang sama pesan 3x dengan email + HP sama, admin lihat 3 row yang isinya
-- identik kecuali order_code & created_at. Steven mau cukup 1 row per
-- kombinasi (email, phone_normalized) — order_count & total_spent di-aggregate.
--
-- Kalau email NULL (guest checkout), tetep di-group by phone aja — biar gak
-- nge-group semua guest tanpa email jadi 1 row.
--
-- Catatan: kalau customer pesan tanpa email tapi dengan phone X, dan customer
-- lain pesan tanpa email tapi dengan phone yang sama, mereka tetep jadi 1
-- row (kalau keduanya NULL email, NULL email = NULL email, jadi group by
-- coalesce jadi '—' atau 'unknown').
-- ============================================================================

create or replace function public.admin_list_customers()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

comment on function public.admin_list_customers() is
  'List customer unik (dedupe by email + phone_normalized). order_count &
   total_spent di-aggregate. last_* fields diambil dari order paling baru.
   Migration-31.';