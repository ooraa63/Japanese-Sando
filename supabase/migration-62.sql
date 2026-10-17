-- ============================================================================
-- Migration 62 - Tanggal ambil yang sudah lewat tidak lagi ditawarkan
-- Dijalankan: 17-10-2026, atas permintaan Steven (screenshot "tanggal sudah
-- lewat tapi masih bisa pilih, seharusnya sudah hilang").
--
-- MASALAH
--   Dua fungsi publik yang mengisi daftar tanggal di langkah 1 /order sudah
--   menyaring batch lewat `open_at`/`close_at`, tapi TIDAK pernah
--   membandingkan `pickup_date` dengan hari ini. Batch 22 (buka 15-10,
--   tutup 17-10, ambil 16-10) karena itu tetap menampilkan "Jumat, 16
--   Oktober 2026" pada tanggal 17 Oktober, padahal 16-10 sudah lewat.
--
--   Akibatnya pembeli bisa memilih tanggal yang sudah lewat dan
--   `create_order` menerimanya, karena yang diawasi hanya jendela buka/tutup
--   batch, bukan tanggal pengambilannya.
--
-- PERBAIKAN
--   `b.pickup_date >= public.po_today()` ditambahkan di kedua fungsi.
--   `po_today()` (dari migration-61) memakai jam WIB, jadi "hari ini" di
--   sini sama dengan hari kalender yang dilihat pembeli di hp-nya.
--
-- CATATAN
--   Kolom `pickup_date` tetap `date`, tidak diubah jadi timestamptz.
--   Yang dibandingkan adalah TANGGAL ambil, bukan jam ambil, jadi zona waktu
--   tidak berperan di kolom ini.
--
-- DIHASILKAN OLEH: scripts/gen-migration-62.mjs (dari definisi fungsi live)
-- ============================================================================

-- public_po_pickup_dates(): tambah syarat pickup_date >= hari ini (WIB)
CREATE OR REPLACE FUNCTION public.public_po_pickup_dates()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- PENTING: sisa stok per batch harus dihitung di CTE terpisah dulu.
  -- Menulis max(sum(...)) langsung illegal ("aggregate function calls cannot
  -- be nested"), jadi dua tingkat: per batch, lalu per tanggal.
  with per_batch as (
    select b.id,
           b.pickup_date,
           coalesce(sum(s.stock), 0)::int as sisa
      from public.po_batches b
      left join public.po_batch_stock s on s.batch_id = b.id
     where b.is_active
       and public.po_today() between b.open_at and b.close_at
       and b.pickup_date >= public.po_today()
     group by b.id, b.pickup_date
  ),
  per_tanggal as (
    select pickup_date, max(sisa)::int as sisa
      from per_batch
     group by pickup_date
  )
  select jsonb_build_object(
    'ada_batch', (select count(*) > 0 from per_batch),
    'tanggal', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'pickup_date', pickup_date,
          'sisa', sisa
        )
        order by pickup_date
      )
      from per_tanggal
      where sisa > 0
    ), '[]'::jsonb)
  );
$function$;

-- public_po_batch_for_date(): tambah syarat pickup_date >= hari ini (WIB)
CREATE OR REPLACE FUNCTION public.public_po_batch_for_date(p_pickup_date date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with per_batch as (
    select b.id,
           b.pickup_date,
           coalesce(sum(s.stock), 0)::int as sisa
      from public.po_batches b
      left join public.po_batch_stock s on s.batch_id = b.id
     where b.is_active
       and public.po_today() between b.open_at and b.close_at
       and b.pickup_date >= public.po_today()
       and b.pickup_date = p_pickup_date
     group by b.id, b.pickup_date
  ),
  terpilih as (
    select id, pickup_date, sisa
      from per_batch
     order by sisa asc, id asc
     limit 1
  )
  select coalesce((
    select jsonb_build_object(
      'batch_id', t.id,
      'pickup_date', t.pickup_date,
      'sisa', t.sisa,
      'stok', coalesce((
        select jsonb_object_agg(
          s.category_id::text,
          jsonb_build_object('nama', c.name_id, 'sisa', s.stock)
        )
        from public.po_batch_stock s
        join public.categories c on c.id = s.category_id
       where s.batch_id = t.id
      ), '{}'::jsonb),
      -- Migration-52: daftar bundle yang boleh dipesan untuk batch ini.
      -- Null = semua bundle aktif (mode lama), jadi sisi pembeli tidak
      -- memfilter apa pun.
      'bundles', (
        select jsonb_agg(
          jsonb_build_object(
            'bundle_id', pb.bundle_id,
            'price', coalesce(pb.price, bu.price)
          ) order by bu.sort_order, bu.id
        )
        from public.po_batch_bundles pb
        join public.bundles bu on bu.id = pb.bundle_id
       where pb.batch_id = t.id
         and pb.is_active
         and bu.is_active
      ),
      -- Migration-53: daftar rasa yang boleh ditampilkan untuk batch ini.
      -- NULL = semua rasa aktif (mode lama), jadi sisi pembeli tidak memfilter.
      'flavors', (
        select jsonb_agg(pf.flavor_id order by pf.flavor_id)
          from public.po_batch_flavors pf
         where pf.batch_id = t.id
           and pf.is_active
      )
    )
    from terpilih t
  ), 'null'::jsonb);
$function$;

-- grants tidak diubah: CREATE OR REPLACE mempertahankan ACL yang sudah ada.
-- Verifikasi setelah jalan:
--   select public.public_po_pickup_dates();
