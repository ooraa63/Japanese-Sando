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


## 18. JANGAN jalankan `npm test` — dia menghapus data produksi

`package.json` script `test` (= `npm test`) me-chain beberapa skrip yang
memakai `resetAll()` dari `scripts/_testutil.mjs`. Fungsi itu menjalankan:

```sql
delete from public.orders;
update public.store_settings set total_stock = 100, stock_enabled = true, ...
update public.categories set bundle_tiers = '[]';
```

Jadi `npm test` = **hapus semua order produksi + set stok balik ke 100**.
`test-flow.mjs`, `test-categories.mjs`, `test-category-bundles.mjs`,
`test-global-stock.mjs` semuanya memanggilnya. `scripts/cleanup.mjs`
(`npm run db:cleanup`) lebih ganas lagi — hapus order, stock_logs, dan
flavor/category.

Untuk cek kesehatan tanpa menyentuh data, pakai skrip read-only:

| Skrip | Isi |
|---|---|
| `node scripts/check-cron.mjs` | extension pg_cron + daftar `cron.job` |
| `node scripts/check-stock.mjs` | stok per kategori + order QRIS gantung |
| `node scripts/check-data-health.js` | ringkasan tabel inti (admin, menu, order) |
| `node scripts/verify-bundle-stock.mjs` | hitung potong stok `create_order` (rollback) |
| `node scripts/verify-overloads.js` | cari RPC yang punya >1 overload |
| `node scripts/verify-all-rpcs.js` | daftar RPC customer_* + grants |
| `node scripts/dump-fn.js <nama>` | source function live dari DB |
| `node scripts/describe-table.js <tabel>` | kolom + tipe sebuah tabel |

Semua skrip di atas cuma `select`. Kalau butuh tes yang menulis, siapkan
database dev terpisah — jangan pakai `DATABASE_URL` produksi.


## 19. `admin_set_stock` (2 argumen) bukan yang dipakai aplikasi

Ada dua overload:

- `admin_set_stock(p_stock, p_note)` → tulis `store_settings.total_stock`
- `admin_set_stock(p_flavor_id, p_stock, p_note)` → tulis `flavors.stock`

Dan ada RPC terpisah `admin_set_category_stock(p_category_id, p_stock)` →
tulis `categories.stock`.

**Yang dipakai UI adalah `admin_set_category_stock`** (lihat
`MenuClient.tsx` -> `setCategoryStockAction`), karena stok yang benar-benar
dikurangi `create_order` — dan yang dibaca pembeli di `/order` — adalah
`categories.stock`. Kalau pernah butuh ubah stok manual, jangan pakai
`admin_set_stock`: hasilnya tidak akan kelihatan di halaman pembeli.


## 20. Uji UI: jangan suntik localStorage keranjang

Cart di `localStorage['js_cart_v1']`, tapi `OrderFlow` meresetnya di effect
unmount (`resetRef.current()` di `src/components/customer/OrderFlow.tsx`).
Kalau seed manual sebelum memuat `/order`, isinya **selalu** hilang sebelum
`CartProvider` sempat membacanya — sudah dicoba 3 cara (seed setelah load,
seed dari beranda lalu navigasi, dan `Page.addScriptToEvaluateOnNewDocument`)
dan semuanya `jumlahBundle: 0`.

**Cara yang benar: klik UI-nya.** Selector yang stabil:

| Target | Selector |
| --- | --- |
| Buka modal bundle | `button` yang `<h3>`-nya = `"Sando 2"` |
| Tambah slot di modal | `button[aria-label="+1 Sando 2"]` |
| Konfirmasi bundle | tombol berteks persis `"Konfirmasi"` |
| Tambah rasa biasa | `button` berteks `"Tambah ke keranjang"` di dalam `article` |

Catatan: kartu `FlavorCard` **tidak** punya tombol `+1` sebelum item masuk
keranjang — saat `qty === 0` yang dirender adalah tombol "Tambah ke
keranjang".

`/order` membuka di **step 01 "Data Kamu"**, bukan daftar rasa. Supaya langsung
ke daftar rasa, set `sessionStorage.js_order_step = "menu"` lewat
`Page.addScriptToEvaluateOnNewDocument` **sebelum** `Page.navigate` (hanya
langkah yang bertahan, keranjang tetap wiped — makanya tetap wajib mengklik UI).

Skrip siap pakai: `scripts/test-bundle-stock-ui.js`, `scripts/check-nav-contact.js`,
`scripts/dump-console.js` (tangkap error console/hydration),
`scripts/dump-page-text.js`.

## 21. Hydration: jangan baca `window`/`sessionStorage` di `useState` initializer

`OrderFlow` dulu restore step dari `sessionStorage` di dalam
`useState(() => ...)`. Server selalu render `steps[0]`, klien me-restore step
tersimpan — jadi **setiap pembeli yang refresh di tengah pesanan** kena
`Hydration failed because the server rendered text didn't match the client`,
dan React membuang seluruh tree lalu render ulang (kedip + lambat).

Aturan: initializer harus deterministic dan **sama persis** antara server dan
klien. Pindahkan pembacaan storage ke `useEffect` (setelah mount). Kalau ada
effect lain yang menulis storage yang sama, effect restore **harus**
dideklarasikan lebih dulu, kalau tidak ia menimpa nilai sebelum sempat dibaca.

Gejalanya gampang dideteksi: badge "N Issue" di dev overlay Next.js.
`scripts/dump-console.js` menangkap exception-nya.

## 22. StrictMode = `true` di dev: effect unmount JALAN saat halaman baru dibuka

