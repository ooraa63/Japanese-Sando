-- =============================================================================
--  MIGRASI 41 — Menu Profil dinamis (bar menu + isi popup, diatur penjual)
--
--  Permintaan Steven (10-10-2026): tab paling kanan di bottom nav bukan
--  halaman, tapi membuka daftar bar (Account, Contact Us, FAQ, dst). Kalau
--  sebuah bar ditekan, barulah muncul popup berisi isinya. Dan semua bar itu
--  bisa ditambah / diubah / diurutkan / dimatikan oleh penjual dari dashboard.
--
--  Kenapa tabel, bukan satu kolom jsonb di store_settings?
--  Karena tiap bar butuh (a) judul & isi dua bahasa, (b) urutan, (c) status
--  aktif, dan (d) bisa dihapus sendiri tanpa mengubah bar lain. Kalau disimpan
--  sebagai satu JSON, menambah/menghapus bar berarti menulis ulang seluruh
--  dokumen dan prone race kalau dashboard dibuka dari dua perangkat.
--
--  Yang DISIMPAN sebagai JSON hanya `buttons` (daftar tombol di dalam popup),
--  karena bentuknya bebas dan tidak butuh ditanyakan ke database.
-- =============================================================================


-- 1. Tabel
create table if not exists public.profile_menu_items (
  id          bigint generated always as identity primary key,
  -- Kunci stably: 'account' punya perilaku khusus (buka form login),
  -- sisanya cuma menampilkan isi popup apa adanya.
  code        text not null unique,
  -- Nama ikon lucide, dipetakan di frontend (whitelist).
  icon        text not null default 'HelpCircle',
  title_id    text not null,
  title_en    text not null default '',
  -- Isi popup. Boleh kosong — kalau kosong DAN tidak ada tombol, popup
  -- menampilkan catatan "belum diisi" daripada halaman kosong.
  body_id     text not null default '',
  body_en     text not null default '',
  -- Array: [{"label_id":"...","label_en":"...","href":"https://..."}]
  buttons     jsonb not null default '[]'::jsonb,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profile_menu_items is
  'Bar menu di sheet Profil (bottom nav). Kelola dari dashboard: Admin > Menu Profil.';
comment on column public.profile_menu_items.code is
  'Kunci perilaku. ''account'' = bar khusus yang membuka form login; kode lain bebas.';
comment on column public.profile_menu_items.buttons is
  'Daftar tombol di popup. Bentuk: [{"label_id","label_en","href"}].';


-- 2. Jaga bentuk data: buttons harus array, judul id wajib ada.
--    Urutannya: bersihkan dulu, baru pasang constraint.
update public.profile_menu_items
   set buttons = '[]'::jsonb
 where buttons is null or jsonb_typeof(buttons) <> 'array';

update public.profile_menu_items
   set title_id = btrim(coalesce(nullif(btrim(title_id), ''), title_en, code))
 where btrim(coalesce(title_id, '')) = '';

alter table public.profile_menu_items
  drop constraint if exists profile_menu_items_buttons_array;

alter table public.profile_menu_items
  add constraint profile_menu_items_buttons_array
  check (jsonb_typeof(buttons) = 'array');

alter table public.profile_menu_items
  drop constraint if exists profile_menu_items_title_id_present;

alter table public.profile_menu_items
  add constraint profile_menu_items_title_id_present
  check (btrim(title_id) <> '');


-- 3. Trigger updated_at (pakai fungsi yang sudah ada)
drop trigger if exists profile_menu_items_touch on public.profile_menu_items;
create trigger profile_menu_items_touch before update on public.profile_menu_items
  for each row execute function public.touch_updated_at();


-- 4. RLS
alter table public.profile_menu_items enable row level security;

-- Pembaca (anon) hanya boleh melihat bar yang aktif.
drop policy if exists profile_menu_items_public_read on public.profile_menu_items;
create policy profile_menu_items_public_read on public.profile_menu_items
  for select to anon, authenticated
  using (is_active);

drop policy if exists profile_menu_items_admin_all on public.profile_menu_items;
create policy profile_menu_items_admin_all on public.profile_menu_items
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- 5. RPC publik untuk frontend
--    Dipakai juga oleh server component (getProfileMenuItems), supaya
--    tidak perlu tabel langsung (RLS anon read juga sudah cukup, tapi RPC
--    ini konsisten dengan pola `public_*` yang dipakai project ini).
create or replace function public.public_profile_menu()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
begin
  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'code', m.code,
        'icon', m.icon,
        'title_id', m.title_id,
        'title_en', m.title_en,
        'body_id', m.body_id,
        'body_en', m.body_en,
        'buttons', m.buttons,
        'sort_order', m.sort_order,
        'is_active', m.is_active
      ) order by m.sort_order, m.id
    )
    from public.profile_menu_items m
    where m.is_active
  ), '[]'::jsonb);
end;
$$;


