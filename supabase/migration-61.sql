-- ============================================================================
-- Migration 61 - Jendela batch PO ikut zona waktu toko (WIB), bukan UTC
-- Dijalankan: 17-10-2026, atas permintaan Steven.
--
-- MASALAH
--   Session database di zona waktu UTC, sedangkan toko di Bandung (WIB,
--   UTC+7). Halaman jendela batch pakai `current_date`, yang ikut zona
--   waktu session -- jadi antara pukul 00.00 dan 07.00 WIB website masih
--   menganggap hari belum berganti:
--     * tanggal ambil yang sebenarnya sudah lewat masih bisa dipilih,
--     * batch yang mestinya sudah tertutup masih menerima pesanan,
--     * batch baru terbuka 7 jam lebih lambat dari yang dijadwalkan,
--     * angka "pesanan hari ini" di dashboard ikut bergeser.
--
-- PERBAIKAN
--   Fungsi baru `public.po_today()` = tanggal hari ini di Asia/Jakarta.
--   Semua `current_date` pada fungsi jendela batch dan laporan harian
--   diganti ke fungsi itu.
--
-- CATATAN PENTING
--   `po_batches.open_at` / `close_at` bertipe `date` (bukan timestamptz)
--   dan SENGAJA TIDAK diubah. Nilai yang tersimpan sudah dibaca Steven
--   sebagai tanggal kalender WIB, jadi mengonversinya ke jam akan membuat
--   batas batch bergeser 7 jam ke belakang. Hanya sisi perbandingannya
--   yang ikut WIB.
--
-- DIHASILKAN OLEH: scripts/gen-migration-61.mjs (dari definisi fungsi live)
-- ============================================================================

-- Helper: tanggal "hari ini" menurut jam toko, bukan jam server.
create or replace function public.po_today()
returns date
language sql
stable
as $$
  select (current_timestamp at time zone 'Asia/Jakarta')::date;
$$;

comment on function public.po_today() is
  'Tanggal hari ini di zona waktu toko (Asia/Jakarta / WIB). Dipakai untuk jendela batch PO dan laporan harian. Jangan pakai current_date — itu ikut zona waktu session database (UTC).';

grant execute on function public.po_today() to anon, authenticated, service_role;

-- public_po_pickup_dates(): 1 kemunculan current_date -> public.po_today()
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

-- public_po_batch_for_date(): 1 kemunculan current_date -> public.po_today()
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

