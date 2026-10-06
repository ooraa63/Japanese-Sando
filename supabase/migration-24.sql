-- ============================================================================
-- MIGRASI 24 — Voucher system untuk customer
-- ----------------------------------------------------------------------------
-- Tabel `vouchers` menyimpan voucher yang ditampilkan di halaman /account
-- masing-masing customer. Voucher bisa untuk 1 customer spesifik atau untuk
-- semua customer (customer_id NULL).
--
-- Tipe voucher (type):
--   - percent      → diskon % (value: {"percent": 20})
--   - amount       → diskon Rp tetap (value: {"amount": 5000})
--   - free_shipping → ongkir gratis (value: {})
--   - free_item    → gratis 1 item (value: {"flavor_id": 3, "qty": 1})
--
-- Admin buat voucher via SQL / Supabase dashboard. Saat ini UI redeem
-- belum diimplementasi (voucher hanya dilihat saja di account page).
-- Tabel sudah siap untuk redemption di kemudian hari (used_at, order_id).
-- ============================================================================

create table if not exists public.vouchers (
  id          bigserial primary key,
  code        text        not null unique,
  customer_id uuid        references auth.users(id) on delete cascade,
  type        text        not null check (type in ('percent', 'amount', 'free_shipping', 'free_item')),
  value       jsonb       not null default '{}'::jsonb,
  label_id    text        not null,
  label_en    text        not null,
  expires_at  timestamptz,
  is_active   boolean     not null default true,
  used_at     timestamptz,
  order_id    bigint      references public.orders(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists vouchers_customer_id_idx
  on public.vouchers (customer_id)
  where customer_id is not null;

create index if not exists vouchers_active_idx
  on public.vouchers (is_active, expires_at);

comment on table public.vouchers is
  'Voucher yang ditampilkan di /account customer. Bisa per-customer atau untuk semua.';

-- ---------------------------------------------------------------------------
-- RPC publik `list_my_vouchers()` — return grouped vouchers untuk user
-- yang sedang login (auth.uid()).
--
-- Output jsonb:
--   { "active": [...], "used": [...], "expired": [...] }
-- ---------------------------------------------------------------------------
create or replace function public.list_my_vouchers()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with mine as (
    select id, code, type, value, label_id, label_en, expires_at, used_at, created_at
    from public.vouchers
    where is_active = true
      and (customer_id = auth.uid() or customer_id is null)
      and (expires_at is null or expires_at > now())
      and used_at is null
    order by created_at desc
    limit 50
  ),
  used as (
    select id, code, type, value, label_id, label_en, expires_at, used_at, created_at
    from public.vouchers
    where used_at is not null
      and (customer_id = auth.uid() or customer_id is null)
    order by used_at desc
    limit 20
  ),
  expired as (
    select id, code, type, value, label_id, label_en, expires_at, used_at, created_at
    from public.vouchers
    where expires_at is not null
      and expires_at <= now()
      and used_at is null
      and (customer_id = auth.uid() or customer_id is null)
    order by expires_at desc
    limit 20
  )
  select jsonb_build_object(
    'active', coalesce((select jsonb_agg(to_jsonb(mine)) from mine), '[]'::jsonb),
    'used',   coalesce((select jsonb_agg(to_jsonb(used))  from used),  '[]'::jsonb),
    'expired',coalesce((select jsonb_agg(to_jsonb(expired)) from expired),'[]'::jsonb)
  );
$$;

grant execute on function public.list_my_vouchers() to authenticated;

comment on function public.list_my_vouchers()
  is 'Voucher untuk customer yang sedang login, dikelompokkan active/used/expired.';