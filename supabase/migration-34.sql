-- ============================================================================
-- MIGRATION 34 — QRIS auto-expire (cron) + harga coret untuk bundle
-- ============================================================================
-- Masalah yang diperbaiki:
--   1. Order QRIS yang dibuat tapi pembeli menutup modal / tidak bayar
--      sebelumnya menggantung selamanya di qris_status='pending' dan tetap
--      terhitung di tabel mutasi. Setelah 5 menit Midtrans otomatis
--      invalidate QR-nya, jadi order ini HARUS ikut jadi 'expired' dan
--      kembalikan stok kategori.
--   2. Bundle belum punya kolom "harga sebelum diskon" sehingga UI tidak
--      bisa menampilkan harga asal dicoret.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Bundle: harga coret (compare_price)
-- ---------------------------------------------------------------------------
alter table public.bundles
  add column if not exists compare_price integer;

comment on column public.bundles.compare_price is
  'Harga sebelum diskon (opsional). Kalau diisi dan lebih besar dari price, '
  'UI menampilkan price dicoret. NULL = tidak ada harga coret.';


-- ---------------------------------------------------------------------------
-- 2. RPC: expire_stale_qris_orders()
--    Dipanggil Vercel Cron tiap menit.
--    - Order QRIS yang qris_expires_at sudah lewat & masih 'pending'
--      -> qris_status='expired', status='cancelled'
--    - Stok kategori dikembalikan (stock_restored flag)
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_qris_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $body$
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
    -- Kembalikan stok PER KATEGORI — persis kebalikan dari create_order
    -- (yang mengurangi categories.stock). Order_items quantity = pcs yang
    -- pernah dikurangi: item biasa quantity=n, tiap slot bundle quantity=1.
    for v_cat_id, v_cat_pcs in
      select f.category_id, sum(oi.quantity)::int
      from public.order_items oi
      join public.flavors f on f.id = oi.flavor_id
      where oi.order_id = v_row.id
        and f.category_id is not null
      group by f.category_id
    loop
      update public.categories c
         set stock = c.stock + v_cat_pcs
       where c.id = v_cat_id
         and c.stock_enabled;
    end loop;

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
$body$;

comment on function public.expire_stale_qris_orders() is
  'Dipanggil Vercel Cron tiap menit. Menandai order QRIS yang lewat masa '
  'berlaku jadi expired+cancelled dan mengembalikan stok kategori. '
  'Return jumlah order yang di-expire.';

-- Hanya service_role (Vercel Cron pakai service key) + postgres yang boleh
-- memanggil. Sengaja TIDAK diberi ke anon/authenticated.
revoke execute on function public.expire_stale_qris_orders() from public, anon, authenticated;
grant execute on function public.expire_stale_qris_orders() to service_role;


-- ---------------------------------------------------------------------------
-- 3. Migrasi data: order QRIS lama yang sudah lewat masa berlaku & masih
--    pending -> langsung diproses sekarang juga (biar tidak nunggu cron pertama).
--    Fungsi aman dipanggil berulang (stock_restored jadi pagar).
-- ---------------------------------------------------------------------------
select public.expire_stale_qris_orders();


-- ---------------------------------------------------------------------------
-- 4. Index pendukung: cari order QRIS pending yang lewat expiry.
-- ---------------------------------------------------------------------------
create index if not exists orders_qris_expiry_idx
  on public.orders (qris_expires_at)
  where payment_method = 'qris_midtrans' and qris_status = 'pending';