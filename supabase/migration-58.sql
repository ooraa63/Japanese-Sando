-- =============================================================================
--  MIGRASI 58 --
--  Ulasan: sortir menurut bintang, foto pada ulasan, pengelolaan admin
-- =============================================================================
--
--  Steven 15-10-2026:
--
--    1. "Untuk di bagian, ulasan buat ada fitur bisa di sort bintangnya"
--    2. "lalu tambahkan jgua saat memberi ulasan kita bisa tambahkan foto"
--    3. "Untuk admin buat bisa mengatur ulasan itu, jadi kalau ada orang yang
--        asal memberi ulasan bisa kita delete atau gimana gitu lah"
--
--  Yang sudah ada sebelum migration ini (tabelnya sejak migration-21):
--
--    order_reviews(id, order_id, customer_name, rating, comment,
--                  is_visible, created_at)
--    submit_review(order_code, rating, comment)
--    has_review(order_code)
--    list_reviews(limit, offset)
--
--  `is_visible` sudah ada sejak migration-21 tapi TIDAK PERNAH dipakai untuk
--  apa pun -- tidak ada RPC admin, tidak ada UI. Jadi menyaring ulasan yang
--  tidak pantas sebenarnya tinggal menghidupkan kolom yang sudah tersedia;
--  yang belum ada cuma pintunya.
--
--  Definisi LIVE ketiga fungsi di atas sudah dicocokkan dengan migration-21 dan
--  identik (scripts/check-review-drift.mjs), jadi isi migration ini boleh
--  memakai ulang body yang sama dengan penyesuaian yang disebut.
--
-- ---------------------------------------------------------------- 1. FOTO
--
--  Satu foto per ulasan, opsional. Kolomnya `photo_path` yang berisi PATH
--  objek di bucket, bukan URL, supaya bucket bisa diganti tanpa memindahkan
--  data dan supaya file-nya bisa dihapus bersama barisnya.
--
--  Bucket `review-photos` dibuat PUBLIK, berbeda dari `payment-proofs` yang
--  privat: foto ulasan memang meant to be dilihat orang, jadi tidak perlu
--  signed URL yang harus di-refresh tiap 30 menit.
--
-- ---------------------------------------------------------------- 2. SORTIR
--
--  `p_sort` dengan empat nilai. Nilai yang tidak dikenal jatuh ke 'newest',
--  jadi parameter ini aman dibaca langsung dari URL tanpa validasi di frontend:
--
--    newest  (bawaan) created_at desc
--    highest          rating desc, lalu created_at desc
--    lowest           rating asc, lalu created_at desc
--    photo            yang punya foto dulu, lalu created_at desc
--
-- ---------------------------------------------------------------- 3. ADMIN
--
--  Tiga RPC baru, semuanya `security definer` + `is_admin()`, mengikuti pola
--  `admin_*` yang sudah dipakai halaman admin lain:
--
--    admin_list_reviews()                 semua ulasan, termasuk yang disembunyikan
--    admin_set_review_visible(id, bool)   sembunyikan / tampilkan, bisa dibalik
--    admin_delete_review(id)              hapus permanen
--
--  Dua aksi, bukan satu, karena Steven menulis "delete atau gimana gitu lah":
--  menyembunyikan bisa dibalik kalau ternyata ulasan itu tidak bermasalah,
--  menghapus tidak. Foto di storage TIDAK dihapus dari SQL (SQL tidak punya
--  akses Storage API) -- `admin_delete_review` mengembalikan `photo_path`-nya
--  supaya server action bisa menghapus filenya lewat Storage API, yang
--  diizinkan oleh policy `review_photos_admin_delete`.
--
-- ---------------------------------------------------------------- CATATAN GRANT
--
--  `drop function` menghapus ACL-nya, jadi grant ke empat role diulang setelah
--  tiap `create` (gotcha #24). Tanpa itu, versi `list_reviews` yang baru akan
--  `permission denied` untuk anon dan pembeli melihat bagian ulasan kosong.
--
-- ------------------------------------------------ KENAPA OVERLOAD LAMA DILETAKAN
--
--  Overload 3-arg `submit_review` dan 2-arg `list_reviews` TIDAK dihapus, hanya
--  diubah jadi pembungkus tipis yang memanggil versi baru.
--
--  Alasannya urutan deploy. Kode yang sedang LIVE di produksi memanggil
--  `submit_review(3 arg)` dan `list_reviews(2 arg)`. Kalau migration ini
--  menghapus keduanya, ada jeda antara "migration di-apply" dan "kode baru
--  sampai di Vercel" ketika fitur ulasan di situs yang sedang hidup akan
--  error `function ... does not exist`. Dengan pembungkus, kedua versi hidup
--  bersamaan, jadi migration boleh di-apply duluan ATAU kode baru lebih dulu
--  -- keduanya aman.
--
--  PostgREST memilih overload berdasarkan JUMLAH ARGUMEN secara persis, jadi
--  tidak ada ambiguitas: 3 argumen selalu masuk ke pembungkus, 4 argumen
--  selalu masuk ke fungsi utama.
--
-- ============================================================ 1. KOLOM FOTO

alter table public.order_reviews
  add column if not exists photo_path text;

comment on column public.order_reviews.photo_path is
  'Path objek foto di bucket review-photos (bukan URL). NULL = tanpa foto.';

create index if not exists order_reviews_rating_created_idx
  on public.order_reviews (rating desc, created_at desc);

-- ============================================================ 2. SUBMIT_REVIEW

--  `p_photo_path` SENGAJA TIDAK diberi default. Kalau diberi `default null`,
--  pemanggilan 3-argumen jadi ambigu antara fungsi ini dan pembungkus
--  signature lama di bawahnya, dan PostgreSQL menolak dengan
--  "function public.submit_review(text, smallint, text) is not unique".
--  Tanpa default, jumlah argumen menentukan fungsi secara tegas: 3 -> pembungkus,
--  4 -> fungsi ini.
create or replace function public.submit_review(
  p_order_code text,
  p_rating     smallint,
  p_comment    text,
  p_photo_path text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_review public.order_reviews%rowtype;
BEGIN
  if p_order_code is null or btrim(p_order_code) = '' then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if p_comment is null or btrim(p_comment) = '' then
    raise exception 'empty_comment' using errcode = 'P0001';
  end if;
  if length(p_comment) > 1000 then
    raise exception 'comment_too_long' using errcode = 'P0001';
  end if;

  -- Path foto HARUS di dalam folder `reviews/`. Tanpa cek ini, pembeli bisa
  -- mengisi kolom apa saja -- termasuk path milik bucket lain -- dan nama file
  -- yang dikendalikan pembeli akan tersimpan di database kita.
  if p_photo_path is not null then
    if btrim(p_photo_path) = ''
       or p_photo_path like '..%'
       or p_photo_path not like 'reviews/%'
       or length(p_photo_path) > 200 then
      raise exception 'invalid_photo_path' using errcode = 'P0001';
    end if;
  end if;

  select * into v_order
  from public.orders
  where order_code = btrim(p_order_code)
  limit 1;

  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;

  if v_order.status <> 'delivered' then
    raise exception 'order_not_delivered' using errcode = 'P0001';
  end if;

  -- Sudah pernah review? Tolak.
  if exists (select 1 from public.order_reviews where order_id = v_order.id) then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  insert into public.order_reviews (order_id, customer_name, rating, comment, photo_path)
  values (
    v_order.id,
    coalesce(nullif(btrim(v_order.customer_name), ''), 'Anonim'),
    p_rating,
    btrim(p_comment),
    p_photo_path
  )
  returning * into v_review;

  return jsonb_build_object(
    'id',            v_review.id,
    'order_id',      v_review.order_id,
    'customer_name', v_review.customer_name,
    'rating',        v_review.rating,
    'comment',       v_review.comment,
    'photo_path',    v_review.photo_path,
    'created_at',    v_review.created_at
  );
END;
$$;

comment on function public.submit_review(text, smallint, text, text)
  is 'Submit review untuk pesanan berstatus delivered. 1 review per pesanan. '
  'Foto opsional; kalau diisi harus path di folder reviews/.';

grant execute on function public.submit_review(text, smallint, text, text)
  to postgres, anon, authenticated, service_role;

-- Pembungkus: signature LAMA yang masih dipanggil kode yang sedang live.
-- Foto NULL. Selain itu identik dengan versi 4-argumen.
create or replace function public.submit_review(
  p_order_code text,
  p_rating     smallint,
  p_comment    text
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.submit_review(p_order_code, p_rating, p_comment, null::text);
$$;

comment on function public.submit_review(text, smallint, text)
  is 'Migration-58: pembungkus lama (tanpa foto). Tetap ada supaya kode yang '
  'sudah live tidak ikut error selama transisi deploy.';

grant execute on function public.submit_review(text, smallint, text)
  to postgres, anon, authenticated, service_role;

-- ============================================================== 3. LIST_REVIEWS

-- Sama seperti submit_review 4-arg: TIDAK ada default, supaya jumlah argumen
-- menentukan fungsi secara tegas (2 -> pembungkus, 3 -> fungsi ini).
create or replace function public.list_reviews(
  p_limit  integer,
  p_offset integer,
  p_sort   text
) returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with params as (
    select
      greatest(1, least(coalesce(p_limit, 12), 100)) as lim,
      greatest(0, coalesce(p_offset, 0))            as off,
      case when p_sort in ('highest', 'lowest', 'photo')
           then p_sort else 'newest' end           as urut
  ),
  visible as (
    select r.id, r.customer_name, r.rating, r.comment, r.photo_path,
           r.created_at, o.order_code
    from public.order_reviews r
    join public.orders o on o.id = r.order_id
    where r.is_visible = true
  ),
  numbered as (
    -- OFFSET tidak boleh berisi variabel di PostgreSQL ("argument of OFFSET
    -- must not contain variables"), sedangkan LIMIT boleh. Karena keduanya
    -- datang dari parameter, halaman diambil lewat row_number() saja.
    -- Urutannya ditetapkan DI SINI, bukan di jsonb_agg, supaya paging dan
    -- urutan yang dikirim ke frontend sama persis.
    select v.*,
           row_number() over (
             order by
               case when p.urut = 'highest' then v.rating end desc,
               case when p.urut = 'lowest'  then v.rating end asc,
               case when p.urut = 'photo'   then (v.photo_path is not null) end desc,
               v.created_at desc,
               v.id desc
           ) as rn
    from visible v
    cross join params p
  ),
  rows as (
    select n.*
    from numbered n
    cross join params p2
    where n.rn > p2.off
      and n.rn <= p2.off + p2.lim
  ),
  agg as (
    select coalesce(round(avg(rating)::numeric, 1), 0) as avg_rating,
           count(*) as total_count
    from public.order_reviews
    where is_visible = true
  )
  select jsonb_build_object(
    'avg_rating', (select avg_rating from agg),
    'total_count', (select total_count from agg),
    'reviews', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'customer_name', customer_name,
          'rating', rating,
          'comment', comment,
          'photo_path', photo_path,
          'created_at', created_at,
          'order_code', order_code
        ) order by rn
      ) from rows
    ), '[]'::jsonb)
  );
