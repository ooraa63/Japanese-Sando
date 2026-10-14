-- =============================================================================
--  MIGRASI 57 --
--  "Pesan Kurir" ditolak database: check constraint lupa menambah 'courier'
-- =============================================================================
--
--  Steven 15-10-2026 (dilaporkan dari produksi, dengan bukti upload):
--
--    "Saat ingin preorder dia error, untuk yang transfer"
--
--    new row for relation "orders" violates check constraint
--    "orders_delivery_method_check"
--
--  Verified ke database produksi (15-10-2026):
--
--    orders_delivery_method_check
--      CHECK ((delivery_method = ANY (ARRAY['pickup','delivery'])))
--    orders_delivery_zone_check
--      CHECK ((delivery_zone = ANY (ARRAY['pickup','vihara','uvers','other'])))
--
--  AKAR MASALAH
--
--  Metode pengambilan ketiga, "Pesan Kurir" (MEMORY/decisions.md D73:
--  pembeli yang memesan armada sendiri, ongkir ditanggung pembeli, tanpa
--  alamat dan tanpa zona), sudah ADA di mana-mana kecuali di constraint:
--
--    src/lib/types.ts                 DeliveryMethod = pickup | delivery | courier
--    src/lib/utils.ts                 deliveryLabel() punya label "Pesan Kurir"
--    src/lib/i18n/id.ts + en.ts       judul + deskripsi pilihan ketiga
--    src/app/account/qris-actions.ts  zod: z.enum(["pickup","delivery","courier"])
--    create_order                     validasi: if p_delivery_method not in
--                                     ('pickup','delivery','courier') -> raise
--    src/app/account/AccountClient.tsx / SuccessClient.tsx  tampilan label + ikon
--    src/components/customer/OrderFlow.tsx  kartu pilihan ketiga
--
--  Yang TIDAK pernah ikut diperbarui adalah CHECK constraint di tabelnya.
--  Jadi alurnya: validatePayment() lolos -> create_order lolos ->
--  INSERT kena `orders_delivery_method_check` -> pembeli melihat pesan error
--  database mentah yang tidak ada artinya.
--
-- _create_order juga menulis p_delivery_zone apa adanya (baris INSERT-nya),
--  dan untuk 'courier' form mengirim deliveryZone = "courier". Jadi constraint
--  kedua (delivery_zone) akan menolak tepat setelah yang pertama dilonggarkan
--  -- itu sebabnya KEDUA constraintdilonggarkan di sini, bukan cuma satu.
--
--  BUKAN karena 'courier' tidak boleh dipakai. Keputusan D73 dengan jelas
--  menyebutnya sebagai metode yang resmi, jadi yang salah adalah constraint-nya
--  yang tertinggal, bukan fiturnya.
--
--  Tidak menyentuh: kolom, index, RLS, grant, atau body create_order.
--  Semua baris lama tetap valid karena isinya 'pickup'.

-- ---------------------------------------------------------------- constraint 1
alter table public.orders
  drop constraint if exists orders_delivery_method_check;

alter table public.orders
  add constraint orders_delivery_method_check
  check (delivery_method in ('pickup', 'delivery', 'courier'));

-- ---------------------------------------------------------------- constraint 2
alter table public.orders
  drop constraint if exists orders_delivery_zone_check;

alter table public.orders
  add constraint orders_delivery_zone_check
  check (delivery_zone in ('pickup', 'vihara', 'uvers', 'other', 'courier'));

-- Catatan buat pembaca berikutnya: daftar di atas adalah daftar LENGKAP.
-- Kalau menambah metode atau zona baru, constraint TABEL harus ikut
-- ditambah -- validasi di dalam create_order saja tidak cukup, karena INSERT
-- tetap ditolak constraint tabel sebelum logika fungsi sempat berjalan.

comment on constraint orders_delivery_method_check on public.orders is
  'Migration-57: tambah courier (D73, Pesan Kurir). Daftar ini harus sama '
  'dengan validasi p_delivery_method di create_order.';

comment on constraint orders_delivery_zone_check on public.orders is
  'Migration-57: tambah courier, karena form mengirim deliveryZone = courier '
  'saat metode ambilannya Pesan Kurir.';