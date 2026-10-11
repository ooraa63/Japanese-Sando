# Decisions — Keputusan Teknis

Daftar keputusan arsitektur / teknis yang sudah diambil, beserta
alasan dan konsekuensinya. Supaya AI session berikutnya tidak
membatalkan keputusan tanpa sengaja.

---

## D1. State management cart pakai `useSyncExternalStore` + localStorage

**Keputusan:** Cart state di `src/components/customer/CartProvider.tsx`
pakai `useSyncExternalStore` (bukan `useState` + `useEffect`).

**Alasan:**

- Persisten di localStorage (key `js_cart_v1`) — pembeli tidak
  kehilangan pesanan saat refresh / close tab.
- Tidak ada cascading render saat sinkronisasi localStorage.
- Render pertama di server tetap konsisten (no hydration mismatch)
  karena `getServerSnapshot()` return `EMPTY_STORE` yang stabil.

**Konsekuensi:**

- Untuk update state, panggil `write({...store, ...})` — jangan
  mutate `store` langsung.
- Baca via `useCart()` hook, bukan import `store` langsung.

---

## D2. External store (font-size density) pakai pola sama dengan cart

**Keputusan:** `FontSizeProvider` pakai pola yang sama dengan
`CartProvider` (`useSyncExternalStore` + localStorage).

**Alasan:** Konsistensi + reuse pola yang sudah battle-tested.

**Konsekuensi:** Kalau ada perubahan pola cart (mis. migrasi ke
IndexedDB), terapkan juga ke FontSizeProvider.

---

## D3. Bundle data: top-level + per-kategori, digabung di server

**Keputusan:** `getPublicMenu()` di `src/lib/data.ts` merge bundle
dari `categories[].bundles` (per-kategori) + top-level `bundles`
(berdiri sendiri), dedupe by id, dan buang field `bundles`
per-kategori dari output.

**Alasan:**