-- create_order(): 2 kemunculan current_date -> public.po_today()
CREATE OR REPLACE FUNCTION public.create_order(p_customer_name text DEFAULT ''::text, p_customer_email text DEFAULT ''::text, p_instagram text DEFAULT ''::text, p_phone text DEFAULT ''::text, p_payment_method text DEFAULT 'transfer'::text, p_delivery_method text DEFAULT 'pickup'::text, p_delivery_zone text DEFAULT 'pickup'::text, p_address text DEFAULT NULL::text, p_address_note text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_transfer_method text DEFAULT NULL::text, p_payment_proof text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_language text DEFAULT 'id'::text, p_items jsonb DEFAULT '[]'::jsonb, p_bundles jsonb DEFAULT '[]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_batch_id bigint DEFAULT NULL::bigint, p_pickup_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$


declare
  v_settings   public.store_settings%rowtype;
  v_item       jsonb;
  v_flavor     public.flavors%rowtype;
  v_category   public.categories%rowtype;  -- pisah dari v_flavor biar gak salah assignment saat SELECT INTO
  v_bundle_rec public.bundles%rowtype;
  -- Migration-52: bundle yang ditawarkan di batch + harga khusus batch.
  v_bundle_row public.po_batch_bundles%rowtype;
  v_bundle_price integer;
  v_order_id   bigint;
  v_flavor_id  bigint;
  v_qty        integer;
  v_name       text;
  v_subtotal   integer := 0;
  v_raw        integer := 0;
  v_count      integer := 0;
  v_items_ok   integer := 0;
  v_code       text;
  v_proof      text;
  v_delivery   integer := 0;
  v_lang       text;

  v_bundle_entry     jsonb;
  v_bundle_id        bigint;
  v_required_qty     integer;
  v_slots            jsonb;
  v_slot             jsonb;
  v_slot_idx         integer;
  v_slot_flavor_id   bigint;

  v_per_cat          jsonb := '{}'::jsonb;
  v_cat_id           bigint;
  v_cat_pcs          integer;

  v_zone_row         public.delivery_zones%rowtype;
  v_zone_fee         integer := 0;
  v_zone_discounts   jsonb := '[]'::jsonb;
  v_discount_pct     integer := 0;

  v_user_id          uuid;

  -- Migration-49: batch PO. Kalau p_po_batch_id NULL, pesanan ini bukan
  -- batch (mode lama) dan stok tetap dipotong dari categories.stock.
  v_batch            public.po_batches%rowtype;
  v_batch_stock      integer;

  v_item_notes       jsonb := '[]'::jsonb;
  v_bundle_notes     jsonb := '[]'::jsonb;
  v_item_note_text   text;
  v_bundle_note_text text;

  v_payment_method   text;
  -- Migration-53: true kalau Steven sudah memilih rasa untuk batch ini.
  -- false = semua rasa aktif boleh dipesan (mode lama).
  v_batch_flavor_allowlist boolean := false;
begin
  v_user_id := coalesce(auth.uid(), p_user_id);

  -- Normalisasi + validasi payment_method
  v_payment_method := lower(coalesce(p_payment_method, 'transfer'));
  if v_payment_method not in ('transfer', 'qris_static', 'qris_midtrans') then
    raise exception 'invalid_payment_method' using errcode = '22023';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if length(trim(p_customer_name)) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if p_phone is null or length(public.normalize_phone(p_phone)) < 9 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  if p_customer_email is not null and length(trim(p_customer_email)) > 0 then
    if p_customer_email !~* '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
      raise exception 'invalid_email' using errcode = '22023';
    end if;
  end if;

  -- Migration-33: instagram optional (cuma nama + phone wajib)

  if p_delivery_method not in ('pickup', 'delivery', 'courier') then
    raise exception 'invalid_delivery_method' using errcode = '22023';
  end if;
  -- Migration-32: zone sekarang dari tabel delivery_zones (admin-defined).
  -- Migration-33: support both 'pickup' legacy dan zone ID apa pun yang aktif di tabel.
  if not exists (
    select 1 from public.delivery_zones
      where id = p_delivery_zone and is_active = true
  ) and p_delivery_zone <> 'pickup' and p_delivery_method <> 'courier' then
    raise exception 'invalid_zone' using errcode = '22023';
  end if;
  if p_delivery_method = 'delivery' and coalesce(length(trim(p_address)), 0) < 5 then
    raise exception 'address_required' using errcode = '22023';
  end if;

  -- Migration-49: validasi batch PO.
  if p_po_batch_id is not null then
    select * into v_batch from public.po_batches where id = p_po_batch_id;
    if not found then
      raise exception 'batch_not_found' using errcode = '22023';
    end if;
    if not v_batch.is_active
       or public.po_today() < v_batch.open_at
       or public.po_today() > v_batch.close_at then
      raise exception 'batch_closed' using errcode = '22023';
    end if;
    -- Tanggal ambil yang dikirim harus sama dengan tanggal ambil batch.
    -- Kalau tidak sama, tanggalnya bukan dari pilihan pembeli.
    if p_pickup_date is not null and p_pickup_date <> v_batch.pickup_date then
      raise exception 'batch_pickup_mismatch' using errcode = '22023';
    end if;
  else
    -- Migration-56: tidak ada batch PO yang dipilih = pesanan DITOLAK.
    --
    -- Sebelumnya cabang ini diam-diam menjadi jalan pemesanan tanpa batch:
    -- `v_batch` jadi null, lalu potongan stok jatuh ke `categories.stock`
    -- jalur stok global jadul. Akibatnya ketika admin tidak punya batch yang
    -- dibuka, pembeli tetap melihat sisa stok global (mis. 20 pcs) di
    -- halaman /order dan pesanan tetap berhasil masuk.
    --
    -- Setiap pesanan sekarang WAJIB punya batch yang valid. Batch sendiri
    -- sudah divalidasi di cabang `if` atas (batch_not_found / batch_closed /
    -- batch_pickup_mismatch), jadi di titik ini tidak ada lagi yang perlu
    -- diperiksa — cukup tolak.
    raise exception 'no_active_batch' using errcode = '22023';
  end if;

  v_proof := nullif(trim(coalesce(p_payment_proof, '')), '');
  v_lang  := case when p_language = 'en' then 'en' else 'id' end;

  -- QRIS Midtrans tidak butuh bukti upload (pembayaran otomatis dikonfirmasi
  -- via webhook). Static QRIS & transfer masih boleh tanpa bukti.

  if (jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0)
     and (jsonb_typeof(p_bundles) is distinct from 'array' or jsonb_array_length(p_bundles) = 0) then
    raise exception 'empty_cart' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 30 or jsonb_array_length(p_bundles) > 30 then
    raise exception 'too_many_items' using errcode = '22023';
  end if;

  select * into v_settings from public.store_settings where id = 1 for update;
  if v_settings.id is null then
    raise exception 'settings_missing' using errcode = '22023';
  end if;
  if not v_settings.is_preorder_open then
    raise exception 'preorder_closed' using errcode = '22023';
  end if;

  -- (migration-46) Ongkir SELALU dibaca dari tabel `delivery_zones`.
  -- Sebelumnya dibaca dari jsonb `store_settings.delivery_zones` -- sumber
  -- LAMA yang sudah ditinggalkan migration-32. Akibatnya pembeli melihat
  -- fee yang diedit admin (mis. Rp5.000) tapi backend menagih nilai jsonb lama
  -- (Rp10.000), dan zona yang tidak ada di jsonb itu (mis. 'antar') ditagih
  -- Rp0 alias gratis.
  if p_delivery_method = 'delivery' then
    select * into v_zone_row from public.delivery_zones where id = p_delivery_zone;
    if found then
      v_zone_fee := greatest(coalesce(v_zone_row.fee, 0), 0);
      v_zone_discounts := coalesce(v_zone_row.shipping_discounts, '[]'::jsonb);
    else
      v_zone_fee := 0;
      v_zone_discounts := '[]'::jsonb;
    end if;
  end if;

  -- Migration-53: rasa mana yang boleh dipesan di batch ini.
  if v_batch.id is not null then
    select exists (
      select 1 from public.po_batch_flavors pf where pf.batch_id = v_batch.id
    ) into v_batch_flavor_allowlist;
  end if;

  -- Item satuan
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty       := coalesce((v_item ->> 'quantity')::integer, 0);
    -- (migration-44) Batas per rasa dihapus: satu-satunya pembatas pesanan
    -- adalah stok kategori, yang divalidasi di bawah (insufficient_stock).
    if v_flavor_id is null or v_qty < 1 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    select * into v_flavor from public.flavors where id = v_flavor_id and is_active;
    if not found then raise exception 'flavor_unavailable' using errcode = '22023'; end if;
    -- Migration-53: kalau Steven sudah memilih rasa untuk batch ini, hanya
    -- rasa yang dipilih itu yang boleh dipesan. Nol baris = semua rasa aktif.
    if v_batch_flavor_allowlist
       and not exists (
         select 1 from public.po_batch_flavors pf
          where pf.batch_id = v_batch.id
            and pf.flavor_id = v_flavor_id
            and pf.is_active
       ) then
      raise exception 'flavor_unavailable' using errcode = '22023';
    end if;
    v_raw := v_raw + (v_flavor.price * v_qty);
    v_count := v_count + v_qty;
    v_items_ok := v_items_ok + 1;
    if v_flavor.category_id is not null then
      v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
      v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                             to_jsonb(v_cat_pcs + v_qty), true);
    end if;
    v_item_note_text := nullif(trim(coalesce(v_item ->> 'note', '')), '');
    if v_item_note_text is not null then
      if length(v_item_note_text) > 200 then v_item_note_text := left(v_item_note_text, 200); end if;
      v_item_notes := v_item_notes || jsonb_build_object('flavor_id', v_flavor_id, 'note', v_item_note_text);
    end if;
  end loop;

  -- Bundle
  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots := v_bundle_entry -> 'slots';
    if v_bundle_id is null then raise exception 'invalid_quantity' using errcode = '22023'; end if;
    select * into v_bundle_rec from public.bundles where id = v_bundle_id and is_active;
    if not found then raise exception 'flavor_unavailable' using errcode = '22023'; end if;
    -- Migration-52: kalau pesanan masuk ke batch, bundle yang boleh dipakai
    -- adalah yang Steven pilih untuk batch itu (dan masih aktif).
    -- PENTING: batch yang BELUM PERNAH diset bundle (nol baris) tetap memakai
    -- semua bundle aktif seperti mode lama — supaya batch yang sudah ada
    -- sebelum migrasi ini tidak langsung tidak bisa dipesan paket. Begitu
    -- Steven memilih satu bundle, itu yang berlaku.
    v_bundle_row := null;
    if v_batch.id is not null then
      select * into v_bundle_row from public.po_batch_bundles
       where batch_id = v_batch.id and bundle_id = v_bundle_id and is_active;
      if not found then
        if exists (select 1 from public.po_batch_bundles where batch_id = v_batch.id) then
          raise exception 'bundle_unavailable' using errcode = '22023';
        end if;
        v_bundle_row := null;
      end if;
    end if;
    -- Harga khusus batch kalau diisi; kalau tidak, harga bundle bawaan.
    v_bundle_price := coalesce(v_bundle_row.price, v_bundle_rec.price);
    if v_bundle_price is null or v_bundle_price <= 0 then
      v_bundle_price := v_bundle_rec.price;
    end if;
    v_required_qty := v_bundle_rec.required_qty;
    if jsonb_typeof(v_slots) is distinct from 'array' or jsonb_array_length(v_slots) <> v_required_qty then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;
    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;
      if v_slot_flavor_id is null then raise exception 'invalid_quantity' using errcode = '22023'; end if;
      select * into v_flavor from public.flavors where id = v_slot_flavor_id and is_active;
      if not found then raise exception 'flavor_unavailable' using errcode = '22023'; end if;
      -- Migration-53: slot bundle tidak boleh memakai rasa yang disembunyikan
      -- di batch ini juga.
      if v_batch_flavor_allowlist
         and not exists (
           select 1 from public.po_batch_flavors pf
            where pf.batch_id = v_batch.id
              and pf.flavor_id = v_slot_flavor_id
              and pf.is_active
         ) then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
      if v_bundle_rec.category_id is not null and v_flavor.category_id is not null
         and v_flavor.category_id <> v_bundle_rec.category_id then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
      -- migration-59: paket dengan PILIHAN terpisah. Slot ke-`v_slot_idx`
      -- hanya boleh memakai rasa dari daftar pilihan ke-`v_slot_idx`.
      -- Warna rasa di slot lain tidak boleh dipakai di slot ini.
      --
      -- Kalau paket ini punya grup slot, whitelist rata `bundle_flavors`
      -- DILEWATI sepenuhnya: yang berlaku cuma daftar per pilihan. Tanpa
      -- elseif ini, paket yang sisa whitelist lamanya akan menolak rasa
      -- dari pilihan kedua.
      if exists (select 1 from public.bundle_slots where bundle_id = v_bundle_id) then
        if (select count(*) from public.bundle_slots where bundle_id = v_bundle_id)
           <> v_required_qty then
          -- Jumlah pilihan tidak sama dengan jumlah slot yang diminta.
          -- Paket ini tidak mungkin dibeli dengan benar.
          raise exception 'flavor_unavailable' using errcode = '22023';
        end if;
        if not exists (
          select 1
          from public.bundle_slots s
          join public.bundle_slot_flavors bsf on bsf.bundle_slot_id = s.id
          where s.bundle_id = v_bundle_id
            and s.slot_index = v_slot_idx
            and bsf.flavor_id = v_slot_flavor_id
        ) then
          raise exception 'flavor_unavailable' using errcode = '22023';
        end if;
      elsif exists (select 1 from public.bundle_flavors where bundle_id = v_bundle_id) then
        -- migration-54: slot bundle hanya boleh memakai rasa yang ada di
        -- `bundle_flavors`. Daftar kosong = semua rasa boleh, jadi cek di-skip.
        if not exists (
           select 1 from public.bundle_flavors
            where bundle_id = v_bundle_id and flavor_id = v_slot_flavor_id
         ) then
          raise exception 'flavor_unavailable' using errcode = '22023';
        end if;
      end if;
      if v_flavor.category_id is not null then
        v_cat_pcs := coalesce((v_per_cat ->> (v_flavor.category_id::text))::int, 0);
        v_per_cat := jsonb_set(v_per_cat, array[v_flavor.category_id::text],
                               to_jsonb(v_cat_pcs + 1), true);
      end if;
    end loop;

    -- migration-54: bundle COMBO. Slots harus PERSIS sama dengan isi paket
    -- yang dipilih penjual, tiap rasa tepat satu kali.
    -- migration-59: paket yang punya daftar pilihan sudah diperiksa
    -- keanggotaannya per slot di atas, termasuk duplikat antar slot yang
    -- memang diizinkan. Mode terkunci tidak boleh ikut jalan untuk paket
    -- seperti itu, jadi di-skip di sini.
    if v_bundle_rec.is_fixed
       and not exists (select 1 from public.bundle_slots where bundle_id = v_bundle_id) then
      if (select count(*) from public.bundle_flavors where bundle_id = v_bundle_id)
         <> v_required_qty then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
      if exists (
        select 1
        from public.bundle_flavors bf
        where bf.bundle_id = v_bundle_id
          and (
            select count(*)
            from jsonb_array_elements(v_slots) s
            where (s ->> 'flavor_id')::bigint = bf.flavor_id
          ) <> 1
      ) then
        raise exception 'flavor_unavailable' using errcode = '22023';
      end if;
    end if;

    v_bundle_note_text := nullif(trim(coalesce(v_bundle_entry ->> 'note', '')), '');
    if v_bundle_note_text is not null then
      if length(v_bundle_note_text) > 200 then v_bundle_note_text := left(v_bundle_note_text, 200); end if;
      v_bundle_notes := v_bundle_notes || jsonb_build_object('bundle_id', v_bundle_id, 'note', v_bundle_note_text);
    end if;
    v_raw := v_raw + v_bundle_price;
    v_count := v_count + v_required_qty;
    v_items_ok := v_items_ok + 1;
  end loop;

  if v_items_ok = 0 then raise exception 'empty_cart' using errcode = '22023'; end if;
  -- Migration-33: min_order rule dihapus (setting gak punya min_order ini lagi).
  -- Skip validasi min_order — kalau admin mau aktifkan lagi, restore baris ini.
  -- if v_count < v_settings.min_order then raise exception 'below_min_order' using errcode = '22023'; end if;

  v_subtotal := v_raw;

  -- (migration-46) Diskon ongkir. Dipakai aturan dengan `min` tertinggi yang
  -- sudah terlampaui subtotal, jadi pembeli selalu dapat potongan terbaik yang
  -- berhak dia dapat. Ongkir tidak pernah minus.
  if p_delivery_method = 'delivery' and v_zone_fee > 0 and v_zone_discounts <> '[]'::jsonb then
    select coalesce(max((d->>'percent')::int), 0) into v_discount_pct
    from jsonb_array_elements(v_zone_discounts) d
    where (d->>'min')::int <= v_subtotal;

    if v_discount_pct > 0 then
      v_delivery := v_zone_fee - round(v_zone_fee * v_discount_pct / 100.0);
    else
      v_delivery := v_zone_fee;
    end if;
  else
    v_delivery := v_zone_fee;
  end if;

  for v_cat_id, v_cat_pcs in
    select (k.key)::bigint, (k.value)::int from jsonb_each(v_per_cat) as k(key, value)
  loop
    if v_batch.id is not null then
      -- Stok milik batch: baris po_batch_stock dikunci supaya dua pembeli
      -- bersamaan tidak bisa sama-sama mengambil pcs terakhir.
      select stock into v_batch_stock
        from public.po_batch_stock
       where batch_id = v_batch.id and category_id = v_cat_id
       for update;
      if coalesce(v_batch_stock, 0) < v_cat_pcs then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
      update public.po_batch_stock
         set stock = stock - v_cat_pcs
       where batch_id = v_batch.id and category_id = v_cat_id;
    else
      select * into v_category from public.categories where id = v_cat_id for update;
      if not found then continue; end if;
      if v_category.stock_enabled and v_cat_pcs > v_category.stock then
        raise exception 'insufficient_stock' using errcode = '22023';
      end if;
      if v_category.stock_enabled then
        update public.categories set stock = greatest(0, stock - v_cat_pcs) where id = v_cat_id;
      end if;
    end if;
  end loop;

  v_code := 'RK-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_code_seq')::text, 3, '0');

  insert into public.orders (
    order_code, customer_name, customer_email, instagram, phone, phone_normalized,
    delivery_method, delivery_zone, address, address_note, lat, lng,
    payment_method, transfer_method, payment_proof_path, note,
    subtotal, delivery_fee, total_price, item_count, language,
    user_id, notes,
    qris_transaction_id, qris_status, qris_qr_url, qris_expires_at,
    po_batch_id, pickup_date
  ) values (
    v_code, trim(p_customer_name),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_instagram, '')), ''),
    trim(p_phone), public.normalize_phone(p_phone),
    p_delivery_method, p_delivery_zone,
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_address_note, '')), ''),
    p_lat, p_lng,
    v_payment_method, nullif(trim(coalesce(p_transfer_method, '')), ''),
    v_proof, left(coalesce(p_note, ''), 500),
    v_subtotal, v_delivery, v_subtotal + v_delivery, v_count,
    v_lang,
    v_user_id,
    case when v_item_notes = '[]'::jsonb and v_bundle_notes = '[]'::jsonb then null
         else jsonb_build_object('items', v_item_notes, 'bundles', v_bundle_notes) end,
    -- Untuk QRIS Midtrans: transaction_id, qr_url, expires_at di-update
    -- nanti via RPC `set_order_qris_charge` setelah Midtrans charge sukses.
    -- qris_status di-set 'pending' dulu supaya ada di DB.
    null,  -- qris_transaction_id
    case when v_payment_method = 'qris_midtrans' then 'pending' else null end,  -- qris_status
    null,  -- qris_qr_url
    null,  -- qris_expires_at
    v_batch.id,  -- po_batch_id (NULL kalau pesanan ini bukan batch)
    case when v_batch.id is not null then v_batch.pickup_date else null end
  )
  returning id into v_order_id;

  -- Insert order_items (sama dengan migration-16/17)
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_flavor_id := (v_item ->> 'flavor_id')::bigint;
    v_qty := (v_item ->> 'quantity')::integer;
    select * into v_flavor from public.flavors where id = v_flavor_id;
    v_name := case when v_lang = 'en' then v_flavor.name_en else v_flavor.name_id end;
    insert into public.order_items (order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total)
    values (v_order_id, v_flavor.id, v_flavor.slug, v_name, v_flavor.price, v_qty, v_flavor.price * v_qty);
  end loop;

  for v_bundle_entry in select * from jsonb_array_elements(coalesce(p_bundles, '[]'::jsonb)) loop
    v_bundle_id := (v_bundle_entry ->> 'bundle_id')::bigint;
    v_slots := v_bundle_entry -> 'slots';
    select * into v_bundle_rec from public.bundles where id = v_bundle_id;
    v_slot_idx := 0;
    for v_slot in select * from jsonb_array_elements(v_slots) loop
      v_slot_idx := v_slot_idx + 1;
      v_slot_flavor_id := (v_slot ->> 'flavor_id')::bigint;
      select * into v_flavor from public.flavors where id = v_slot_flavor_id;
      v_name := case when v_lang = 'en' then v_flavor.name_en else v_flavor.name_id end;
      insert into public.order_items (order_id, flavor_id, flavor_slug, flavor_name, unit_price, quantity, line_total)
      values (
        v_order_id, v_flavor.id, v_flavor.slug,
        v_name || ' (' || v_bundle_rec.name_id || ' #' || v_slot_idx::text || ')',
        v_bundle_price / v_bundle_rec.required_qty, 1,
        v_bundle_price / v_bundle_rec.required_qty
      );
      insert into public.bundle_items (bundle_id, slot, flavor_id, order_id)
      values (v_bundle_rec.id, v_slot_idx, v_flavor.id, v_order_id);
    end loop;
  end loop;

  return jsonb_build_object('order_code', v_code, 'order_id', v_order_id);