Sejak Next.js 13.5.1 StrictMode default `true` untuk app router
(bukti: `node_modules/next/dist/docs/01-app/03-api-reference/05-config/
01-next-config-js/reactStrictMode.md`). React lalu menjalankan
**mount → unmount → mount** di `next dev`.

Efeknya: **cleanup effect terlihat identik dengan "pengguna pindah halaman",
padahalbaru saja halaman dibuka.** Di `OrderFlow` ini menghapus
`sessionStorage.js_order_step` + mengosongkan keranjang, jadi setiap refresh
di tengah pesanan bikin halaman balik ke langkah 1 dan keranjang kosong.

Cara membedakan unmount sungguhan dari probe StrictMode:

```tsx
const reallyMountedRef = useRef(false);
useEffect(() => {
  reallyMountedRef.current = false;
  const timer = window.setTimeout(() => { reallyMountedRef.current = true; }, 0);
  return () => {
    window.clearTimeout(timer);
    if (!reallyMountedRef.current) return;  // probe StrictMode
    /* bersihin di sini */
  };
}, []);
```

Cleanup yang datang sebelum timeout = probe. Setelah timeout = navigasi.

## 23. `useSyncExternalStore` untuk baca storage tanpa hydration mismatch

Membaca `sessionStorage`/`localStorage` **di dalam `useState` initializer**
atau guarded `typeof window` = hydration mismatch kalau storage berisi nilai
yang berbeda dari render server.

Pola yang benar (sudah dipakai `CartProvider` di repo ini):

```tsx
const nilai = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
// getServerSnapshot  -> dipakai server render DAN hydration
// getSnapshot        -> dipakai SETELAH hydration untuk mendeteksi perubahan
```

Dua jebakan tambahan di sini:

1. **Jangan simpan storage lewat `useEffect([nilai])`** kalau nilai itu juga
   dibaca dari storage — effect itu akan menimpa nilai lama dengan nilai
   freshly-computed sebelum React sempat membacanya, sehingga restore selalu
   gagal. Tulis storage di event handler (mis. `goTo()`), bukan effect.
2. **`getSnapshot` harus mengembalikan nilai primitif stabil.** Kalau
   mengembalikan objek baru tiap panggilan, React loop takFinite.

## 24. RPC `security definer`: `drop function` menghapus grant

`delivery_zones` RPC (`list_active_zones`, `admin_list_zones`,
`admin_upsert_zone`, `admin_delete_zone`) semuanya `security definer` dan
di-grant ke `anon, authenticated, service_role`.

Kalau return type berubah (mis. nambah kolom), wajib `drop function` dulu —
dan **grant harus diulang setelahnya**, karena `drop` ikut menghapus ACL.
 Kalau tidak, pembeli anonymous langsung dapat error "permission denied".

Cek cepat:

```sql
select proname, prosecdef, proacl::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and proname like '%zone%';
```

## 25. PowerShell dobel-encode UTF-8 saat append ke file

Append teks Indonesia/ber-em-dash lewat `Add-Content -Encoding UTF8` dari
PowerShell 5.1 bisa merusak file: karakter `—` jadi `â€”`, `’` jadi `â€™`.

**Penyebab:** argumen `-Command` dibaca pakai codepage ANSI (CP1252), bukan
UTF-8, jadi byte UTF-8-nya berubah jadi karakter lain; lalu `-Encoding UTF8`
menulis ulang karakter salah itu sebagai UTF-8 — jadi dobel encode.

**Yang aman:** pakai tool `write` / `edit` (baca-tulis UTF-8 langsung), atau
`node -e` / skrip `.js`.

**Cara deteksi:** kalau `Get-Content` menampilkan `â€”` tapi `grep` (ripgrep)
juga menampilkan `â€”`, itu bukan cuma tampilan terminal — file-nya memang
rusak. Kalau ripgrep menampilkan `—` sementara `Get-Content` menampilkan
`â€”`, file-nya aman, cuma PowerShell yang salah baca.

Perbaikan: `git checkout -- MEMORY/<file>.md` lalu tulis ulang pakai tool
yang UTF-8-safe. Jangan `Add-Content` untuk teks non-ASCII.

## 26. Verifikasi deploy: tandanya harus BENAR-BENAR baru

`scripts/watch-deploy.js` dulu melaporkan "DEPLOY SUDAH LIVE" dalam 0,1 menit
setelah `git push` — padahal deploy baru belum mendarat. Penyebabnya tandanya
terlalu umum: dia cuma cek `/admin/pickup-delivery` bukan 404 dan "Kontak"
hilang dari footer. Dua-duanya **sudah true di deploy sebelumnya**, jadi
script-nya tidak pernah benar-benar membedakan deploy lama dari yang baru.

**Aturan:** sebelum-andalkan skrip pantau deploy, tanya "apakah kondisi ini
hanya bisa terjadi di build yang baru?" Kalau tidak, skripnya tidak berguna
dan akan memberi rasa aman yang palsu.

Contoh tanda yang benar untuk koreksi item 1: kelas CSS `<footer>` di HTML
produksi harus memuat `hidden md:block`. Kode lama (`mt-14 bg-cocoa-900 ...`)
tidak punya `hidden`, jadi HTML itu hanya mungkin berasal dari build baru.

**Tambahan:** pakai cache-buster (`?_cb=${Date.now()}`) plus header
`cache-control: no-cache` saat fetch produksi, biar tidak membaca respons CDN
basi. `Invoke-WebRequest` dari PowerShell sempat timeout 60 detik ke domain
Vercel — pakai `fetch` dari Node jauh lebih andal.
