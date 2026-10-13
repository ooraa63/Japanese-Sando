-- =============================================================================
--  MIGRASI 47 --
--  Halaman /jam-buka + /syarat-ketentuan, dan Syarat & Ketentuan bisa diedit
-- =============================================================================
--
--  Permintaan Steven (13-10-2026):
--   3. Di sheet Profil, bar "Jam Buka" dan "Syarat & Ketentuan" belum punya
--      halaman — hanya "Contact" (ke /contact) dan "FAQ" (ke /faq) yang punya
--      `href`. Dua bar sisanya masih membuka popup, dan popup Ketentuan isinya
--      cuma satu kalimat. Steven minta keduanya jadi halaman.
--
--  Keputusan desain:
--   * "Jam Buka" TIDAK butuh tabel baru. Sumber tunggalnya sudah ada:
--     `store_settings.hours_id` / `hours_en`, diisi dari Admin > Pengaturan dan
--     sudah dipakai footer, /contact, /order, dan /account. Halaman /jam-buka
--     membaca sumber yang sama supaya tidak pernah berbeda isi. Kalau kolomnya
--     kosong (saat ini memang kosong), halaman menampilkanempty state + ajakan
--     chat WhatsApp, bukan halaman rusak.
--   * "Syarat & Ketentuan" butuh tabel baru, karena tidak ada satu pun tempat
--     teksnya disimpan selain satu kalimat di `profile_menu_items.body_id`.
--     Steven minta kontennya bisa diedit penjual dari dashboard, jadi polanya
--     ditiru dari `faq_items` (migration-46): tabel + RPC public_/admin_.
--
--  Catatan: setelah `href` terisi, `body_id`/`body_en` bar `terms` tidak lagi
--  dipakai frontend (popup dilewati). Nilainya sengaja tidak dihapus supaya
--  kalau `href` dikosongkan lagi, isinya masih ada.
-- =============================================================================

-- =============================================================================
-- 1) TABEL SYARAT & KETENTUAN
-- =============================================================================
create table if not exists public.terms_sections (
  id          bigserial primary key,
  title_id    text    not null,
  title_en    text    not null default '',
  body_id     text    not null default '',
  body_en     text    not null default '',
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.terms_sections is
  'Bagian Syarat & Ketentuan yang tampil di halaman /syarat-ketentuan. migration-47.';

alter table public.terms_sections enable row level security;

drop policy if exists terms_sections_public_read on public.terms_sections;
create policy terms_sections_public_read on public.terms_sections
  for select to anon, authenticated
  using (is_active);

drop policy if exists terms_sections_admin_all on public.terms_sections;
create policy terms_sections_admin_all on public.terms_sections
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.terms_sections to anon, authenticated;
grant insert, update, delete on public.terms_sections to authenticated;

-- Idempotent: trigger di-drop dulu supaya migrasi ini aman dijalankan ulang.
drop trigger if exists terms_sections_touch on public.terms_sections;
create trigger terms_sections_touch before update on public.terms_sections
  for each row execute function touch_updated_at();

-- -----------------------------------------------------------------------------
-- Seed isi awal.
--
-- TIDAK ada angka commercially yang dikarang di sini: ongkir, harga, jadwal,
-- dan nama promo sengaja tidak ditulis karena itu keputusan toko. Yang ditulis
-- hanya aturan umum pre-order yang memang berlaku, dan kalimat asli yang
-- tadinya ada di `profile_menu_items.body_id` ikut dipertahankan utuh.
--
-- Hanya kalau tabel masih kosong. Tabel tidak punya unique constraint, jadi
-- `on conflict do nothing` tidak mencegah duplikat kalau skrip dijalankan dua
-- kali — makanya dicek lewat `if not exists`.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.terms_sections) then
    insert into public.terms_sections (title_id, title_en, body_id, body_en, sort_order, is_active)
    values
  ('Pemesanan',
   'Ordering',
   'Pesanan dibuat lewat halaman pemesanan di situs ini. Pilih rasa dan jumlah yang diinginkan, isi nama serta nomor WhatsApp, lalu tentukan pengambilan di toko atau pengiriman. Pesanan dianggap sah setelah dikonfirmasi oleh tim kami.',
   'Orders are placed through the ordering page on this site. Pick your flavors and quantities, fill in your name and WhatsApp number, then choose pickup or delivery. An order is considered confirmed once our team confirms it.',
   10, true),
  ('Pembayaran',
   'Payment',
   'Pesanan dibuat setelah pembayaran dikonfirmasi. Metode yang tersedia bisa QRIS maupun transfer bank; untuk transfer bank kamu perlu mengunggah bukti transfer supaya pesanan diproses. Kalau kamu memilih Ambil di toko, pembayaran dilakukan langsung saat pengambilan.',
   'An order is created once payment is confirmed. Available methods are QRIS and bank transfer; for bank transfer you need to upload your payment proof so we can process the order. If you choose pickup, payment is made on site when you collect your order.',
   20, true),
  ('Batas Waktu Pesanan',
   'Ordering Deadline',
   'Kami hanya menerima pesanan sampai batas pre-order yang tertera di halaman utama. Pesanan yang dibuat setelah batas itu belum tentu kami terima, jadi silakan pesan lebih awal.',
   'We only take orders until the pre-order deadline shown on the homepage. Orders placed after that may not be accepted, so please order early.',
   30, true),
  ('Ketersediaan Rasa',
   'Flavor Availability',
   'Semua menu dibuat fresh dan jumlahnya terbatas. Kalau suatu rasa habis, rasa itu tidak akan muncul sebagai pilihan di halaman pemesanan. Rasa yang tampil di halaman pemesanan adalah yang masih tersedia.',
   'Everything is made fresh and in limited quantity. Once a flavor runs out, it disappears from the ordering page. What you see on the ordering page is what is still available.',
   40, true),
  ('Pengambilan di Toko',
   'Pickup',
   'Ambil di toko pada jam yang sudah disepakati. Kalau kamu tidak bisa datang di jam itu, chat WhatsApp kami secepatnya supaya waktunya dipindah.',
   'Collect your order in store at the agreed time. If you cannot make it then, message us on WhatsApp as early as possible so we can move it.',
   50, true),
  ('Pengiriman',
   'Delivery',
   'Kami hanya mengirim ke area yang tercakup dalam zona pengiriman yang tampil di halaman pemesanan. Ongkos kirim mengikuti zona tersebut dan bisa otomatis menjadi gratis kalau belanjaanmu sudah memenuhi syaratnya. Alamat yang kamu isi harus jelas supaya kurir tidak salah jalan.',
   'We only deliver to areas covered by the delivery zones shown on the ordering page. The shipping fee follows that zone, and it may become free automatically once your order reaches the required amount. The address you enter must be clear so our courier does not get lost.',
   60, true),
  ('Pembatalan',
   'Cancellation',
   'Kamu bisa membatalkan selama pesanan belum kami mulai buat. Untuk pembatalan setelah pembayaran, dana dikembalikan lewat cara pembayaran yang sama. Pesanan yang belum dibayar sebelum batas waktu akan dibatalkan otomatis.',
   'You can cancel as long as we have not started making your order. For cancellations after payment, the refund goes back through the same payment method. Unpaid orders past the deadline are cancelled automatically.',
   70, true),
  ('Perubahan Ketentuan',
   'Changes to These Terms',
   'Isi halaman ini bisa berubah sewaktu-waktu tanpa pemberitahuan sebelumnya. Yang berlaku adalah isi yang tampil di halaman ini saat kamu memesan.',
   'The content of this page may change at any time without prior notice. The version shown here at the time you order is the one that applies.',
   80, true);
  end if;
