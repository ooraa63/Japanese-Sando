# Gotchas — Jebakan yang Sering Bikin Salah

Catatan hal-hal non-obvious tentang project ini. Baca dulu sebelum
menyentuh kode, supaya tidak mengulang kesalahan yang sama.

## 1. Next.js 16 (BUKAN Next.js dari training data)

Project ini pakai **Next.js 16.3.7** dengan **Turbopack** default. API
dan konvensi bisa berbeda dari Next.js 14/15 yang umum di training
data. Selalu baca dokumentasi di
`node_modules/next/dist/docs/` kalau ragu.

`AGENTS.md` di root project sudah berisi pengingat otomatis yang
ditulis/di-refresh oleh `next dev` lewat
`node_modules/next/dist/server/lib/generate-agent-files.js`. JANGAN
hapus blok `<!-- BEGIN:nextjs-agent-rules -->` dari `AGENTS.md` — itu
bertujuan supaya AI session berikutnya tetap ingat untuk cek docs.

## 2. Folder route yang dimulai `__` (double underscore)

Next.js routing **tidak mengenali** folder yang dimulai dengan `__`
(double underscore). Untuk halaman debug / eksperimen, pakai nama
tanpa prefix atau gunakan route group `(debug)`. Contoh:

- ❌ `src/app/__debug/page.tsx` → 404
- ✅ `src/app/debug/page.tsx` → 200
- ✅ `src/app/(debug)/debug/page.tsx` → 200

## 3. Stale `.next` cache setelah rename / hapus file

Next.js + Turbopack menyimpan type info di `.next/dev/types/`. Kalau
file di-rename atau dihapus, validasi TypeScript bisa error dengan
pesan `Cannot find module '...page.js'` walaupun file sudah tidak ada.
Fix: hapus folder `.next/` lalu ulangi typecheck.

```bash
rm -rf .next
npx tsc --noEmit
```

## 4. RPC `public_menu()` — perilaku bundle

Lihat `supabase/migration-15.sql` line 184-208. RPC `public_menu()`
membagi hasil:

- **Top-level `bundles`** → hanya bundle dengan `category_id IS NULL`
  (berdiri sendiri).
- **`categories[].bundles`** → bundle yang terkait kategori itu ATAU
  yang berdiri sendiri. Query SQL pakai
  `where (b.category_id = c.id or b.category_id is null) and b.is_active`.

Frontend `getPublicMenu()` (di `src/lib/data.ts`) sekarang merge
keduanya dan dedupe by id supaya komponen client tidak perlu
mendengar dua sumber. **Kalau menambah field bundle baru, update
`getPublicMenu()` juga**, bukan hanya di tipe `Bundle`.

## 5. OrderFlow step default & bundle visibility

`OrderFlow` (di `src/components/customer/OrderFlow.tsx`) selalu
mulai dari step `"identity"`. Section bundle baru muncul di step
`"menu"`. **Pembeli harus submit form identitas dulu** untuk melihat
bundle. Untuk amannya, ada banner info di step "identity" yang
menyebutkan "1 paket tersedia" — pastikan banner itu muncul (cek
`bundles.length > 0`).

## 6. `useCart` ↔ `useSyncExternalStore` ↔ SSR

`CartProvider` pakai pola `useSyncExternalStore` dengan
`getServerSnapshot` yang return `EMPTY_STORE`. Jangan panggil
`useCart()` di komponen yang di-render di server tanpa `<CartProvider>`
parent — akan throw `"useCart harus dipakai di dalam <CartProvider>"`.

Layout `src/app/layout.tsx` membungkus semua dengan `<CartProvider>`,
jadi aman di semua route customer.

## 7. Mobile layout ringkas (compact) aktif otomatis di < sm

Tidak ada `FontSizeProvider` / `data-density` lagi (lihat D22 di
`decisions.md`). Mobile layout compact (font 14px, kartu flavor 2 kolom,
date barcode, dsb.) sekarang SELALU aktif di `@media (max-width: 639px)` di
`src/app/globals.css`. Tidak ada toggle, tidak ada mode "large".

Kalau menambah styling yang harus ikut berubah di mode compact mobile,
pakai class hook (`density-flavor-grid`, `density-bundle-grid`,
`density-category-list`, `flavor-photo`, `flavor-desc`,
`flavor-social`, `cat-photo`, `cat-meta`, `cat-desc`, `cat-plus`)
dan tulis CSS-nya di blok `@media (max-width: 639px)` di globals.css.

## 8. RPC `create_order(p_bundles)` shape

Backend `create_order` (lihat `supabase/migration-12.sql` line 75)
menerima:

```ts
p_bundles: [{ bundle_id: number, slots: [{ flavor_id: number }] }]
```

`slots.length` HARUS sama dengan `bundle.required_qty`. Kalau beda,
backend raise `invalid_quantity` dan order gagal. Frontend
`OrderBundleModal` validasi ini sebelum submit (tombol "Konfirmasi"
disabled sampai semua slot terisi).

Stok per-kategori dihitung oleh backend dari **item satuan + slot
bundle** (tiap slot = 1 pcs fisik). Frontend `OrderFlow` punya
`stockContribution` yang mirror logika ini untuk validasi awal.

## 9. Invoice publik `public_invoice` return `bundles[]`

