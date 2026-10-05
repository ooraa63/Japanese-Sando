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
