-- ============================================================================
--  MIGRASI 14 — Like counter per flavor
-- ----------------------------------------------------------------------------
-- Sebelumnya like disimpan per-device di localStorage saja, jadi admin
-- tidak bisa melihat jumlah total like. Sekarang pakai tabel
-- `flavor_likes` dengan device-session-id unik. Setiap click like/unlike
-- dari client akan trigger RPC yang increment/decrement counter di
-- tabel flavors.
--
-- Pola "session_id" disimpan di localStorage user; saat user like, RPC
-- `flavor_toggle_like` insert ke `flavor_likes` (session_id, flavor_id).
-- Kalau sudah ada, hapus (unlike). Counter di `flavors.likes_count` di-
-- update via trigger.
-- ============================================================================

alter table public.flavors
  add column if not exists likes_count integer not null default 0;

create table if not exists public.flavor_likes (
  flavor_id      bigint not null references public.flavors(id) on delete cascade,
  session_id     text        not null,
  created_at     timestamptz not null default now(),
  primary key (flavor_id, session_id)
);

create index if not exists flavor_likes_flavor_idx
  on public.flavor_likes (flavor_id);

alter table public.flavor_likes enable row level security;

drop policy if exists flavor_likes_public_read on public.flavor_likes;
create policy flavor_likes_public_read on public.flavor_likes
for select using (true);

drop policy if exists flavor_likes_public_write on public.flavor_likes;
create policy flavor_likes_public_write on public.flavor_likes
for insert to anon, authenticated
with check (true);

drop policy if exists flavor_likes_public_delete on public.flavor_likes;
create policy flavor_likes_public_delete on public.flavor_likes
for delete to anon, authenticated
using (true);

-- Trigger untuk update likes_count di flavors saat row di flavor_likes
-- ditambah/dihapus.
create or replace function public.tg_flavor_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.flavors
    set likes_count = likes_count + 1
    where id = NEW.flavor_id;
    return NEW;
  elsif TG_OP = 'DELETE' then
    update public.flavors
    set likes_count = greatest(0, likes_count - 1)
    where id = OLD.flavor_id;
    return OLD;
  end if;
  return null;
end;
$$;

drop trigger if exists tg_flavor_likes_count_ins on public.flavor_likes;
create trigger tg_flavor_likes_count_ins
after insert on public.flavor_likes
for each row execute function public.tg_flavor_likes_count();

drop trigger if exists tg_flavor_likes_count_del on public.flavor_likes;
create trigger tg_flavor_likes_count_del
after delete on public.flavor_likes
for each row execute function public.tg_flavor_likes_count();

-- RPC toggle like: insert kalau belum ada (like), delete kalau ada (unlike).
create or replace function public.flavor_toggle_like(
  p_flavor_id    bigint,
  p_session_id   text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existed boolean;
  v_count integer;
begin
  if p_flavor_id is null or p_session_id is null or length(p_session_id) = 0 then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  -- Cek apakah sudah like
  select exists (
    select 1 from public.flavor_likes
    where flavor_id = p_flavor_id and session_id = p_session_id
  ) into v_existed;

  if v_existed then
    delete from public.flavor_likes
    where flavor_id = p_flavor_id and session_id = p_session_id;
  else
    insert into public.flavor_likes (flavor_id, session_id)
    values (p_flavor_id, p_session_id);
  end if;

  -- Ambil counter terbaru
  select likes_count into v_count
  from public.flavors where id = p_flavor_id;

  return jsonb_build_object(
    'liked', not v_existed,
    'likes_count', coalesce(v_count, 0)
  );
end;
$$;

grant execute on function public.flavor_toggle_like(bigint, text) to anon, authenticated;

-- RPC ambil likes_count per flavor (untuk dashboard / counter di /order).
create or replace function public.public_flavor_likes_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'flavor_id', id, 'likes_count', likes_count
  )), '[]'::jsonb)
  from public.flavors
  where likes_count > 0;
$$;

grant execute on function public.public_flavor_likes_counts() to anon, authenticated;

-- Update public_menu: sertakan likes_count di flavor.
-- (definisi lengkap dari migration-11; di sini kita re-declare karena
-- kolom f.likes_count baru ada di tabel.)
create or replace function public.public_menu()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cats as (
    select jsonb_build_object(
      'id', c.id,
      'slug', c.slug,
      'name_id', c.name_id,
      'name_en', c.name_en,
      'desc_id', c.desc_id,
      'desc_en', c.desc_en,
      'image_url', c.image_url,
      'is_active', c.is_active,
      'is_featured', c.is_featured,
      'sort_order', c.sort_order,
      'stock_enabled', c.stock_enabled,
      'stock', c.stock,
      'flavors', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', f.id,
            'slug', f.slug,
            'name_id', f.name_id,
            'name_en', f.name_en,
            'desc_id', f.desc_id,
            'desc_en', f.desc_en,
            'price', f.price,
            'image_url', f.image_url,
            'is_active', f.is_active,
            'is_featured', f.is_featured,
            'sort_order', f.sort_order,
            'category_id', f.category_id,
            'stock_enabled', f.stock_enabled,
            'stock', f.stock,
            'likes_count', f.likes_count
          ) order by f.sort_order, f.id
        )
        from public.flavors f
        where f.category_id = c.id and f.is_active
      ), '[]'::jsonb),
      'bundles', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'category_id', b.category_id,
            'slug', b.slug,
            'name_id', b.name_id,
            'name_en', b.name_en,
            'desc_id', b.desc_id,
            'desc_en', b.desc_en,
            'price', b.price,
            'required_qty', b.required_qty,
            'image_url', b.image_url,
            'is_active', b.is_active,
            'is_featured', b.is_featured,
            'sort_order', b.sort_order
          ) order by b.sort_order, b.id
        )
        from public.bundles b
        where (b.category_id = c.id or b.category_id is null) and b.is_active
      ), '[]'::jsonb)
    ) as j
    from public.categories c
    where c.is_active
  ),
  standalone_bundles as (
    select jsonb_agg(
      jsonb_build_object(
        'id', b.id,
        'category_id', b.category_id,
        'slug', b.slug,
        'name_id', b.name_id,
        'name_en', b.name_en,
        'desc_id', b.desc_id,
        'desc_en', b.desc_en,
        'price', b.price,
        'required_qty', b.required_qty,
        'image_url', b.image_url,
        'is_active', b.is_active,
        'is_featured', b.is_featured,
        'sort_order', b.sort_order
      ) order by b.sort_order, b.id
    ) as j
    from public.bundles b
    where b.category_id is null and b.is_active
  )
  select jsonb_build_object(
    'categories', coalesce((select jsonb_agg(j order by (j->>'sort_order')::int, (j->>'id')::int) from cats), '[]'::jsonb),
    'bundles', coalesce((select j from standalone_bundles), '[]'::jsonb)
  );
$$;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');