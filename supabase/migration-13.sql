-- ============================================================================
--  MIGRASI 13 — Popup announcement untuk pelanggan
-- ----------------------------------------------------------------------------
-- Tabel `announcements` memungkinkan penjual membuat beberapa popup
-- (iklan/promo) dengan foto + tulisan. Popup pertama yang aktif muncul
-- otomatis di homepage pembeli dengan tombol "Lihat" / "Tutup".
-- Pembeli bisa menutup (disimpan per session di localStorage).
-- ============================================================================

create table if not exists public.announcements (
  id           bigserial primary key,
  title        text        not null default '',
  body_md      text        not null default '',
  image_url    text,
  cta_label    text,
  cta_href     text,
  is_active    boolean     not null default true,
  sort_order   integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists announcements_active_sort
  on public.announcements (is_active, sort_order, id);

drop trigger if exists announcements_touch on public.announcements;
create trigger announcements_touch before update on public.announcements
for each row execute function public.touch_updated_at();

alter table public.announcements enable row level security;

drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements
for select using (is_active or public.is_admin());

drop policy if exists announcements_admin_write on public.announcements;
create policy announcements_admin_write on public.announcements
for all using (public.is_admin()) with check (public.is_admin());

-- RPC publik: ambil popup yang aktif, urut sort_order + created_at desc.
create or replace function public.public_list_announcements()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'title', a.title,
    'body_md', a.body_md,
    'image_url', a.image_url,
    'cta_label', a.cta_label,
    'cta_href', a.cta_href,
    'sort_order', a.sort_order,
    'created_at', a.created_at
  )), '[]'::jsonb)
  from public.announcements a
  where a.is_active
  order by a.sort_order asc, a.created_at desc;
$$;

grant execute on function public.public_list_announcements() to anon, authenticated;


-- RPC admin untuk CRUD announcement.
create or replace function public.admin_list_announcements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'body_md', a.body_md,
      'image_url', a.image_url,
      'cta_label', a.cta_label,
      'cta_href', a.cta_href,
      'is_active', a.is_active,
      'sort_order', a.sort_order,
      'created_at', a.created_at
    ) order by a.sort_order, a.id), '[]'::jsonb)
    from public.announcements a
  );
end;
$$;

create or replace function public.admin_save_announcement(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_title text;
  v_image text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_title := btrim(coalesce(p_payload ->> 'title', ''));
  if v_title = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_image := nullif(trim(coalesce(p_payload ->> 'image_url', '')), '');

  if v_id is not null then
    update public.announcements set
      title      = v_title,
      body_md    = coalesce(p_payload ->> 'body_md', ''),
      image_url  = v_image,
      cta_label  = nullif(trim(coalesce(p_payload ->> 'cta_label', '')), ''),
      cta_href   = nullif(trim(coalesce(p_payload ->> 'cta_href', '')), ''),
      is_active  = coalesce((p_payload ->> 'is_active')::boolean, true),
      sort_order = coalesce((p_payload ->> 'sort_order')::integer, 0)
    where id = v_id
    returning id into v_id;
  else
    insert into public.announcements (
      title, body_md, image_url, cta_label, cta_href, is_active, sort_order
    ) values (
      v_title,
      coalesce(p_payload ->> 'body_md', ''),
      v_image,
      nullif(trim(coalesce(p_payload ->> 'cta_label', '')), ''),
      nullif(trim(coalesce(p_payload ->> 'cta_href', '')), ''),
      coalesce((p_payload ->> 'is_active')::boolean, true),
      coalesce((p_payload ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.admin_delete_announcement(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.announcements where id = p_id;
  return jsonb_build_object('deleted', true);
end;
$$;

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');