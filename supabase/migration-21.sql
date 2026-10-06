-- ============================================================================
-- MIGRASI 21 — Sistem Review / Ulasan Pembeli
-- ----------------------------------------------------------------------------
-- Tabel baru `order_reviews`:
--   - order_id FK ke orders (UNIQUE — satu pesanan hanya boleh satu review)
--   - customer_name, rating (1..5), is_visible (default true)
--   - created_at
--
-- RPC publik:
--   - submit_review(p_order_code, p_rating, p_comment)
--       Hanya untuk pesanan berstatus 'delivered'. Validasi order_code
--       harus ada; kalau sudah ada review untuk pesanan itu, raise error.
--   - has_review(p_order_code)
--       Cek apakah pesanan sudah pernah di-review.
--   - list_reviews(p_limit, p_offset)
--       Daftar review publik (is_visible = true), newest first.
-- ============================================================================

create table if not exists public.order_reviews (
  id            bigserial primary key,
  order_id      integer     not null unique references public.orders(id) on delete cascade,
  customer_name text        not null,
  rating        smallint    not null check (rating between 1 and 5),
  comment       text         not null,
  is_visible    boolean     not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists order_reviews_created_at_idx
  on public.order_reviews (created_at desc);

create index if not exists order_reviews_visible_created_at_idx
  on public.order_reviews (created_at desc)
  where is_visible = true;

comment on table public.order_reviews is
  'Ulasan publik pembeli — satu review per pesanan (status=delivered).';

-- -----------------------------------------------------------------
-- submit_review: create review untuk pesanan yang sudah delivered
-- -----------------------------------------------------------------
create or replace function public.submit_review(
  p_order_code text,
  p_rating     smallint,
  p_comment    text
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

  insert into public.order_reviews (order_id, customer_name, rating, comment)
  values (
    v_order.id,
    coalesce(nullif(btrim(v_order.customer_name), ''), 'Anonim'),
    p_rating,
    btrim(p_comment)
  )
  returning * into v_review;

  return jsonb_build_object(
    'id',            v_review.id,
    'order_id',      v_review.order_id,
    'customer_name', v_review.customer_name,
    'rating',        v_review.rating,
    'comment',       v_review.comment,
    'created_at',    v_review.created_at
  );
END;
$$;

comment on function public.submit_review(text, smallint, text)
  is 'Submit review untuk pesanan berstatus delivered. 1 review per pesanan.';

-- -----------------------------------------------------------------
-- has_review: cek apakah pesanan sudah pernah di-review
-- -----------------------------------------------------------------
create or replace function public.has_review(p_order_code text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.order_reviews r
    join public.orders o on o.id = r.order_id
    where o.order_code = btrim(p_order_code)
  );
$$;

comment on function public.has_review(text)
  is 'True bila pesanan dengan kode tsb sudah punya review.';

-- -----------------------------------------------------------------
-- list_reviews: daftar review publik (is_visible = true)
-- -----------------------------------------------------------------
create or replace function public.list_reviews(
  p_limit  integer default 12,
  p_offset integer default 0
) returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with rows as (
    select r.id, r.customer_name, r.rating, r.comment, r.created_at,
           o.order_code
    from public.order_reviews r
    join public.orders o on o.id = r.order_id
    where r.is_visible = true
    order by r.created_at desc
    limit greatest(1, least(p_limit, 100))
    offset greatest(0, p_offset)
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
          'created_at', created_at,
          'order_code', order_code
        ) order by created_at desc
      ) from rows
    ), '[]'::jsonb)
  );
$$;

comment on function public.list_reviews(integer, integer)
  is 'Daftar review publik (visible). Limit maks 100.';