Lihat `supabase/migration-12.sql` line 583-605. RPC publik
mengembalikan `bundles: [{ bundle_id, bundle_name, slots: [{ slot, flavor_id, flavor_name }] }]`.
`SuccessClient.tsx` render ini di InvoiceSummary (layar) dan
InvoiceDocument (cetak). Snapshot lokal (sessionStorage) versi
lebih lengkap, lihat type `InvoiceBundleEntry` di `src/lib/types.ts`.

## 10. Build script — TypeScript check duluan

Selalu jalankan ini sebelum commit / push:

```bash
npx tsc --noEmit
npx eslint src
npx next build   # opsional, tapi bagus untuk verifikasi penuh
```

Kalau salah satu gagal, fix dulu. Jangan commit kode yang gagal build.

## 11. Paket `js_cart_v1` di localStorage

Cart store pakai `STORAGE_KEY = "js_cart_v1"`. Kalau ada perubahan
breaking di `CartStore` shape, **naikkan versi** (mis. `js_cart_v2`)
supaya cart lama tidak crash aplikasi. Migrasi bisa ditambahkan di
fungsi `readStorage()`.

## 12. `proxy.ts` di root

Project ini punya `src/proxy.ts` yang dipakai Next.js 16 (bukan
`middleware.ts`). Kalau mau menambah request interception, edit
file itu. Lihat dokumentasi Next.js 16 untuk `proxy.ts`.


## 13. Customer auth butuh "Confirm email" ON di Supabase

Buyer signup butuh verifikasi email. Project WAJIB aktifkan "Confirm
email" di Supabase Dashboard → Authentication → Providers → Email.

- Saat signup, `signUp.session` null sampai user klik link verifikasi.
- Server action `signUpCustomerAction` return `{ok: true, requiresVerification: true}`
  — UI menampilkan banner "cek kotak masuk".
- Identitas (nama, telepon, IG, DOB) disimpan ke `raw_user_meta_data`
  via `options.data` di `auth.signUp`. Setelah verifikasi + login,
  `signInCustomerAction` best-effort panggil
  `customer_bootstrap_from_metadata()` untuk membuat
  `customer_profiles` row dari metadata.
- Login sebelum verifikasi → error `Email not confirmed` dari Supabase,
  petakan ke error code `email_not_verified`.

CATATAN: Admin signup juga akan kena edurmend verifikasi karena pakai
pola `auth.signUp()` yang sama. Setelah admin signup, admin perlu cek
email dan login ulang. Tidak perlu update kode admin.


## 17. Migration-29 menghapus baris `customer_profiles` dengan phone NULL

`migration-29.sql` revert `migration-27` (yang pernah membuat `phone`
nullable untuk workaround Google OAuth). Saat apply `migration-29`,
baris SQL `delete from public.customer_profiles where phone is null`
akan jalan duluan — **ini menghapus akun customer yang dibuat via OAuth
sebelumnya (testing) yang gak pernah lengkapi phone**.

Kalau Anda ingin audit dulu sebelum hapus, run manual di SQL Editor:

```sql
select user_id, cp.created_at, u.email
from public.customer_profiles cp
left join auth.users u on u.id = cp.user_id
where cp.phone is null;
```

Untuk enable kembali Google OAuth di masa depan, lihat D26 (decisions.md) —
jangan revert migration-29 tanpa plan: bikin OAuth yang link ke existing
account, bukan bikin akun otomatis tanpa password.


---

## 14. Migration-16 harus dijalankan manual setelah deploy

`/login`, `/register`, dan `/account` bergantung pada RPC
`customer_profile()`, `customer_upsert_own_profile()`, dan
`customer_orders()`. Sebelum migration-16 diterapkan ke database,
halaman auth tetap render tapi profil null + register akan error
"function not found" di langkah kedua.

Sebelum deploy ke environment baru:
1. Jalankan `npm run db:push` (atau SQL editor) untuk apply
   `supabase/migration-16.sql`.
2. Verify RPC bisa dipanggil sebagai anon:
   `select customer_profile();` harus return null (bukan error).


## 15. Auth admin & customer beda Supabase Auth ini

Admin signin di `/admin/login` pakai RPC `is_admin()` (lihat
`auth-users` di Supabase). Customer signin di `/login` pakai RPC
`customer_profile()`. Cookie session dibedakan oleh role klaim; user
yang tidak di tabel `admins` akan ditolak dari dashboard admin.

Tabel `customer_profiles` terpisah dari `admins`. Tidak ada shared
tabel "users" di project ini — Supabase `auth.users` adalah sumber
kebenaran tunggal untuk siapa yang bisa sign in.


## 16. Midtrans dormant sampai env di-set

Integrasi Midtrans sudah complete di code (run server.ts, webhook,
modal, polling) tapi **tidak akan trigger Midtrans API call** kecuali
`MIDTRANS_SERVER_KEY` di-set.

Saat ini tidak ada masalah produksi karena:

- UI payment step filter opsi berdasarkan `midtransReady` (server-side
  check dari `process.env.MIDTRANS_SERVER_KEY`).
- API route `/api/midtrans/webhook` return 503 kalau env missing
  (lihat `isMidtransConfigured()`).
- Tidak ada env yang partial-set: kalau server key ada tapi client key
  tidak, `midtransReady` masih false.

Untuk aktivasi: lihat `docs/MIDTRANS.md` atau entry CHANGELOG
"2026-10-05 — Midtrans QRIS Dinamis (DORMANT, menunggu credentials)".