end;
$function$;

-- admin_list_po_batches(): 2 kemunculan current_date -> public.po_today()
CREATE OR REPLACE FUNCTION public.admin_list_po_batches()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'batches', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'label', b.label,
          'open_at', b.open_at,
          'close_at', b.close_at,
          'pickup_date', b.pickup_date,
          'is_active', b.is_active,
          'status', case
            when not b.is_active then 'nonaktif'
            when public.po_today() < b.open_at then 'akan_dibuka'
            when public.po_today() > b.close_at then 'selesai'
            else 'buka'
          end,
          'terjual', coalesce((
            select count(*)::int
              from public.orders o
             where o.po_batch_id = b.id
               and o.status not in ('rejected', 'cancelled')
          ), 0),
          'pcs_terjual', coalesce((
            select coalesce(sum(oi.quantity), 0)::int
              from public.orders o
              join public.order_items oi on oi.order_id = o.id
             where o.po_batch_id = b.id
               and o.status not in ('rejected', 'cancelled')
          ), 0),
          'pendapatan', coalesce((
            select coalesce(sum(o.total_price), 0)::int
              from public.orders o
             where o.po_batch_id = b.id
               and o.status not in ('rejected', 'cancelled')
          ), 0),
          'stok', coalesce((
            select jsonb_object_agg(
              s.category_id::text,
              jsonb_build_object(
                'category_id', s.category_id,
                'nama', c.name_id,
                'stock', s.stock
              )
            )
            from public.po_batch_stock s
            join public.categories c on c.id = s.category_id
           where s.batch_id = b.id
          ), '{}'::jsonb)
        )
        order by b.pickup_date desc, b.id desc
      )
      from public.po_batches b
    ), '[]'::jsonb),
    'kategori', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', c.id, 'nama', c.name_id, 'aktif', c.is_active)
        order by c.sort_order, c.id
      )
      from public.categories c
    ), '[]'::jsonb)
  );
