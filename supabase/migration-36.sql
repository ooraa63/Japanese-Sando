-- ============================================================================
-- MIGRATION 36 — Admin bundle: dukung kolom compare_price (harga coret)
-- ============================================================================
-- Migration-34 menambah kolom `bundles.compare_price` dan migration-35
-- mengirimkannya ke `public_menu()` (sisi pembeli). Sisi admin belum bisa
-- menulis / membacanya:
--   - `admin_save_bundle` tidak menerima key `compare_price`, jadi kolomnya
--     selalu null walau admin mengisinya.
--   - `admin_list_bundles` tidak mengirimkannya, jadi form admin tidak
--     bisa menampilkan nilai lama.
-- Keduanya dibuat ulang di sini dengan dukungan compare_price.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. admin_list_bundles — kirim compare_price
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_bundles()
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
    select coalesce(jsonb_agg(
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
    ), '[]'::jsonb)
    from public.bundles b
  );
end;
$$;

comment on function public.admin_list_bundles() is
  'Admin: daftar semua bundle. Termasuk compare_price (harga coret) sejak migration-36.';


-- ---------------------------------------------------------------------------
-- 2. admin_save_bundle — terima & simpan compare_price
--    Aturan: kalau diisi, harus > price. Kalau tidak ada / <= price, kolom
--    disimpan NULL supaya UI tidak menampilkan coretan yang nggak masuk akal.
--    Kalau key-nya tidak ada sama sekali (payload lama / toggle cepat), nilai
--    yang tersimpan dipertahankan.
-- ---------------------------------------------------------------------------
create or replace function public.admin_save_bundle(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id        bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_slug      text;
  v_name      text;
  v_price     integer;
  v_compare   integer;
  v_qty       integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := btrim(coalesce(p_payload ->> 'name_id', ''));
  if v_name = '' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  v_price := nullif(p_payload ->> 'price', '')::integer;
  if v_price is null or v_price < 0 then
    raise exception 'invalid_price' using errcode = '22023';
  end if;

  -- Harga coret hanya valid kalau lebih besar dari harga jual.
  v_compare := nullif(p_payload ->> 'compare_price', '')::integer;
  if v_compare is not null and v_compare <= v_price then
    v_compare := null;
  end if;

  v_qty := nullif(p_payload ->> 'required_qty', '')::integer;
  if v_qty is null or v_qty < 1 then
    raise exception 'invalid_quantity' using errcode = '22023';
  end if;

  v_slug := trim(both '-' from
    regexp_replace(lower(coalesce(nullif(btrim(coalesce(p_payload ->> 'slug', '')), ''), v_name)),
                   '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then
    v_slug := 'bundle-' || substr(md5(random()::text), 1, 6);
  end if;

  if v_id is not null then
    if exists (select 1 from public.bundles where slug = v_slug and id <> v_id) then
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    end if;

    update public.bundles set
      category_id  = nullif(p_payload ->> 'category_id', '')::bigint,
      slug         = v_slug,
      name_id      = v_name,
      name_en      = coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      desc_id      = coalesce(p_payload ->> 'desc_id', ''),
      desc_en      = coalesce(p_payload ->> 'desc_en', ''),
      price        = v_price,
      compare_price = case when p_payload ? 'compare_price' then v_compare
                           else compare_price end,
      required_qty = v_qty,
      image_url    = case when p_payload ? 'image_url'
                          then nullif(trim(coalesce(p_payload ->> 'image_url', '')), '')
                          else image_url end,
      is_active    = coalesce((p_payload ->> 'is_active')::boolean, true),
      is_featured  = coalesce((p_payload ->> 'is_featured')::boolean, false),
      sort_order   = coalesce((p_payload ->> 'sort_order')::integer, 0)
    where id = v_id
    returning id into v_id;
  else
    if exists (select 1 from public.bundles where slug = v_slug) then
      raise exception 'slug_taken' using errcode = '22023';
    end if;

    insert into public.bundles (
      category_id, slug, name_id, name_en, desc_id, desc_en,
      price, compare_price, required_qty, image_url, is_active, is_featured, sort_order
    ) values (
      nullif(p_payload ->> 'category_id', '')::bigint,
      v_slug, v_name,
      coalesce(nullif(btrim(coalesce(p_payload ->> 'name_en', '')), ''), v_name),
      coalesce(p_payload ->> 'desc_id', ''),
      coalesce(p_payload ->> 'desc_en', ''),
      v_price, v_compare, v_qty,
      nullif(trim(coalesce(p_payload ->> 'image_url', '')), ''),
      coalesce((p_payload ->> 'is_active')::boolean, true),
      coalesce((p_payload ->> 'is_featured')::boolean, false),
      coalesce((p_payload ->> 'sort_order')::integer, 0)
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  return jsonb_build_object('id', v_id, 'slug', v_slug);
end;
$$;

comment on function public.admin_save_bundle(jsonb) is
  'Admin: simpan bundle. comparaison: key compare_price opsional — hanya dipakai '
  'kalau nilainya > price, selain itu disimpan NULL. Key yang tidak dikirim '
  'mempertahankan nilai lama (dipakai toggle cepat di admin).';

notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');