end;
$$;

-- =============================================================================
-- 2) FUNGSI SYARAT & KETENTUAN
-- =============================================================================

-- public_terms: yang dibaca halaman /syarat-ketentuan (hanya bar aktif) ----------
create or replace function public.public_terms()
returns jsonb
language plpgsql
stable
set search_path = 'public'
as $body$
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title_id', t.title_id,
        'title_en', t.title_en,
        'body_id', t.body_id,
        'body_en', t.body_en,
        'sort_order', t.sort_order
      ) order by t.sort_order, t.id
    )
    from public.terms_sections t
    where t.is_active
  ), '[]'::jsonb);
end;
$body$;

-- admin_list_terms: semua bar, termasuk yang disembunyikan ------------------------
create or replace function public.admin_list_terms()
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $body$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'title_id', t.title_id,
          'title_en', t.title_en,
          'body_id', t.body_id,
          'body_en', t.body_en,
          'sort_order', t.sort_order,
          'is_active', t.is_active
        ) order by t.sort_order, t.id
      )
      from public.terms_sections t
    ), '[]'::jsonb)
  );
end;
$body$;

-- admin_save_terms: simpan satu bagian ------------------------------------------
create or replace function public.admin_save_terms(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $body$
declare
  v_id  bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_tit text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_tit := btrim(coalesce(p_payload ->> 'title_id', ''));
  if v_tit = '' then
    v_tit := btrim(coalesce(p_payload ->> 'title_en', ''));
  end if;
  if v_tit = '' then
    raise exception 'invalid_title' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.terms_sections set
      title_id   = left(v_tit, 200),
      title_en   = left(coalesce(p_payload ->> 'title_en', ''), 200),
      body_id    = left(coalesce(p_payload ->> 'body_id', ''), 4000),
      body_en    = left(coalesce(p_payload ->> 'body_en', ''), 4000),
      sort_order = coalesce((p_payload ->> 'sort_order')::integer, 0),
      is_active  = case when p_payload ? 'is_active'
                        then coalesce((p_payload ->> 'is_active')::boolean, true)
                        else is_active end
    where id = v_id
    returning id into v_id;
  else
    insert into public.terms_sections (title_id, title_en, body_id, body_en, sort_order, is_active)
    values (
      left(v_tit, 200),
      left(coalesce(p_payload ->> 'title_en', ''), 200),
      left(coalesce(p_payload ->> 'body_id', ''), 4000),
      left(coalesce(p_payload ->> 'body_en', ''), 4000),
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      coalesce((p_payload ->> 'is_active')::boolean, true)
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  return jsonb_build_object('id', v_id);
end;
$body$;

-- admin_delete_terms: hapus bagian ------------------------------------------------
create or replace function public.admin_delete_terms(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $body$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.terms_sections where id = p_id;
  if not found then
    raise exception 'not_found' using errcode = '22023';
  end if;

  return jsonb_build_object('deleted', true);
end;
$body$;

-- =============================================================================
-- 3) BAR MENU PROFIL YANG SEKARANG PUNYA HALAMAN
-- =============================================================================
--  `ProfileSheet` memakai `href` untuk membedakan link dan popup: bar dengan
--  `href` jadi <Link> dan sheet langsung tertutup, bar tanpa `href` membuka
--  popup `body_id`. Dua bar di bawah sebelumnya `href = NULL`, jadi keduanya
--  hanya popup. Sekarang keduanya mengarah ke halaman masing-masing.
--
--  `where code = ...` dipakai (bukan update tanpa filter) supaya kalau ternyata
--  ada bar lain dengan `href` kosong, bar itu tidak ikut berubah diam-diam.
update public.profile_menu_items set href = '/jam-buka'
  where code = 'hours' and href is null;

update public.profile_menu_items set href = '/syarat-ketentuan'
  where code = 'terms' and href is null;