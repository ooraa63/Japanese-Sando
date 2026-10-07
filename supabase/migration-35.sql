-- ============================================================================
-- MIGRATION 35 — Bundle: harga coret (compare_price) masuk ke public_menu()
-- ============================================================================
-- Migration-34 menambah kolom `bundles.compare_price`. Kolomnya belum
-- dikembalikan oleh RPC `public_menu()`, jadi frontend tidak bisa menampilkan
-- harga asal dicoret. Di sini public_menu() dibuat ulang dengan
-- `compare_price` pada kedua posisi bundle:
--   1. bundle yang menempel ke kategori (di dalam tiap kategori)
--   2. bundle standalone (top-level)
-- ============================================================================


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
            'compare_price', b.compare_price,
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
        'compare_price', b.compare_price,
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

comment on function public.public_menu() is
  'Menu publik: kategori + flavor + bundle. Bundle ikut mengembalikan compare_price (harga coret) sejak migration-35.';

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');