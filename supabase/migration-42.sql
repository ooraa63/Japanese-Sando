-- =============================================================================
--  MIGRASI 42 -- Lacak pesanan wajib kode + nomor telepon
--
--  Permintaan Steven (11-10-2026): halaman "Pesanan" bukan lagi account,
--  tapi track order sederhana. Pembeli masukkan KODE PESANAN dan NOMOR
--  TELEPON, lalu lihat status pesanannya.
--
--  Kenapa harus dua-duanya, bukan kode saja?
--  `track_by_code(p_code)` versi lama mengembalikan seluruh isi pesanan
--  (status, item, total, catatan) untuk siapa saja yang tahu kodenya. Kode
--  formatnya pendek dan mudah ditebak atau diteruskan, jadi data pesanan orang
--  bisa dibaca orang lain. Menambah nomor telepon sebagai identitas kedua
--  menutup celah itu tanpa perlu akun.
--
--  Perbandingan memakai `public.normalize_phone` supaya pembeli boleh mengetik
--  "0812-3456-7890", "+62 812 3456 7890", atau "628123456789" dan tetap cocok
--  dengan yang tersimpan.
--
--  Catatan deployment: migrasi ini menghapus fungsi 1-argumen. Terapkan
--  migrasi ini SEBELUM deploy kode baru; selama jendela itu halaman track
--  lama akan jatuh ke pesan "tidak ditemukan" (bukan error 500), karena
--  TrackForm menganggap `rpcError` sama dengan pesanan tidak ada.
-- =============================================================================


-- 1. Buang versi lama (kode saja). Tidak ada pemanggil lain di repo:
--    `src/components/customer/TrackForm.tsx` satu-satunya.
drop function if exists public.track_by_code(text);


-- 2. Versi baru: kode + nomor telepon harus dua-duanya cocok.
create or replace function public.track_by_code(p_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
        select coalesce(jsonb_agg(to_jsonb(sub.b)), '[]'::jsonb)
        from (
          select jsonb_build_object(
            'bundle_id', bi.bundle_id,
            'bundle_name', b.name_id,
            'slots', (
              select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb)
              from (
                select bi2.slot as slot, oi2.flavor_name, bi2.flavor_id
                from public.bundle_items bi2
                join public.order_items oi2 on oi2.order_id = bi2.order_id and oi2.flavor_id = bi2.flavor_id
                where bi2.order_id = ord.id and bi2.bundle_id = bi.bundle_id
                order by bi2.slot
              ) s
            )
          ) as b
          from public.bundle_items bi
          join public.bundles b on b.id = bi.bundle_id
          where bi.order_id = ord.id
          order by bi.bundle_id
        ) sub
      )
    )
    from ord
  );
end;
$$;

grant execute on function public.track_by_code(text, text) to anon, authenticated;


-- 3. Index gabungan. Query sekarang selalu mencocokkan kode + telepon, jadi
--    index satu kolom `order_code` saja (dibuat di migrasi 12) sudah cukup --
--    PostgREST memfilter kode lebih dulu dan hanya sedikit baris yang lolos.
--    Tambah index pada `phone_normalized` supaya cek nomor cepat juga.
create index if not exists orders_phone_normalized_idx
  on public.orders (phone_normalized);


-- =============================================================================
--  Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');