end;
$function$;

-- admin_list_po_batch_detail(): 2 kemunculan current_date -> public.po_today()
CREATE OR REPLACE FUNCTION public.admin_list_po_batch_detail(p_batch_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch public.po_batches%rowtype;
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_batch from public.po_batches where id = p_batch_id;
  if not found then
    raise exception 'batch_not_found' using errcode = '22023';
  end if;

  -- "Terjual" memakai semantik yang sama dengan kartu batch: semua status
  -- kecuali rejected dan cancelled, karena pesanan yang ditolak mengembalikan
  -- stoknya (lihat restore_order_stock).
  --
  -- stok_awal TIDAK disimpan di database, jadi diturunkan: sisa + terjual.
  select jsonb_build_object(
    'batch', jsonb_build_object(
      'id', v_batch.id,
      'label', v_batch.label,
      'open_at', v_batch.open_at,
      'close_at', v_batch.close_at,
      'pickup_date', v_batch.pickup_date,
      'is_active', v_batch.is_active,
      'status', case
        when not v_batch.is_active then 'nonaktif'
        when public.po_today() < v_batch.open_at then 'akan_dibuka'
        when public.po_today() > v_batch.close_at then 'selesai'
        else 'buka'
      end
    ),
    'stok', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'category_id', c.id,
          'nama', c.name_id,
          'sisa', coalesce(s.stock, 0)::int,
          'terjual', coalesce(t.pcs, 0)::int,
          'stok_awal', (coalesce(s.stock, 0) + coalesce(t.pcs, 0))::int
        ) order by c.sort_order, c.id
      )
      from public.categories c
      left join public.po_batch_stock s
        on s.category_id = c.id and s.batch_id = v_batch.id
      left join (
        select fl.category_id, sum(oi.quantity)::bigint as pcs
          from public.orders o
          join public.order_items oi on oi.order_id = o.id
          left join public.flavors fl on fl.id = oi.flavor_id
         where o.po_batch_id = v_batch.id
           and o.status not in ('rejected', 'cancelled')
         group by fl.category_id
      ) t on t.category_id = c.id
      where s.category_id is not null or t.category_id is not null
    ), '[]'::jsonb),
    -- Migration-52: semua bundle aktif, lengkap dengan status "dipakai di
    -- batch ini / tidak" plus harga khusus batch kalau ada.
    'bundles', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'bundle_id', b.id,
          'nama', b.name_id,
          'desc', coalesce(b.desc_id, ''),
          'harga_bawaan', b.price,
          'required_qty', b.required_qty,
          'dipakai', coalesce(pb.bundle_id is not null, false),
          'harga_batch', pb.price
        ) order by b.sort_order, b.id
      )
      from public.bundles b
      left join public.po_batch_bundles pb
        on pb.bundle_id = b.id and pb.batch_id = v_batch.id
      where b.is_active
    ), '[]'::jsonb),
    -- Kalau belum ada satu pun baris, semua bundle aktif boleh dipakai.
    'semua_bundle_aktif', not exists (
      select 1 from public.po_batch_bundles where batch_id = v_batch.id
    ),
    -- Migration-53: semua rasa AKTIF (dari menu utama) lengkap dengan
    -- status "ditampilkan di batch ini / tidak". Jadi Steven bisa mencentang
    -- rasa yang mau Dijual di batch ini.
    'flavors', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'flavor_id', fl.id,
          'nama', fl.name_id,
          'category_id', fl.category_id,
          'harga', fl.price,
          'dipakai', coalesce(pf.flavor_id is not null, false)
        ) order by fl.category_id, fl.sort_order, fl.id
      )
      from public.flavors fl
      left join public.po_batch_flavors pf
        on pf.flavor_id = fl.id and pf.batch_id = v_batch.id
      where fl.is_active
    ), '[]'::jsonb),
    -- Kalau nol baris, semua rasa aktif tetap tampil (mode lama).
    'semua_rasa_aktif', not exists (
      select 1 from public.po_batch_flavors where batch_id = v_batch.id
    ),
    'ringkasan', jsonb_build_object(
      'terjual', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id
                     and o.status not in ('rejected', 'cancelled')),
      'pcs_terjual', coalesce((
        select sum(oi.quantity)::bigint
          from public.orders o
          join public.order_items oi on oi.order_id = o.id
         where o.po_batch_id = v_batch.id
           and o.status not in ('rejected', 'cancelled')
      ), 0)::bigint,
      'pendapatan', coalesce((
        select sum(o.total_price)::bigint from public.orders o
         where o.po_batch_id = v_batch.id
           and o.status not in ('rejected', 'cancelled')
      ), 0)::bigint,
      'pending', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id and o.status = 'pending'),
      'selesai', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id
                     and o.status in ('accepted', 'ready', 'delivered')),
      'ditolak', (select count(*)::int from public.orders o
                   where o.po_batch_id = v_batch.id
                     and o.status in ('rejected', 'cancelled'))
    )
  ) into v_result;

  return v_result;