$$;

comment on function public.list_reviews(integer, integer, text)
  is 'Daftar review publik (visible). p_sort: newest|highest|lowest|photo. Limit maks 100.';

grant execute on function public.list_reviews(integer, integer, text)
  to postgres, anon, authenticated, service_role;

-- Pembungkus: signature LAMA yang masih dipanggil kode yang sedang live.
-- Urutan bawaan = 'newest', sama seperti sebelumnya migration ini.
create or replace function public.list_reviews(
  p_limit  integer default 12,
  p_offset integer default 0
) returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select public.list_reviews(p_limit, p_offset, 'newest'::text);
$$;

comment on function public.list_reviews(integer, integer)
  is 'Migration-58: pembungkus lama (urutan newest). Tetap ada supaya kode yang '
  'sudah live tidak ikut error selama transisi deploy.';

grant execute on function public.list_reviews(integer, integer)
  to postgres, anon, authenticated, service_role;

-- ======================================================= 4. RPC KELOLA ADMIN

create or replace function public.admin_list_reviews()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select case
    when not public.is_admin() then null
    else jsonb_build_object(
      'total_count',   (select count(*) from public.order_reviews),
      'visible_count', (select count(*) from public.order_reviews where is_visible),
      'hidden_count',  (select count(*) from public.order_reviews where not is_visible),
      'avg_rating',    (select coalesce(round(avg(rating)::numeric, 1), 0)
                        from public.order_reviews where is_visible),
      'reviews', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',            r.id,
            'order_id',      r.order_id,
            'order_code',    o.order_code,
            'customer_name', r.customer_name,
            'rating',        r.rating,
            'comment',       r.comment,
            'photo_path',    r.photo_path,
            'is_visible',    r.is_visible,
            'created_at',    r.created_at
          ) order by r.created_at desc, r.id desc
        )
        from public.order_reviews r
        join public.orders o on o.id = r.order_id
      ), '[]'::jsonb)
    )
  end;
