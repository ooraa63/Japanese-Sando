-- ============================================================================
-- Migration 63 - track_by_code tidak lagi mengembalikan paket dua kali
-- Dijalankan: 17-10-2026, ketemu saat verifying tampilan pesanan atas laporan
-- Steven soal "(Sando 2 #1)".
--
-- MASALAH
--   Bagian `bundles` di `track_by_code()` menyeleksi dari `bundle_items`
--   tanpa `group by`, jadi satu paket dua slot ("Sando 2") menghasilkan DUA
--   objek JSON yang identik. Di halaman lacak pesanan (dan halaman sukses
--   yang memakai RPC ini) paketnya tampil dua kali.
--
--   Nama slotnya juga diambil dari `order_items.flavor_name`, yang menyimpan
--   sufiks internal "(Sando 2 #1)". `public_invoice()` sejak awal mengambil
--   nama bersih dari tabel `flavors`, jadi dua RPC itu tidak konsisten.
--
-- PERBAIKAN
--   1. Satu objek JSON per paket (pakai `select distinct bundle_id`).
--   2. Nama slot dari `flavors.name_id` / `name_en`.
--   3. `bundle_name` ikut bahasa pesanan, sama seperti `public_invoice()`.
--
-- CATATAN
--   `flat_items` SENGAJA dibiarkan apa adanya, termasuk sufiks slotnya.
--   Sisi frontend membersihkan sufiks itu sendiri di `src/lib/order-items.ts`
--   supaya pesanan lama (yang sudah tersimpan dengan sufiks) juga ikut bersih
--   tanpa perlu menulis ulang data.
--
-- DIHASILKAN OLEH: scripts/gen-migration-63.mjs (dari definisi fungsi live)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.track_by_code(p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order_id int := 0;
  v_items jsonb;
  v_bundles jsonb;
  v_result jsonb;
begin
  -- Tanpa kode atau tanpa telepon, tidak ada yang boleh lolos.
  if nullif(trim(coalesce(p_code, '')), '') is null
     or nullif(trim(coalesce(p_phone, '')), '') is null then
    return null;
  end if;

  -- Cari order yang kode DAN nomor teleponnya cocok.
  -- `phone_normalized` dipakai kalau ada; order lama yang kolomnya kosong
  -- fallback ke normalisasi kolom `phone` supaya tetap bisa dilacak.
  select o.id into v_order_id
  from public.orders o
  where upper(o.order_code) = upper(trim(p_code))
    and coalesce(nullif(o.phone_normalized, ''), public.normalize_phone(o.phone))
        = public.normalize_phone(p_phone)
  limit 1;

  if v_order_id is null or v_order_id = 0 then
    return null;
  end if;

  -- Pakai CTE supaya v_order_id visible di subquery.
  return (
    with ord as (
      select * from public.orders where id = v_order_id
    )
    select jsonb_build_object(
      'order_code', ord.order_code,
      'status', ord.status,
      'delivery_method', ord.delivery_method,
      'delivery_zone', ord.delivery_zone,
      'subtotal', ord.subtotal,
      'delivery_fee', ord.delivery_fee,
      'total', ord.total_price,
      'item_count', ord.item_count,
      'language', ord.language,
      'created_at', ord.created_at,
      'updated_at', ord.updated_at,
      'note', ord.note,
      'flat_items', (
        select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        from (
          select flavor_name, quantity, unit_price, line_total
          from public.order_items
          where order_id = ord.id
          order by id
        ) t
      ),
      'bundles', (
        -- Migration-63: satu objek JSON per PAKET, bukan satu per slot, dan
        -- nama slot diambil dari tabel `flavors` supaya sufiks internal
        -- "(Sando 2 #1)" tidak ikut terbawa ke pembeli. Lihat header file.
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'bundle_id', bu.id,
            'bundle_name', case when ord.language = 'en' then bu.name_en else bu.name_id end,
            'slots', (
              select coalesce(jsonb_agg(
                jsonb_build_object(
                  'slot', bi2.slot,
                  'flavor_id', bi2.flavor_id,
                  'flavor_name', case when ord.language = 'en' then f.name_en else f.name_id end
                ) order by bi2.slot
              ), '[]'::jsonb)
              from public.bundle_items bi2
              join public.flavors f on f.id = bi2.flavor_id
              where bi2.order_id = ord.id and bi2.bundle_id = bu.id
            )
          ) as b
          from (
            select distinct bundle_id from public.bundle_items where order_id = ord.id
          ) bi
          join public.bundles bu on bu.id = bi.bundle_id
          order by bu.id
        ) sub
      )
    )
    from ord
  );
end;
$function$;

-- grants tidak berubah: CREATE OR REPLACE mempertahankan ACL.