-- 6. RPC admin: simpan satu bar (insert atau update)
create or replace function public.admin_save_profile_menu_item(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    bigint := nullif(p_payload ->> 'id', '')::bigint;
  v_code  text;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_code := lower(btrim(coalesce(p_payload ->> 'code', '')));
  if v_code = '' or v_code !~ '^[a-z0-9_-]{2,32}$' then
    raise exception 'invalid_code' using errcode = '22023';
  end if;

  v_title := btrim(coalesce(p_payload ->> 'title_id', ''));
  if v_title = '' then
    v_title := btrim(coalesce(p_payload ->> 'title_en', ''));
  end if;
  if v_title = '' then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  v_title := left(v_title, 80);

  -- 'account' tidak boleh diduplikasi jadi dua bar: perilakunya khusus.
  if v_code = 'account' and exists (
    select 1 from public.profile_menu_items
    where code = 'account' and (v_id is null or id <> v_id)
  ) then
    raise exception 'code_taken' using errcode = '22023';
  end if;

  if v_id is not null then
    update public.profile_menu_items set
      code       = v_code,
      icon       = left(coalesce(nullif(btrim(p_payload ->> 'icon'), ''), 'HelpCircle'), 40),
      title_id   = v_title,
      title_en   = left(coalesce(p_payload ->> 'title_en', ''), 80),
      body_id    = left(coalesce(p_payload ->> 'body_id', ''), 2000),
      body_en    = left(coalesce(p_payload ->> 'body_en', ''), 2000),
      buttons    = case when jsonb_typeof(p_payload -> 'buttons') = 'array'
                        then p_payload -> 'buttons' else '[]'::jsonb end,
      sort_order = coalesce((p_payload ->> 'sort_order')::integer, 0),
      is_active  = coalesce((p_payload ->> 'is_active')::boolean, true)
    where id = v_id
    returning id into v_id;
  else
    insert into public.profile_menu_items (
      code, icon, title_id, title_en, body_id, body_en, buttons, sort_order, is_active
    ) values (
      v_code,
      left(coalesce(nullif(btrim(p_payload ->> 'icon'), ''), 'HelpCircle'), 40),
      v_title,
      left(coalesce(p_payload ->> 'title_en', ''), 80),
      left(coalesce(p_payload ->> 'body_id', ''), 2000),
      left(coalesce(p_payload ->> 'body_en', ''), 2000),
      case when jsonb_typeof(p_payload -> 'buttons') = 'array'
           then p_payload -> 'buttons' else '[]'::jsonb end,
      coalesce((p_payload ->> 'sort_order')::integer, 0),
      coalesce((p_payload ->> 'is_active')::boolean, true)
    )
    returning id into v_id;
  end if;

  if v_id is null then
    raise exception 'invalid_payload' using errcode = '22023';
  end if;

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;


-- 7. RPC admin: hapus satu bar
create or replace function public.admin_delete_profile_menu_item(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.profile_menu_items where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;


-- 8. RPC admin: daftar semua bar (termasuk yang nonaktif) untuk dashboard
create or replace function public.admin_list_profile_menu_items()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'code', m.code,
          'icon', m.icon,
          'title_id', m.title_id,
          'title_en', m.title_en,
          'body_id', m.body_id,
          'body_en', m.body_en,
          'buttons', m.buttons,
          'sort_order', m.sort_order,
          'is_active', m.is_active
        ) order by m.sort_order, m.id
      )
      from public.profile_menu_items m
    ), '[]'::jsonb)
  );
end;
$$;


-- =============================================================================
--  9. Data awal
--
--  Kontak & jam diambil dari store_settings supaya sheet Profil langsung
--  berguna begitu fitur ini hidup — tidak kosong sampai penjual mengisinya.
--  Penjual tetap bisa mengedit semuanya setelahnya.
-- =============================================================================
insert into public.profile_menu_items (code, icon, title_id, title_en, body_id, body_en, buttons, sort_order, is_active)
values
  ('account', 'UserCircle', 'Akun Saya', 'My Account', '', '', '[]'::jsonb, 10, true),
  ('contact', 'MessageCircle', 'Hubungi Kami', 'Contact Us',
   coalesce((select 'Alamat: ' || address || e'\n\nJam buka: ' || hours_id from public.store_settings where id = 1), ''),
   coalesce((select 'Address: ' || address || e'\n\nOpening hours: ' || coalesce(hours_en, hours_id) from public.store_settings where id = 1), ''),
   coalesce((
     select jsonb_build_array(jsonb_build_object(
       'label_id', 'Chat WhatsApp',
       'label_en', 'Chat on WhatsApp',
       'href', 'https://wa.me/' || regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g')
     ))
     from public.store_settings
     where id = 1 and regexp_replace(coalesce(whatsapp, ''), '\D', '', 'g') <> ''
   ), '[]'::jsonb),
   20, true),
  ('faq', 'HelpCircle', 'FAQ', 'FAQ',
   'Tanya yang sering muncul soal pre-order, ongkir, dan pembayaran bisa ditanyakan lewat WhatsApp.',
   'Questions about pre-order, delivery and payment can be asked on WhatsApp.',
   '[]'::jsonb, 30, true),
  ('hours', 'Clock', 'Jam Buka', 'Opening Hours',
   coalesce((select hours_id from public.store_settings where id = 1), ''),
   coalesce((select coalesce(hours_en, hours_id) from public.store_settings where id = 1), ''),
   '[]'::jsonb, 40, true),
  ('terms', 'FileText', 'Syarat & Ketentuan', 'Terms & Conditions',
   'Pesanan dibuat setelah pembayaran dikonfirmasi. Pesanan yang belum dibayar sebelum batas waktu akan dibatalkan otomatis.',
   'An order is created once payment is confirmed. Unpaid orders past the deadline are automatically cancelled.',
   '[]'::jsonb, 50, true)
on conflict (code) do nothing;


-- =============================================================================
--  Segarkan cache PostgREST
-- =============================================================================
notify pgrst, 'reload schema';
select pg_notify('pgrst', 'reload schema');