end;
$function$;

-- admin_dashboard_stats(): 4 tempat diganti, created_at ikut WIB supaya
-- sisi kiri dan kanan dibandingkan dalam zona waktu yang sama.
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pending  integer;
  v_accepted integer;
  v_ready    integer;
  v_total    integer;
  v_today    numeric;
  v_month    numeric;
  v_orders_today integer;
  v_total_flavor integer;
  v_top      jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- pending = transfer saja. QRIS unpaid tidak masuk karena belum masuk
  --          ke antrian produksi (lihat aturan di admin_list_orders).
  select count(*) into v_pending
    from public.orders
    where status = 'pending'
      and payment_method <> 'qris_midtrans';

  select count(*) into v_accepted from public.orders where status = 'accepted';
  select count(*) into v_ready    from public.orders where status = 'ready';
  -- Total = jumlah order yang masuk antrian (QRIS unpaid tidak dihitung).
  select count(*) into v_total
    from public.orders
    where not (payment_method = 'qris_midtrans' and qris_status is distinct from 'paid');

  select coalesce(sum(total_price), 0) into v_today
    from public.orders where (created_at at time zone 'Asia/Jakarta')::date = public.po_today();
  select count(*) into v_orders_today
    from public.orders where (created_at at time zone 'Asia/Jakarta')::date = public.po_today();
  select coalesce(sum(total_price), 0) into v_month
    from public.orders
    where date_trunc('month', created_at at time zone 'Asia/Jakarta') = date_trunc('month', public.po_today());

  select count(*) into v_total_flavor from public.flavors where is_active;

  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_top
  from (
    select oi.flavor_name as flavor_name, sum(oi.quantity)::int as qty
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where date_trunc('month', o.created_at at time zone 'Asia/Jakarta') = date_trunc('month', public.po_today())
    group by oi.flavor_name
    order by qty desc
    limit 5
  ) x;

  return jsonb_build_object(
    'pending_orders', v_pending,
    'accepted_orders', v_accepted,
    'ready_orders', v_ready,
    'total_orders', v_total,
    'revenue_today', v_today,
    'orders_today', v_orders_today,
    'revenue_month', v_month,
    'flavor_count', v_total_flavor,
    'stock_enabled', false,
    'total_stock', 0,
    'stock_used', 0,
    'sales_by_flavor', v_top
  );
end;
$function$;

-- grants tidak diubah: CREATE OR REPLACE mempertahankan ACL yang sudah ada.
-- Verifikasi setelah jalan:
--   select public.po_today(), current_date,
--          (current_date between open_at and close_at) as buka
--     from public.po_batches where id = 22;