- RPC `public_menu()` di Supabase return dua sumber (lihat
  `gotchas.md` #4) — frontend tidak perlu tahu.
- Kalau ada 5 bundle berdiri sendiri dan 3 kategori, query SQL
  tanpa filter ketat akan duplicate. Merge di server lebih efisien
  daripada tiap komponen merge.
- Komponen client (`OrderMenuBrowser`, `MenuBrowser`) tinggal
  terima satu list bundle.

**Konsekuensi:**

- Tipe `Category` di `src/lib/types.ts` masih punya `bundles?:
  Bundle[]` untuk backward-compat, tapi `getPublicMenu()` strip
  field itu sebelum return.
- Kalau menambah field bundle baru, update `getPublicMenu()` agar
  field baru diteruskan.

---

## D4. Bundle selection lewat modal `{required_qty}` slot

**Keputusan:** Bundle ditampilkan sebagai kartu di section "Paket
hemat" di atas section "Pilih kategori". Klik kartu → modal dengan
N slot (sesuai `bundle.required_qty`) → tiap slot pilih flavor
(chip button) → klik Konfirmasi → bundle masuk keranjang.

**Alasan:**

- Backend `create_order(p_bundles)` mewajibkan `slots.length ===
  bundle.required_qty` dengan semua slot terisi. UI harus facilitate
  ini tanpa paksa buyer hitung manual.
- Modal pattern sudah dipakai untuk `OrderCategoryModal` (pilih
  flavor per kategori), jadi konsisten.
- Tiap slot independen — buyer boleh pilih rasa yang sama di 2 slot
  kalau mau (validasi backend tidak melarang duplicate flavor).

**Alternatif yang ditolak:**

- Tombol "Pilih N flavor" inline tanpa modal — flow jadi berat di
  mobile karena layar kecil.
- Otomatis isi dari cart (mis. "ambil 2 flavor pertama yang
  ditambah") — buyer kehilangan kontrol dan bingung.

---

## D5. Density mode: 2 level (normal / compact), mobile only

**Keputusan:** Toggle font-size di mobile punya 2 level, bukan 3
atau slider. Aturan CSS hanya aktif `@media (max-width: 639px)`.

**Alasan:**

- User minta "kecilkan font jg kyk pilihan la biar mungkin
  gambarnya bs jadi kecil jadi dalam 1 baris bisa ada 2/3 gt".
  Pilihan 2 level (normal / compact) paling simpel dan cukup.
- Desktop (≥ 640px) layout sudah pas, mode compact tidak perlu
  mempengaruhi — kalau desktop juga dipaksa compact, layout
  mungkin rusak di breakpoint yang lebih besar.

**Konsekuensi:**

- Kalau suatu saat butuh mode ketiga (mis. "large" untuk
  accessibility), extend `DensityMode` union di
  `FontSizeProvider.tsx` dan tambah aturan CSS.
- Pakai `data-density` attribute di `<html>` (bukan `class`) supaya
  tidak konflik dengan class utility Tailwind lain.

---

## D6. Step "menu" OrderFlow tidak auto-redirect ke step "menu" dari query

**Keputusan:** OrderFlow selalu mulai dari step `"identity"`. Tidak
ada deep-link / query param untuk loncat ke step tertentu.

**Alasan:**

- Pembeli tidak bisa skip isi identitas (nama, telepon, email, IG)
  karena data ini wajib untuk kontak & invoice.
- Bundle section ada di step "menu", tapi banner info di step
  "identity" sudah kasih teaser supaya user tahu ada bundle.

**Konsekuensi:**

- Pembeli yang "cuma mau lihat-lihat bundle" harus isi form dulu.
  Trade-off yang kami terima.

---

## D7. Tidak ada migrasi DB baru untuk fitur bundle

**Keputusan:** Fitur bundle di frontend dipakai DB schema + RPC
yang sudah ada (dari `migration-11.sql` dan `migration-12.sql`).
Tidak ada migration baru.

**Alasan:** Backend sudah support dari awal. Bundle di admin sudah
bisa dibuat jauh sebelum fitur pre-order ini.

**Konsekuensi:** Kalau deploy ke environment baru, pastikan
`migration-11.sql` dan `migration-12.sql` sudah dijalankan.

---

## D8. Folder `MEMORY/` di-commit ke repo

**Keputusan:** Folder `MEMORY/` ada di root project dan **di-commit**
(bukan di-ignore).

**Alasan:**

- AI session berikutnya perlu akses ke memory ini.
- Memory ini adalah dokumentasi project, sama seperti README.
- Pattern memory bank sudah umum untuk project AI-assisted.

**Konsekuensi:**

- Update `MEMORY/CHANGELOG.md` setiap ada perubahan signifikan.
- Jangan taruh informasi sensitif (API key, password, dsb.) di sini.


---

## D9. Akun buyer pakai Supabase Auth (bukan auth custom)

**Keputusan:** Buyer yang daftar di /register dibuat di `auth.users` lewat
`supabase.auth.signUp()` (anon key). Profil tambahan (nama, telepon, IG)
disimpan di tabel `customer_profiles` (1:1 dengan `auth.users`) lewat RPC
`customer_upsert_own_profile` (security definer).

**Alasan:**

- Admin sudah pakai Supabase Auth dengan pola yang sama (lihat
  `grantAdminRoleAction` di admin/actions.ts). Konsistensi.
- Magic link, reset password, RLS, semuanya sudah built-in — tidak perlu
  roll JWT.

**Konsekuensi:**

- Supabase project HARUS non-aktifkan "Confirm email" supaya signup tanpa
  verifikasi. Kalau tidak, `data.session` null di signup dan `customer_profiles`
  tidak terisi.
- Admin & customer dipisah dengan tegas: `admins` (role) vs
  `customer_profiles` (identitas). RLS berbeda untuk tiap tabel.


---

## D10. Auto-fill identitas OrderFlow hanya saat field masih kosong

**Keputusan:** Saat `useCustomerAuth().profile` tersedia, `OrderFlow`
auto-fill `draft.name / phone / instagram` dari profil — SELAMA field di
draft kosong. Perubahan manual user dihormati.

Ref `autoFilledFromRef` menandai sudah auto-fill untuk user_id tertentu;
kalau akun berganti, auto-fill jalan lagi.

**Alasan:**

- Pembeli yang sering order tidak harus ketik ulang identitas tiap kali.
- Pembeli yang perlu update (mis. ganti nomor telepon) bisa edit field;
  auto-fill berikutnya tidak akan overwrite.

**Konsekuensi:**

- Kalau profil di-update di /account, perubahan baru akan auto-fill di
  pre-order berikutnya (bukan pre-order yang sedang dibuka).
- Backend create_order selalu baca dari `auth.uid()` (bukan dari field
  input), jadi integritas order ↔ akun tidak bisa dimanipulasi.


---

## D11. Guest checkout tetap didukung, tanpa friction

**Keputusan:** `orders.user_id` nullable. Pembeli yang tidak login tetap
bisa checkout seperti biasa. `create_order` jalan dengan `p_user_id = null`
dan `auth.uid() = null`; backend tidak error.

**Alasan:**

- User minta "bisa ada akun atau login as guest". Guest adalah default;
  akun adalah opsional. Tidak boleh ada friction untuk user yang cuma
  pesan sekali.

**Konsekuensi:**

- Halaman `customer_order()` RPC hanya return order dengan
  `user_id = auth.uid()`. Guest order tidak pernah muncul di akun
  customer manapun — bahkan kalau dia register dengan email yang sama,
  order lama tetap tidak terkait (kami tidak melakukan backfill otomatis).
- Kalau guest register dengan email yang sama dengan order sebelumnya,
  order lama tidak akan muncul di `/account` customer baru. Backfill
  manual bisa ditambahkan jika perlu.

---

## D12 — Midtrans QRIS Dinamis sebagai payment method opsional

**Keputusan:** Integrasi Midtrans (QRIS Dinamis via Snap API) sudah
di-commit, tapi **dorman secara default**. Opsi "QRIS via Midtrans" di
payment step hanya muncul bila `isMidtransConfigured()` return true
(env `MIDTRANS_SERVER_KEY` ter-set).

**Alasan:**

- Payment lain sudah jalan (Transfer Bank manual + QRIS Statis dari admin).
  Midtrans adalah **upgrade opsional**, bukan hard dependency.
- Aktivasi menunggu **keputusan klien** (apakah mau lanjut pakai Midtrans,
  atau ganti gateway lain seperti Xendit/Tripay).
- Akun Midtrans yang sudah ada = akun developer (sandbox). Klien akan
  swap credentials saat production.

**Konsekuensi:**

- Code dormant tidak bocor: tidak ada HTTP call ke Midtrans API, opsi
  tidak muncul di UI, webhook route idle.
- Saat aktivasi nanti: tinggal set env + set webhook URL di dashboard
  Midtrans, tidak perlu code change.
- Status order Midtrans (settlement/expire/cancel/deny) di-map ke enum
  internal `pending | paid | expired | failed`. Webhook = source of truth,
  polling 5s sebagai backup.

---


---

## D13 — QRIS Statis dihapus dari UI (sekarang hanya Transfer Bank + QRIS Midtrans)

**Keputusan:** Hapus semua referensi UI untuk metode `"qris_static"`. User
sekarang cuma melihat **Transfer Bank** (BCA/Mandiri/dll) + **QRIS via
Midtrans** (dynamic, auto-confirm).

**Alasan:**

- QRIS Statis butuh admin upload gambar + konfirmasi manual tiap order
  via WA — overhead operasional gak sebanding dengan conversion.
- QRIS Dinamis auto-confirm via Midtrans webhook + polling, gak perlu
  admin intervensi.
- Simplify: 2 metode doang, lebih jelas untuk customer.

**Konsekuensi:**

- `PaymentMethod` type = `"transfer" | "qris_midtrans"` (sebelumnya
  termasuk `qris_static`).
- Customer tidak bisa pilih static QR di `/order` lagi.
- Admin tidak bisa enable `qris_enabled` toggle di `/admin/settings` lagi.
- DB masih allow `payment_method='qris_static'` di constraint (backward
  compat untuk old orders); gak ada cara bikin order baru dengan value
  itu dari UI.
- Store_settings masih punya kolom `qris_enabled` & `qris_image_url`
  (gak di-drop, biar gak perlu migration). Kalau klien mau bener-bener
  bersih, butuh migration ALTER TABLE ... DROP COLUMN.

---

## D14 — Cart step pakai sessionStorage (bukan localStorage)

**Keputusan:** `OrderFlow.tsx` simpan state `step` (`identity | menu |
payment | review`) di sessionStorage. Cart items tetap di localStorage
(key `js_cart_v1`).

**Alasan:**

- sessionStorage scoped per-tab dan auto-cleared saat tab ditutup.
  Kalau pakai localStorage, lalu user buka tab baru, mereka akan
  tiba-tiba di step "Payment" padahal baru buka pertama kali — confusing.
- Cart items perlu persist antar-tab (buyer minta supaya keranjang gak
  hilang kalau accidentally close tab), jadi tetap di localStorage.

**Konsekuensi:**

- `useEffect` pertama di OrderFlow: `sessionStorage.getItem('js_order_step')`
  → setStep kalau ada. Setiap step change, `setItem('js_order_step', step)`.
- Saat component unmount (route change), `removeItem` + `cart.reset()`.
  Privacy: data identitas (nama, telepon, IG) gak kesimpan ke pre-order
  berikutnya.

---

## D15 — Mobile bottom nav disembunyikan di flow tertentu

**Keputusan:** `MobileBottomNav` hidden di route
`/admin`, `/login`, `/register`, `/account`, `/order/success`,
`/order/track`.

**Alasan:**

- Bottom nav adalah "selalu terlihat" — kalau muncul di flow
  registrasi / login, user bisa salah tap & kehilangan state.
- Track & success pages biasanya auto-focus ke kode pesanan — bottom
  nav nganggu. Seller dashboard juga hidden karena admin punya
  sidebar sendiri.

**Konsekuensi:** Kalau mau reach halaman detail yang butuh nav (mis.
  halaman admin), buka lewat sidebar admin atau URL langsung.

---

## D16 — Sales mutasi dihitung hanya untuk status accepted/ready/delivered

**Keputusan:** RPC `admin_list_mutasi` hitung revenue + summary hanya
dari pesanan berstatus `accepted`, `ready`, atau `delivered`.

**Alasan:**

- `pending` = belum dikonfirmasi penjual, jangan dihitung sebagai revenue.
- `rejected` & `cancelled` = pesanan batal, stok dikembalikan.
- `accepted` = penjual sudah konfirmasi, stok dipesan.
- `ready` = sudah dimasak, tinggal diambil.
- `delivered` = sudah selesai.

**Konsekuensi:**

- Halaman Mutasi cocok untuk laporan keuangan & analisis penjualan.
- Tidak ada "double counting" dari order yang ditolak lalu dibuat baru.
- Filter per-rasa pakai EXISTS di order_items.flavor_id (bukan join),
  supaya order dengan 0 items (semua bundle) tetap masuk perhitungan
  revenue. Kalau pakai INNER JOIN, order bundle-only akan tersembunyi.

---

## D17 — Review system: 1 review per pesanan, publik visible

**Keputusan:** Tabel `order_reviews` punya `UNIQUE(order_id)`. RPC
`submit_review` raise `already_reviewed` kalau order sudah pernah
direview. RPC `list_reviews` hanya return row `is_visible = true`.

**Alasan:**

- 1 review per order = anti-spam, sederhana.
- Seller bisa hide review (`is_visible=false`) tanpa hapus (untuk
  moderation kalau ada ujaran kebencian).
- Default `is_visible=true` saat insert.

**Konsekuensi:**

- Kalau ada bug dan order sama di-review 2x, akan raise Postgres
  error 23505 — di handle di review-actions.ts → "Generic error".
- TrackForm auto-buka ReviewModal kalau order.status=delivered AND
  has_review(order_code)=false. Dismissed state disimpan di
  useState Set supaya gak ngepop-up lagi di session yang sama.


## D26 — Hapus Google OAuth, single signup/login flow

**Keputusan:** Hapus total Google OAuth dari /login & /register. Site
pakai satu flow:

- /register → nama + phone + email + dob + IG + password (semua wajib)
- /login → email + password
- Setiap email & phone hanya boleh didaftarkan sekali (lihat D13-D18)

**Alasan:**

- User: "Kita hapus dulu deh versi itu [Google OAuth], karena agak susah,
  nanti next update baru kita pelan-pelan bahas."
- Single flow paling simpel & sesuai expected UX user: signup dengan
  identitas lengkap → login email+pass → bukan guest.
- Google OAuth di flow ini = orphan account (auth.users row dibuat
  tanpa password, customer_profiles.phone NULL). Bentrok dengan
  email/phone-uniqueness constraint.

**Konsekuensi:**

- `src/lib/googleAuth.ts` dihapus
- `src/components/customer/CompleteProfileCard.tsx` dihapus
- `signInWithOAuthAction` & `signInWithGoogleIdTokenAction` dihapus
- migration-29 revert migration-27: phone NOT NULL + strict bootstrap
- Kalau suatu saat mau aktifkan OAuth lagi, tambahkan kembali function-nya
  (lihat git log: commit ff2c308 atau 570c6ec untuk implementasi terakhirnya).
  Pertimbangkan juga: bikin OAuth hanya "link to existing account" (jangan
  signup baru via OAuth), atau pakai password-less flow dengan magic link.


---

## D25 — Guest vs logged-in pre-order: beda flow identitas

**Keputusan:**

- Guest: 4 step `[identity, menu, payment, review]`. Step 1 wajib isi
  nama/phone/email/IG.
- Logged-in + profile lengkap: 3 step `[menu, payment, review]`. Identitas
  auto-fill dari profil, langsung pilih menu.
- Logged-in + profile TIDAK lengkap (mis. OAuth user baru tanpa phone):
  tetap 4 step (lewat identity dulu) supaya mereka isi field kosong.

**Alasan:**

- User: "Account itu ... nanti untuk pre-order bisa ada 2, ada akun atau
  login as guest ... Setelah daftar dia sign in akun dia maka artinya dia
  udh ada identitynya maka pada pre-order dia tidak perlu tahap pertama lg
  tak perlu isi ulg, bisa lgsng pilih menu."
- Identitas pre-order = identitas akanda (untuk user login) = field yang
  sama dengan profile. Tidak ada gunanya minta user isi ulang.

**Konsekuensi:**

- `STEPS` di OrderFlow jadi dinamis via `profileComplete` flag.
- Stepper/progress bar render pakai `steps.length` (3 atau 4).
- sessionStorage restore harus handle: kalau saved "identity" tapi sekarang
  login → drop, fallback ke `steps[0]`.
- Tombol "Edit" di review name/phone: kalau login → ke `/account`, kalau
  guest → ke step identity.


---

## D24 — Order QRIS Midtrans invisible sampai customer bayar

**Keputusan:** Order QRIS Midtrans yang `qris_status='pending'` (= customer
belum bayar) **tidak muncul** di dashboard seller. Auto-accept saat `paid`
sudah ada di `set_order_qris_status` (migration-16).

**Filter rule (migration-28):**

```
admin_list_orders:
  and not (payment_method = 'qris_midtrans' and qris_status is distinct from 'paid')
admin_dashboard_stats:
  pending_orders: status='pending' AND payment_method != 'qris_midtrans'
  total_orders: exclude QRIS unpaid
```

**Aturan lengkap (semua metode):**

| Metode | Saat order dibuat | Saat terlihat seller | Accept |
|---|---|---|---|
| Transfer | status=pending, langsung masuk | Ya, sebagai "pending" | Manual |
| QRIS Midtrans | status=pending, invisible | Setelah qris_status=paid | Auto (status→accepted) |
| QRIS Midtrans expired/failed/cancelled | invisible | Setelah status jadi rejected | Auto (status→rejected) |

**Alasan:**

- User: "Pre-order hanya akan masuk ketika 1.Jika QRIS, dia sudah bayar baru
  masuk ke penjual 2. Jika tf, Dia langsung upload itu masuk ke penjual tpi
  penjual harus konfirmasi dulu pesanannya diterima atau reject, jika qris
  auto terima."
- QRIS unpaid masuk dashboard seller sebelumnya → spam karena seller harus
  manual cek payment status. Sekarang seller hanya lihat order yang siap
  untuk diproses.

**Konsekuensi:**

- Seller dashboard stat counter "pending" = hanya order yang BUTUH aksi.
- Mutasi (admin_list_mutasi) sudah exclude `pending` by design — tidak
  berubah.


---

## D23 — Google OAuth user langsung dibuat profil partial (phone NULL)

**Keputusan:** `customer_bootstrap_from_metadata` tidak raise `invalid_phone`
kalau `raw_user_meta_data.phone` kosong. Insert row dengan `phone = NULL`
dari name fallback Google (`full_name` atau `name`). `customer_profiles.phone`
jadi nullable (migration-27).

**Alasan:**

- Google OAuth tidak kirim nomor telepon. Sebelumnya, bootstrap raise
  exception → profile tidak dibuat → /account redirect ke /login → user
  stuck di loop.
- Profile partial lebih bersih: customer_profiles row ada, /account bisa
  render form "Lengkapi profil" yang minta phone + IG + DOB. Submit →
  `customer_upsert_own_profile` (yang tetap require phone) → profile lengkap.

**Konsekuensi:**

- Tambah RPC helper `customer_profile_needs_completion()` untuk deteksi
  "login tapi profile belum lengkap" dari client.
- /account page: kalau `getCustomerProfile()` null + `supabase.auth.getUser()` ada user → tampilkan CompleteProfileCard, BUKAN redirect ke /login.
- Halaman /order tetap require phone (validateIdentity → phone min 9 digit) — guest + OAuth user yg belum lengkap harus isi phone sebelum lanjut.


---

## D22 — Mobile font-size tidak toggle, otomatis compact di HP

**Keputusan:** Layout compact (font 14px, kartu flavor 2 kolom, dsb.) selalu
aktif di mobile (< 640px). Tidak ada toggle. Hapus `FontSizeToggle`,
`FontSizeProvider`, dan selector `html[data-density="compact"]`.

**Alasan:**

- User: "fitur ini dihapus, semua pakai yang kecil aja (di hp)". Toggle
  2-state lebih ribet dari yang dibutuhkan — HP cukup compact, desktop
  cukup normal, gak perlu user pilih.
- Layout mobile compact sebenarnya sudah lebih pas dari awal; toggle
  cuma nge-undo-nya di mode "normal".

**Konsekuensi:**

- CSS rule compact selalu aktif di mobile (tidak bergantung data-density).
- Kalau suatu saat butuh mode lain (mis. accessibility large font), tambah
  di tempat lain — mungkin `body.lg` utility + tombol di SiteHeader.


---

## D21 — Migration `migration-27.sql` merelaksasi phone constraint

**Keputusan:** `customer_profiles.phone` dibuat nullable. Index `phone_normalized`
tetap ada untuk dedup. Backend `customer_upsert_own_profile` TETAP require
phone — cuma bootstrap yang boleh insert NULL.

**Alasan:** Lihat D23. Customer via form (signup + lengkapi profil) harus
selalu punya phone karena dipakai untuk kontak & invoice. OAuth users
boleh temporary NULL karena mereka akan diminta melengkapi.

**Konsekuensi:**

- DB constraint: `phone text` (tidak `not null`).
- Index `customer_profiles_phone_idx` masih ada dan valid untuk query
  WHERE phone IS NOT NULL.
- Validation di RPC `customer_upsert_own_profile` tetap raise `invalid_phone`
  kalau NULL/short.


---

## D18 — Signup enforcement: pre-check phone availability

**Keputusan:** Sebelum `supabase.auth.signUp()`, action call RPC
`is_phone_available(p_phone)`. Kalau false, return `phone_taken`
tanpa bikin auth.users row.

**Alasan:**

- Kalau langung signup lalu gagal create profil karena phone
  bentrok, kita punya auth.users yatim (akun tanpa profil).
  Membersihkan auth.users butuh service_role, ribet.
- Pre-check lebih cepat (no signup failed rollback).

**Konsekuensi:**

- Email tetap di-check saat `signUp()` (Supabase Auth reject
  `already registered`). Ditangani di `humanize()` → `email_taken`.
- Phone uniqueness enforced dua lapis: (a) pre-check di action,
  (b) trigger DB `customer_profiles_guard_phone_unique` sebagai
  safety net kalau ada bypass.
- Customer_profiles sekarang UNIQUE(phone_normalized) — bukan UNIQUE
  per (user_id) (PK tetap user_id). Migration-22 Hapus duplikat
  terlama (created_at asc).


## Zona pengambilan & pengantaran: satu tabel, bukan dua (2026-10-08)

Steven meminta menu admin baru berlabel `Catatan Pengambilan & Pengiriman` dengan
dua bagian: `Ambil di toko` (titik toko + catatan jam ambil) dan `Pengantaran`
(zona antaran + ongkir).

**Keputusan: tidak membuat tabel baru.**

`delivery_zones` sudah membedakan jenis lewat kolom `kind` (`delivery` |`pickup`, migration-32).
Steven sendiri yang memilih opsi `tabel baru`, tapi saat implementasi baru
terbukti tabel itu hanya akan:

- menduplikasi data yang sama (nama + lat/lng + aktif), dan
- memaksa sisi pembeli (`OrderFlow`) membaca DUA sumber untuk satu
  layar pilih lokasi.

Jadi tabel yang sama diperluas dengan kolom `note_id` / `note_en`, dan
menu admin-nya dipisah per jenis lewat tab.

**Konsekuensi:**

- `kind` jadi satu-satunya penentu jenis, bukan tebakan dari fee/lat.
- Titik ambil dipaksa `fee = 0` dan `requires_address = false` di level
  database (`admin_upsert_zone`), jadi data tidak bisa salah jenis.
- Catatan per titik menggantikan catatan pickup global di `store_settings`
  (`pickup_note_id`) — yang isinya masih daftar nama toko lama.
- Satu sumber data untuk keranjang, picker admin, dan picker pembeli.


## Nav bawah HP tetap ada; yang hilang di HP adalah footer (2026-10-08)

Koreksi atas keputusan lama di item 1 dokumen "Perbaikan Ruma Komugi 2". Steven
mengirim screenshot men-circle bagian bawah halaman dan mengoreksi: yang
dimaksud "jangan dipakai di HP" adalah **blok informasi toko** (TAUTAN CEPAT
+ HUBUNGI KAMI), bukan nav bawah.

**Keputusan:**

- `MobileBottomNav` (Beranda / Pesanan Saya / Akun) **tetap tampil di HP**,
  tetap `md:hidden`.
- `SiteFooter` dapat `hidden md:block` - hilang total di HP, tampil penuh di
  laptop.
- `md:pb-20` pada baris copyright di footer **dikembalikan lagi** (dihapus),
  karena padding itu hanya dibutuhkan ketika nav bawah ada di desktop. Sekarang
  tidak ada, jadi padding hanya menyisakan ruang kosong.

**Alasan:**

- Nav bawah adalah navigasi utama di HP. Menghapusnya membuat pengguna HP
  kehilangan jalan ke Beranda / Pesanan Saya / Akun.
- Footer 4 kolom (Tautan Cepat + Hubungi Kami) memang tidak cocok untuk HP:
  butuh scroll jauh, dan isinya sudah punya tempat yang lebih wajar di
  `/account`.
- Kontak di HP sekarang ada di halaman Akun: bar "Kontak" membuka popup
  (`ContactMenuRow`), dan blok "Hubungi Kami" lengkap ada di bawah form profil
  (`ContactSection`).

**Konsekuensi:**

- Nama komponen kembali `MobileBottomNav`; `BottomNav.tsx` (versi laptop-only)
  dihapus supaya tidak ada dua file untuk satu navigasi. Kalau nanti butuh nav
  bawah khusus desktop, itu keputusan baru, bukan sisa item 1.
- Halaman di HP jadi ~300px lebih pendek karena footer hilang.
- `scripts/check-nav-contact.js` ditambah probe `FOOTER_PROBE` dan 11 assertion
  baru, supaya regresi ini ketahuan otomatis: nav bawah harus ada di HP, footer
  harus tidak ada.

---

## D27 — Sorotan beranda (Populer & Terlaris) dipilih penjual, bukan algoritma

**Keputusan:** Section "Populer" dan "Terlaris" di beranda diisi dari pilihan
penjual: `store_settings.popular_flavor_ids` dan `.best_selling_flavor_ids`
(jsonb, maksimal 3). Kalau kolom kosong, frontend jatuh ke perilaku lama (urut
otomatis). Batas 3 ditegakkan di tiga lapis: CHECK constraint di DB,
`MAX_HOME_PICKS` di kode, dan disable tombol di UI.

**Alasan:**
- Showcase yang ditonjolkan itu keputusan bisnis, bukan algoritma. Urutan otomatis
  (like + terjual) justru sering salah: di toko yang baru mulai semua angka masih
  kecil, jadi urutannya nyaris acak.
- Batas 3 diminta Steven dan juga cocok dengan layout (grid 3 kolom di HP).
- Batas ditegakkan di DB karena satu-satunya tempat yang tidak bisa dilewati dari
  sisi mana pun — payload rusak tetap tidak bisa menyisipkan 4 produk.

**Konsekuensi:**
- **Array kosong berarti "otomatis", bukan "kosong".** Karena itu tidak ada
  risiko beranda kosong setelah deploy.
- Penjual yang belum pernah menyentuh tab Beranda tetap dapat halaman utuh.
- Id yang menunjuk produk yang sudah dihapus **dibuang diam-diam** di dua tempat
  (`clean_flavor_id_list` saat simpan, `pickByIds` saat render), jadi tidak ada
  rongsokan yang tampil ke pembeli.
- Urutan tampil = urutan klik di dashboard. Mengubah urutan berarti hapus lalu
  pilih ulang (belum ada drag-and-drop).
- Pemilih di dashboard memakai `getActiveFlavors()`, sengaja sama dengan sumber
  data beranda. Kalau penjual memilih produk non-aktif, produk itu tidak akan
  muncul di beranda — jadi hindari memilih yang tidak langsung terlihat.

## D28 — Counter like hasil pengujian DIJAGA, tidak dihapus

Steven sudah tahu bahwa counter like di toko ini **bukan dari pembeli sungguhan**
— berasal dari verifikasi otomatis yang mengklik hati lewat browser headless.
Saat diberi tahu (10-10-2026), jawabannya: **"biarkan aja dulu, jangan ada
hapus apa-apa."**

Jadi:
- **JANGAN** menghapus baris `flavor_likes` atau me-reset `flavors.likes_count`
  tanpa permintaan eksplisit Steven, meskipun angkanya terlihat seperti data uji.
- Angka itu sengaja dipakai sebagai **testimoni sosial** supaya etalase tidak
  terlihat kosong saat demo atau presentasi ke calon pembeli.
- Kalau nanti Steven berubah pikiran, urutannya: `delete from flavor_likes` lalu
  `update flavors set likes_count = 0`. Asal-usul angkanya ada di gotchas.md #45.

Temuan asli: `flavor_likes` berisi 10 baris, `likes_count` = 6/0/2/1/1.

## D29 — Halaman Pesanan = lacak pesanan (kode + telepon), bukan daftar akun

**Keputusan:** Tab "Pesanan" di bottom nav mengarah ke `/track`, dan `/track`
menuntut **dua identitas**: kode pesanan + nomor telepon. `/account`
mengalihkan ke `/track` selama `ACCOUNT_FEATURE_ENABLED === false`.

**Alasan:**

- Pembeli di toko ini **tidak punya akun** (lihat D11 + flag account), jadi
  "riwayat pesanan" tidak ada maknanya — tidak ada yang bisa di-list.
- `track_by_code(p_code)` versi lama mengembalikan seluruh isi pesanan untuk
  siapa saja yang tahu kodenya. Kode pendek + mudah diteruskan = data orang
  bisa dibaca orang lain. Nomor telepon sebagai identitas kedua menutup celah itu
  **tanpa perlu sistem akun sama sekali**.
- Pencocokan nomor telepon dilakukan **di database** (`normalize_phone`), bukan
  di frontend. Kalau penyaringannya cukup di browser, siapa pun yang bisa
  memanggil RPC tetap bisa membaca data tanpa telepon.

**Konsekuensi:**

- Ada jendela transisi singkat antara migrasi DB dan deploy kode: halaman track
  versi lama memanggil signature 1-argumen dan mendapat 404 PGRST202. Itu
  **aman** — `TrackForm` memperlakukan `rpcError` sebagai "tidak ditemukan",
  bukan crash. Tetap, urutan yang benar: `db:apply` dulu, baru deploy.
- Kalau suatu saat Steven mau melihat **semua** pesanan satu orang dari nomor
  telepon saja, itu fitur **beda** — butuh RPC baru yang menerima nomor saja,
  dengan konsekuensi privasi yang lebih berat. Jangan diam-diam memakai
  `track_by_code` untuk itu.
- `/account` sengaja **tidak dihapus** — hanya kehilangan pintu masuk. Menyalakan
  flag menghidupkannya kembali tanpa perubahan kode.

## D30 — Section "Menu Baru": dipilih penjual, tanpa tebakan otomatis

**Keputusan:** Section "Menu Baru" (di atas Paket Hemat, tiap kartu berlabel
"New") diisi dari `store_settings.new_flavor_ids`, maximum 6, dipilih penjual di
Dashboard → Pengaturan → Tampilan beranda. Kalau daftarnya kosong, **section
disembunyikan seluruhnya**.

**Alasan:**

- Steven yang menyatakan kebutuhannya: "di admin dia bisa set menu mana yang
  new kalau di set new nanti masuk ke sana". Jadi penanda "baru" adalah
  **klaim dagang**, dan klaim dagang tidak boleh dibuat otomatis.
- Menebak dari `created_at` sering salah: produk lama yang fotonya baru
  diupload akan terbaca baru. Label "New" pada barang yang bukan baru itu
  klaim yang tidak bisa dibenarkan kalau ditanyakan pembeli.
- Karena itu tidak ada fallback seperti yang dipakai section "Populer".
  "Populer" aman ditebak (menampilkan yang paling disukai memang selalu wajar),
  "Baru" tidak.

**Konsekuensi & pilihan yang diambil:**

- Batas **6** (bukan 3 seperti "Populer") karena section-nya baris mendatar
  (`overflow-x-auto`) — selalu satu baris, tidak mendorong konten ke bawah.
  Angka ini harus sama di `MAX_NEW_PICKS`, tombol dashboard, dan CHECK
  constraint `settings_new_flavor_ids_ok`.
- **Baris mendatar, bukan grid 3 kolom** — enam kartu di grid jadi dua baris.
- Kartu memakai `FlavorCard` mode `dense` yang sama dengan "Menu" dan
  "Populer"; `badgeLabel` mengganti teks "Signature" (bukan badge kedua), dan
  ikon berganti ke `Sparkles`. Warna badge tetap `honey-400`.
- **Hati READ-ONLY**, sama seperti "Populer" — "Menu" tetap satu-satunya tempat
  like di beranda.
- Produk yang ditandai "New" **tetap tampil** di section "Menu" juga. Steven
  tidak minta sebaliknya, dan memindahkannya berarti produk jadi sulit dicari.
- Data uji `[5, 3]` yang dipakai saat verifikasi **sudah dikembalikan ke `[]`**
  supaya website tidak memamerkan label "New" pada produk yang Steven belum
  pilih.

## D31 — Tiga fitur dibuang dari sisi kode, tapi datanya disimpan

**Keputusan:** Steven meminta (11-10-2026) voucher "dihapus aja dulu", strip
kategori di /order dihapus, info like/stok/penjualan tidak ditulis di kartu
/order, dan batas maksimal per rasa dihapus. Semuanya dikerjakan sebagai
**perubahan kode**, bukan penghapusan data.

**Kenapa:**

- **Voucher:** "dihapus **dulu**" — kata itu yang menentukan. Kode (route,
  komponen, action, tipe) dibuang supaya tidak ada menu yang menggantung, tapi
  tabel `vouchers` dan RPC-nya **tetap ada**. Kalau Steven berubah pikiran,
  nyalakan lagi tanpa kehilangan voucher. Menghapus tabel itu tidak bisa
  dibatalkan, dan tidak ada yang diminta.
  - Pengecualian: grup i18n `admin.vouchers` tetap dipakai
    `DeliveryZonesClient` (`statusActive` / `activeLabel`), jadi jangan dihapus
    beserta utuhannya.
- **Strip kategori:** dihapus dari `OrderMenuBrowser` saja, **tidak** dari
  `MenuBrowser` (beranda) yang masih memakai state kategori. Menghapus dari
  keduanya berarti menyimpan ulang untuk section yang tidak complained.
- **Info like/stok/penjualan:** ternyata stok, jumlah like, dan penjualan
  **sudah tidak pernah ditulis** di kartu `/order`; yang tersisa hanya ikon
  hati. Jadi yang dihapus adalah hati itu, lewat prop `showHeart` yang hanya
  berlaku untuk mode `storefront` — bukan menghapus seluruh blok sosial dari
  komponen, karena beranda masih butuh.
- **Batas maksimal pesanan:** dihapus dari `create_order`, tapi kolom
  `store_settings.max_per_order` **tidak** dihapus karena tidak ada frontend
  yang membacanya; sisa satu kolom tidak berbahaya dan membuat perubahan ini
  bisa dibatalkan.

**Konsekuensi yang harus diingat:**

- Setiap kali sebuah route dihapus, `.next` masih menyimpan validator-nya dan
  build akan gagal (gotcha #58) — hapus `.next` lalu build ulang.
- Uji `/admin/*` selalu butuh cookie session admin, kalau tidak yang diuji
  middleware, bukan route (gotcha #59).

## D32 - Isi bundle ditentukan PENJUAL lewat daftar rasa, bukan kategori

**Keputusan:** Bundle tidak lagi dibatasi `bundles.category_id`. Penjual
mencentang rasa satu per satu di form "New bundle" (tabel `bundle_flavors`).
Daftar kosong = semua rasa boleh dipilih.

**Alasan:** Steven: "jangan fiks hanya Sando Sandwich, buat kita bisa pilih
kyk bundlenya ada apa aja, jadi kita yang set isi bundlenya itu apa". Kategori
adalah pengelompokan tampilan, bukan batasan dagang - memakainya sebagai
pembatas memaksa penjual membuat kategori khusus hanya untuk paket.

**Konsekuensi & pilihan yang diambil:**

- `bundles.category_id` **tidak dihapus** dari database, tapi form tidak lagi
  mengirimnya. Bundle lama tetap tampil, hanya jadi tidak terkunci.
- Validasi backend (`create_order`) ditambahkan supaya daftar rasa bukan
  hanya penjelasan di UI: slot di luar daftar ditolak `flavor_unavailable`.
- `create_order` diredefinisi dengan `create or replace`, definisi diambil
  verbatim dari versi live.
- Daftar kosong berarti "semua rasa", jadi bundle yang belum pernah disentuh
  penjual tetap bekerja persis seperti sebelumnya.

## D33 - Label "New" menempel pada produk (toggle), bukan daftar di pengaturan

**Keputusan:** Section "Menu Baru" di beranda dibaca dari kolom
`flavors.is_new`, dinyalakan lewat toggle "New" di form flavor - tepat di
bawah toggle "Favorite". Pemilih "Menu Baru" di Dashboard dihapus.

**Alasan:** Steven meminta "tambahin fitur kayak New di bawah favorite".
Toggle melekat pada produk yang dimaksud, sedangkan daftar terpisah mudah
tidak sinkron dengan produk yang sebenarnya baru.

**Konsekuensi:**

- Ini menggantikan D30 (yang memakai `store_settings.new_flavor_ids`).
  Kolom itu **dibiarkan di database** (data, bukan dibuang) tapi tidak ada
  frontend yang membacanya lagi.
- Masih **tanpa tebakan otomatis** dari tanggal dibuat - label "New" adalah
  klaim dagang. Kalau tidak ada rasa yang ditandai, section disembunyikan
  seluruhnya, bukan judul kosong.
- Batas tetap 6 (`MAX_NEW_PICKS`), urutan mengikuti `sort_order`.

## D34 - Bar menu Profil bisa diarahkan ke halaman nyata lewat kolom `href`

**Keputusan:** `profile_menu_items` dapat kolom `href`. NULL = perilaku lama
(popup isi). Terisi = bar jadi link ke halaman itu. Default diisi lewat
migrasi: `faq` ke `/faq`, `contact` ke `/contact`.

**Alasan:** Steven: "saya mau ketika diklik nnti masuk ke misal FAQ maka nnti
ke /faq, kayak gambar 3 dan ada isinya bisa dilihat". Popup statis tidak
cukup - isinya harus bisa dibaca dan dicari seperti halaman.

**Konsekuensi & pilihan yang diambil:**

- Validasi `href` di backend: hanya path internal (`/`) atau URL http(s),
  maksimal 200 karakter. Nilai lain diabaikan, bukan error.
- Bar `hours` dan `terms` **tetap popup** - isinya teks pendek, bukan
  halaman. Mengarahkannya ke URL halaman fake hanya akan menambah 404.
- Konten FAQ pindah ke `src/lib/faq.ts` supaya `/contact` dan `/faq` tidak
  bisa berbeda isi.

## D35 - Navigasi mundur ada di SETIAP langkah pre-order, bukan hanya dua
terakhir

**Keputusan:** Tombol back di mobile (panah di kiri pill langkah) dan
desktop (langkah yang sudah dilewati bisa diklik). Isi form tetap terisi
saat naik-turun.

**Alasan:** Steven: "buat ada fitur bisa back, mana tau mereka mau check
kembali tentang data mereka". Kebutuhan sebenarnya adalah mengecek ulang
data identitas - jadi mundur harus menjangkau langkah pertama, bukan hanya
pembayaran dan konfirmasi.

**Konsekuensi:** Langkah yang belum dilewati dan langkah aktif tidak bisa
diklik, supaya tidak ada langkah yang terlewat.

## D36 - Keranjang disembunyikan di langkah identitas

**Keputusan:** `<aside>` keranjang tidak dirender sama sekali di langkah
identitas, dan grid jadi satu kolom penuh.

**Alasan:** Steven: "pada pre-order saat isi identitas, itu cartnya dihapus".
Di langkah itu keranjang dijamin masih kosong dan belum ada apa pun yang bisa
ditambahkan, jadi panel "0 qty / Rp 0" hanya memenuhi ruang kosong dan membuat
pembeli mengira mereka salah langkah.

**Konsekuensi:** Langkah identitas tetap punya tombol "Lanjut" sendiri di
dalam form, jadi tidak ada langkah yang buntu.

## D37 - Diskon ongkir disimpan PER ZONA, bukan global

**Keputusan:** Kolom `delivery_zones.shipping_discounts` jsonb, bentuk
`[{ "min": 50000, "percent": 50 }]`. Tiap zona punya daftar sendiri.

**Alasan:** Steven menunjuk form zona delivery di admin (gambar 4), jadi
kontrolnya harus ada di situ. Sekaligus lebih masuk akal secara operasional:
zona dekat (ongkir Rp3.000) dan zona jauh (Rp15.000) belum tentu perlu titik
potongan yang sama.

**Konsekuensi:** `resolveShipping()` dan `create_order` harus memilih aturan
dengan `min` TERTINGGI yang terlampaui subtotal, bukan menjumlahkan persen -
kalau tidak, dua tier yang sama-sama aktif bisa membuat ongkir minus.

## D38 - Ongkir dibaca dari TABEL `delivery_zones`, bukan jsonb `store_settings`

**Keputusan:** `create_order` (dan semua tampilan pembeli) memakai
`delivery_zones.fee`. Kolom jsonb `store_settings.delivery_zones` tidak lagi
dipakai untuk hitungan ongkir.

**Alasan:** Dua sumber harga yang bisa berbeda persis adalah bug, bukan
fitur. Sebelum ini pembeli melihat fee dari tabel (Rp5.000) tapi backend
menagih fee dari jsonb (Rp10.000), dan zona yang tidak ada di jsonb (`antar`)
ditagih Rp0 alias gratis ongkir. Bug ini ketahuan karena Steven mengutip
angka ongkir yang berbeda dari yang muncul di aplikasi.

**Konsekuensi:** Migrasi 46 mengganti pembacaannya. jsonb lamanya dibiarkan
apa adanya (data historis), tapi tidak lagi jadi sumber kebenaran.

## D39 - FAQ pindah dari kode ke database

**Keputusan:** Tabel `faq_items` + RPC `public_faq()` /
`admin_list_faq()` / `admin_save_faq()` / `admin_delete_faq()`. Halaman
`/faq` dan section FAQ di `/contact` membaca dari situ.

**Alasan:** Permintaan Steven: "untuk faq gini dimana kami bisa edit atau
tambahkan nantinya, soalnya di admin tidak ada fiturnya, sama halnya dengan
contact dll". Contact memang sudah bisa disunting dari dashboard; FAQ tidak.

**Konsekuensi:** `src/lib/faq.ts` tidak dihapus, tapi turun kelas jadi isi
cadangan (dipakai kalau `public_faq()` gagal) plus `normalizeFaq()` yang
membuat jsonb dari database aman dibaca. Sempre sediakan fallback: halaman
publik tidak boleh kosong hanya karena satu RPC error.

## D40 - Riwayat pesanan disimpan di localStorage, bukan database

**Keputusan:** `/riwayat` membaca `localStorage` (kunci
`js_order_history_v1`), ditulis dari halaman `/order/success/[code]`.

**Alasan:** Permintaan Steven eksplisit: "saya mau satu untuk track, dan satu
untuk history... dan itu pakai local storage aja jadi beda hp beda history".
Itu memang perilaku yang dia mau - bukan kelemahan yang perlu diperbaiki.

**Konsekuensi:** Maksimal 30 baris, riwayat hilang kalau pengguna clears data
browser, dan tidak terlihat di HP lain. Perlakukan ini sebagai fitur (privasi +
tanpa akun), dan halaman /riwayat harus menjelaskan bahwa datanya lokal. Jangan
diam-diam mengubahnya ke database tanpa diminta.

## D41 - Bar quick-action menyatu dengan bottom nav, bukan elemen fixed terpisah

**Keputusan:** "Cek Pesanan" + "Riwayat" dirender DI DALAM elemen `<nav>` yang
sama dengan bar tab, sebagai bar kedua DI BAWAH bar tab.

**Alasan:** Dua alasan terpisah.

1. *Struktur:* tinggi bar quick-action tidak konstan, dan
   `pb-[env(safe-area-inset-bottom)]` pada nav membuat posisinya bergeser di HP
   bergerigi. Dua elemen `fixed` berarti satu harus mengarang offset yang cepat
   salah - gejalanya bar menutupi tab Profil.
2. *Posisi:* Steven koreksi setelah versi pertama ditaruh DI ATAS bar tab
   ("Track order dan history bukan sana, tapi setelah di bagian Track order
   (kanan Home)"). Jadi urutan dari atas: Home / Cek Pesanan / Profil, lalu bar
   Cek Pesanan + Riwayat paling bawah, menempel ke tepi bawah layar.

**Konsekuensi:** Spacer bawah halaman harus ikut naik (68px -> 114px). Kalau
tidak, kartu terakhir di beranda tertutup bar Riwayat. Saat memindahkan bar,
cek lagi tinggi `<nav>` dengan `getBoundingClientRect` di headless - jangan
sekadar benar secara visual.
