-- ============================================================================
-- MIGRASI 26 — Admin CRUD untuk vouchers
-- ----------------------------------------------------------------------------
-- migration-24 sudah buat tabel vouchers + RPC list_my_vouchers().
-- Sekarang tambah RPC admin untuk CRUD.
-- ============================================================================

create or replace function public.admin_list_vouchers(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_total bigint;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.vouchers v
  where (p_search is null or btrim(p_search) = ''
         or v.code ilike '%' || p_search || '%'
         or v.label_id ilike '%' || p_search || '%'
         or v.label_en ilike '%' || p_search || '%');

  return jsonb_build_object(
    'vouchers', coalesce((
      select jsonb_agg(to_jsonb(v))
      from (
        select v.id, v.code, v.customer_id, v.type, v.value,
               v.label_id, v.label_en, v.expires_at, v.is_active,
               v.used_at, v.order_id, v.created_at
        from public.vouchers v
        where (p_search is null or btrim(p_search) = ''
               or v.code ilike '%' || p_search || '%'
               or v.label_id ilike '%' || p_search || '%'
               or v.label_en ilike '%' || p_search || '%')
        order by v.created_at desc
        limit greatest(1, least(p_limit, 200))
        offset greatest(0, p_offset)
      ) v
    ), '[]'::jsonb),
    'total', v_total
  );
end;
$$;

create or replace function public.admin_upsert_voucher(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_row public.vouchers%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_id := nullif(p_payload->>'id', '')::bigint;

  if v_id is null then
    insert into public.vouchers (
      code, customer_id, type, value,
      label_id, label_en, expires_at, is_active
    ) values (
      trim(p_payload->>'code'),
      nullif(p_payload->>'customer_id', '')::uuid,
      p_payload->>'type',
      coalesce(p_payload->'value', '{}'::jsonb),
      trim(p_payload->>'label_id'),
      trim(p_payload->>'label_en'),
      nullif(p_payload->>'expires_at', '')::timestamptz,
      coalesce((p_payload->>'is_active')::boolean, true)
    )
    returning * into v_row;
  else
    update public.vouchers set
      code = trim(p_payload->>'code'),
      customer_id = nullif(p_payload->>'customer_id', '')::uuid,
      type = p_payload->>'type',
      value = coalesce(p_payload->'value', '{}'::jsonb),
      label_id = trim(p_payload->>'label_id'),
      label_en = trim(p_payload->>'label_en'),
      expires_at = nullif(p_payload->>'expires_at', '')::timestamptz,
      is_active = coalesce((p_payload->>'is_active')::boolean, true)
    where id = v_id
    returning * into v_row;

    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'code', v_row.code,
    'customer_id', v_row.customer_id,
    'type', v_row.type,
    'value', v_row.value,
    'label_id', v_row.label_id,
    'label_en', v_row.label_en,
    'expires_at', v_row.expires_at,
    'is_active', v_row.is_active,
    'used_at', v_row.used_at,
    'order_id', v_row.order_id,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.admin_delete_voucher(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  delete from public.vouchers where id = p_id;
  return found;
end;
$$;

comment on function public.admin_list_vouchers(text, integer, integer) is 'Admin: daftar voucher (filter + pagination).';
comment on function public.admin_upsert_voucher(jsonb) is 'Admin: insert/update voucher.';
comment on function public.admin_delete_voucher(bigint) is 'Admin: hapus voucher.';