$$;

comment on function public.admin_list_reviews()
  is 'Semua ulasan (termasuk yang disembunyikan) untuk halaman admin. Butuh is_admin().';

-- ============================================== 5. SEMBUNYIKAN / TAMPILKAN

create or replace function public.admin_set_review_visible(
  p_review_id bigint,
  p_visible   boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.order_reviews%rowtype;
BEGIN
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.order_reviews
  set is_visible = coalesce(p_visible, false)
  where id = p_review_id
  returning * into v_row;

  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_row.id, 'is_visible', v_row.is_visible);
END;
$$;

comment on function public.admin_set_review_visible(bigint, boolean)
  is 'Sembunyikan/tampilkan ulasan. Reversibel -- pakai ini sebelum hapus permanen.';

-- ================================================================ 6. HAPUS

create or replace function public.admin_delete_review(p_review_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
BEGIN
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select photo_path into v_path
  from public.order_reviews
  where id = p_review_id;

  if not found then
    raise exception 'review_not_found' using errcode = 'P0001';
  end if;

  delete from public.order_reviews where id = p_review_id;

  -- File-nya sengaja TIDAK dihapus dari sini: SQL tidak punya akses Storage
  -- API. `photo_path` dikembalikan supaya server action bisa menghapus
  -- filenya lewat Storage API (policy `review_photos_admin_delete`
  -- mengizinkan sesi admin).
  return jsonb_build_object(
    'id',            p_review_id,
    'photo_path',    v_path,
    'photo_pending', v_path is not null
  );
END;
$$;

comment on function public.admin_delete_review(bigint)
  is 'Hapus ulasan permanen. Kembalikan photo_path supaya server action bisa '
  'menghapus file di bucket review-photos.';

-- CATATAN PENTING SOAL GRANT
--
-- Database ini punya DEFAULT ACL di schema public:
--   postgres=X, anon=X, authenticated=X, service_role=X untuk tipe 'f'
-- Jadi SETIAP fungsi baru otomatis dapat EXECUTE dari anon, Listing grant di
-- bawah TIDAK bisa mencegah itu -- `has_function_privilege('anon', ...)`
-- tetap true, sama seperti untuk semua fungsi admin_* yang sudah ada
-- (dicek: admin_delete_faq juga true untuk anon).
--
-- Jadi perlindungan NYATA ada di dalam fungsi: setiap RPC admin memanggil
-- `public.is_admin()` lebih dulu dan raise `not_authorized` kalau gagal.
-- `admin_list_reviews` tidak bisa pakai raise karena dia `language sql`,
-- jadi dia mengembalikan NULL kalau bukan admin. Jangan andalkan grant.
grant execute on function public.admin_list_reviews()
  to postgres, authenticated, service_role;
grant execute on function public.admin_set_review_visible(bigint, boolean)
  to postgres, authenticated, service_role;
grant execute on function public.admin_delete_review(bigint)
  to postgres, authenticated, service_role;

-- ============================================================ 7. BUCKET FOTO

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Menyimpan foto: boleh anon, tapi HANYA di folder `reviews/`, sama seperti
-- pola `payment-proofs` yang sudah dipakai bukti transfer.
drop policy if exists review_photos_anon_insert on storage.objects;
create policy review_photos_anon_insert on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = 'reviews'
  );

-- Baca: publik, karena bucket-nya public dan fotonya ditampilkan di homepage.
drop policy if exists review_photos_public_read on storage.objects;
create policy review_photos_public_read on storage.objects
  for select to public
  using (bucket_id = 'review-photos');

-- Menghapus file: hanya admin. Dipakai server action setelah RPC hapus baris.
drop policy if exists review_photos_admin_delete on storage.objects;
create policy review_photos_admin_delete on storage.objects
  for delete to public
  using (bucket_id = 'review-photos' and public.is_admin());