-- ============================================================================
-- MIGRASI 19 — Fix orders.payment_method check constraint
-- ----------------------------------------------------------------------------
-- Sebelumnya CHECK cuma allow 'transfer'. Migration-18 gak update constraint
-- ini (cuma dokumentasi doang), jadi order dgn payment_method = 'qris_midtrans'
-- selalu ditolak dengan error 23514 "violates check constraint".
--
-- Sekarang allow: 'transfer' | 'qris_static' | 'qris_midtrans'.
-- ============================================================================

alter table public.orders drop constraint if exists orders_payment_method_check;

alter table public.orders
  add constraint orders_payment_method_check
  check (payment_method = any (array['transfer', 'qris_static', 'qris_midtrans']));