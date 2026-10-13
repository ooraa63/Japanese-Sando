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


## 16b. Prefix key Midtrans MENIPU — jangan pakai prefix untuk menentukan mode

Key di `.env.local` ber-prefix `Mid-server-P-...` (format **production**),
padahal host yang benar-benar menerima key itu adalah **sandbox**. Diuji
2026-10-12:

| Host | Hasil |
|---|---|
| `api.sandbox.midtrans.com` | 200 `404 Transaction doesn't exist` (auth LOLOS) |
| `api.midtrans.com` | 401 `Unknown Merchant server_key/id` |

Jadi merchant **belum aktif di production** walau prefix key-nya production.
Alasannya: prefix hanya format string; yang menentukan akun terdaftar adalah
apakah verifikasi bisnis selesai di dashboard Midtrans.

**Jangan set `MIDTRANS_IS_PRODUCTION=true` hanya karena prefix key terlihat
production.** Kalau di-set, `getBaseUrl()` (`src/lib/midtrans/server.ts:87`)
membidik `api.midtrans.com`, charge selalu 401, opsi QRIS tetap nongol di UI
karena `isMidtransConfigured()` cuma cek key tidak kosong (baris 83).

**Cara cek jujur sebelum flip** (read-only, tanpa charge):

```bash
node -e "const k=process.env.MIDTRANS_SERVER_KEY;const a='Basic '+Buffer.from(k+':').toString('base64');fetch('https://api.midtrans.com/v2/PROBE/status',{headers:{Accept:'application/json',Authorization:a}}).then(r=>console.log(r.status))"
```

`404` di host production = merchant aktif, aman. `401 Unknown Merchant` =
belum, jangan flip.

**Saat flip nanti, update `.env.local` DAN Vercel Production bersamaan.**
`verifyWebhookSignatureAsync` pakai `MIDTRANS_SERVER_KEY` yang sama; kalau
Vercel masih pakai key lama, webhook balas 403 `invalid_signature` dan status
order tidak pernah sinkron (polling 5s jadi satu-satunya cadangan).


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

**Aturan:** sebelum mengandalkan skrip pantau deploy, tanya "apakah kondisi ini
hanya bisa terjadi di build yang baru?" Kalau tidak, skripnya tidak berguna
dan akan memberi rasa aman yang palsu.

Solusinya sudah dipakai sekarang: **`scripts/wait-for-live.js`**. Tandanya
diserahkan lewat command line, jadi tidak bisa basi diam-diam:

```
node scripts/wait-for-live.js 'aria-hidden class="h-[68px] md:hidden"'
```

Kalau dipanggil tanpa argumen, skrip menolak jalan — jadi tidak mungkin
terlupaikan tandanya.

Contoh tanda yang benar untuk koreksi item 1: kelas CSS `<footer>` di HTML
produksi harus memuat `hidden md:block`. Kode lama (`mt-14 bg-cocoa-900 ...`)
tidak punya `hidden`, jadi HTML itu hanya mungkin berasal dari build baru.

**Tambahan:** pakai cache-buster (`?_cb=${Date.now()}`) plus header
`cache-control: no-cache` saat fetch produksi, biar tidak membaca respons CDN
basi. `Invoke-WebRequest` dari PowerShell sempat timeout 60 detik ke domain
Vercel — pakai `fetch` dari Node jauh lebih andal.

## 27. Komponen baru yang pakai `useI18n()` wajib `"use client"`

`useI18n()` itu **client hook** (dibaca dari cookie/localStorage). Komponen
server yang memanggilnya tidak akan gagal saat `tsc` atau `eslint` — dia baru
meledak saat runtime dengan:

```
Error: Attempted to call useI18n() from the server but useI18n is on the client.
```

Halaman balas **500**, dan gejalanya jauh dari bagian yang kamu ubah.
`CategoryBand` dan `FeaturedStrip` kena ini waktu redesign 2026-10-09.

**Cek cepat sebelum `npm run build`:** kalau file baru memanggil `useI18n()`,
pastikan baris pertamanya `"use client";`.

## 28. Layout kartu sempit: jangan jejer harga + tombol dalam satu baris

Di grid 4 kolom (kartu ±150px), `justify-between` antara `PriceTag` dan tombol
"Tambah" membuat angka harga **terpotong** jadi "Rp 1..." — bukan ellipsis CSS,
tapi flex yang immersiveeminimalkan lebar harga.

Ini pola yang sama seperti nomor-nomor soal teks terpotong di kartu produk.
Solusinya: **harga di atas, tombol full-width di bawah** (`flex-col gap-2`).
Tetap terlihat sebagai satu blok "harga + tombol" seperti di referensi, tapi
tidak pernah terpotong.

## 29. Urutan deklarasi `useMemo` = urutan eksekusi (TDZ)

`const a = useMemo(() => ... b ...)` ditulis **sebelum** `const b = useMemo(...)`
tidak caught oleh TypeScript maupun ESLint. Callback-nya baru dipanggil saat
render, jadi barulah `ReferenceError: Cannot access 'b' before initialization`
muncul — di browser, bukan di build.

Saat menambah state turunan, taruh setelah semua nilai yang diacunya.

## 30. Verifikasi produksi: jangan salah tandai halaman sehat sebagai error

Dua regex "tanda error" yang sering dipakai harus **disensor** sebelum dipakai:

1. **`__NEXT_ERROR` bukan tanda error.** Shell redirect Next.js selalu
   `<html id="__next_error__">`. `/account` yang sehat (307 → `/login`) akan
   dilaporkan "GAGAL" kalau regex-nya memakai `__NEXT_ERROR`.
2. **`"This page could not be found"` ada di bundel JS SEMUA halaman.** Regex
   harus dijalankan atas HTML yang `<script>`/`<style>`-nya sudah dibuang.
   Kalau tidak, hampir semua halaman positif palsu.

Tanda error yang benar: `<h1>Application error</h1>`, `Internal Server Error`,
`Attempted to call useI18n() from the server` — dan itu pun harus dicari di
bagian HTML yang dirender, bukan payload JS.

**Tambahan:** `scripts/test-pages.mjs` menghormati `APP_URL`. Pakai
`APP_URL=https://japanese-sando.vercel.app` untuk menguji produksi dengan login
admin beneran, bukan localhost:

```bash
npx dotenv run -f .env.local -- node scripts/test-pages.mjs   # dengan $env:APP_URL diset
```

## 31. ESLint React 19: `setState` sinkron di dalam `useEffect` = error

Aturan `react-hooks/set-state-in-effect` (dan `--max-warnings=0` di project ini)
menolak `setState` yang dipanggil langsung di badan `useEffect`. Dulu pola ini
dipakai di `OrderFlow` untuk baca `sessionStorage` — sekarang wajib
`useSyncExternalStore` (lihat #23). Berlaku juga untuk hal yang digerakkan
sumber luar kecil:

- **Sapaan berdasarkan jam** → `useSyncExternalStore` dengan
  `getServerSnapshot` mengembalikan nilai tetap, `getSnapshot` membaca jam.
- **Daftar dari `localStorage`** → sama, **tapi snapshot harus di-cache**.
  `getSnapshot` yang mengembalikan array BARU tiap panggilan bikin
  `useSyncExternalStore` loop tak terbatas. Cache di modul level, ganti cache
  hanya kalau string isi storage-nya berubah:

```ts
let cachedRaw: string | null = null;
let cachedList: number[] = [];
function getSnapshot() {
  const raw = /* baca localStorage -> string */;
  if (raw === cachedRaw) return cachedList;   // referensinya sama -> aman
  cachedRaw = raw;
  cachedList = /* parse */;
  return cachedList;
}
```

## 32. `npm run build` bisa menggantung diam-diam setelah `next dev` dibunuh paksa

Kalau dev server dimatikan paksa (bukan Ctrl-C), worker Turbopack-nya
**tetap hidup** dan memegang CPU + lock di `.next`. Build berikutnya bisa
menggantung beberapa menit tanpa error.

Cek dulu sebelum build ulang:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CommandLine
```

Baris yang `.next\build\chunks\pool_entry-...` itu worker sisa — akhiri
saja. Build juga butuh `.next` **tidak dipakai** apa pun: jangan jalankan
`next dev` dan `next build` bersamaan. Kalau `.next` sudah tidak sinkron,
hapus saja (lihat #3).

## 33. Jangan mengarang angka atau kode promo di storefront

Referensi desain sering memuat angka yang tidak ada di database — rating
bintang, kode diskon, "20% OFF". Menyalinnya mentah akan menampilkan
**klaim palsu** ke pembeli.

Aturan: kalau datanya tidak ada, jangan tampilkan sebagai fakta. Pilih salah
satu:
- pakai data nyata yang setara (mis. `likes_count` + ikon hati, bukan rating
  bintang), atau
- sembunyikan section-nya sampai datanya ada (mis. "Terlaris" disembunyikan
  kalau belum ada penjualan), atau
- jadikan isi banner dari admin (mis. banner promo yang isinya diambil
  dari `free_shipping_min`, jadi begitu admin mengisinya banner otomatis
  berubah).

Yang **tidak boleh** sama sekali: mengarang kode voucher. Pembeli akan
memakainya dan gagal.

## 34. `--user-data-dir` Edge untuk screenshot = ribuan file untracked di `git status`

Screenshot produksi lewat CDP (Edge headless) butuh profil sendiri supaya tidak
menabrak profil Edge yang sedang dipakai. Kalau `--user-data-dir` diarahkan ke
dalam repo (mis. `.tmp-shots/pu4`), Edge **tidak pernah** membersihkannya: isi
foldernya `Default/`, `Edge Sidebar/`, model optimizer, cache shader — ribuan
file, dan `git status` jadi tidak terbaca.

Aturannya:
- taruh profil di luar repo (mis. `$env:TEMP`), **atau** di dalam repo tapi
  sudah di-ignore (pola `/.tmp-*` sudah ditambahkan di `.gitignore`),
- tutup Edge-nya sebelum menghapus foldernya, kalau tidak `mavis-trash` gagal
  karena file masih di-lock,
- cek `git status --short` sebelum `git add -A`, jangan asal tambah semua.

## 35. `git add -A` bisa ikut menyeret file yang bukan milikmu

Folder `Gambar/` memang **di-commit** (referensi desain Steven), tapi `.jfif`
baru bisa muncul sebagai untracked tanpa diminta — misalnya
`Gambar/UIUX 5.jfif` yang di luar konteks kerjaan. Sebelum `git add -A`, cek
`git status` dan pastikan setiap file yang akan ikut commit memang sengaja
dimasukkan. Kalau ragu, `git add -u -A` atau tambahkan eksplisit per file.

## 36. `pg` mengembalikan `bigint` sebagai STRING — tes sanitizer bisa salah

Kolom `bigint` (termasuk `flavors.id`) datang dari driver `pg` sebagai
`'1'`, bukan `1`. Kalau sebuah tes mengambil id lalu meneruskannya ke
parameter jsonb, yang terkirim jadi `["4","1"]` — **string**, bukan angka.

Akibatnya fungsi yang sengaja menyaring angka akan membuang semuanya, dan
tes terlihat "lolos" padahal hasilnya selalu `[]`. Gejalanya: semua kasus
uji mengembalikan nilai kosong yang sama, padahal kasusnya jelas berbeda.

Aturan: begitu ambil `id` dari `pg`, ubah dulu — `Number(f.id)`. Kalau
semua hasil tes identik, **curigai tesnya dulu**, bukan fungsinya.

## 37. `e ->> '0'` tidak berlaku untuk elemen jsonb SKALAR

Untuk menyaring array jsonb berisi angka:

```sql
-- SALAH: e adalah skalar (4), bukan objek. ->> dengan kunci teks selalu NULL.
where (e ->> '0') ~ '^[0-9]+$'

-- BENAR: path kosong '#>> ...' mengambil skalar sebagai teks.
where jsonb_typeof(e) in ('number','string')
  and (e #>> '{}') ~ '^[0-9]+$'
```

Bug ini muncul dua kali: sekali karena `->> '0'` (semua id terbuang), sekali
karena tesnya mengirim string (lihat #36). Dua-duanya bikin sanitizer
"selalu mengembalikan array kosong" — yang terlihat seperti logika filter
berfungsi, padahal tidak.

## 38. RPC admin bisa diuji tanpa browser: set `request.jwt.claims`

Hampir semua RPC `admin_*` diawali `if not public.is_admin()`, dan
`is_admin()` → `auth.uid()`. Dari koneksi `pg` biasa, `auth.uid()` selalu
NULL, jadi RPC-nya akan selalu menolak.

Triknya: PostgREST menaruh JWT di GUC `request.jwt.claims`. Set manual di
dalam transaksi, lalu **rollback** supaya data produksi tidak berubah:

```js
await c.query("begin");
await c.query(`select set_config('request.jwt.claims', $1, true)`, [
  JSON.stringify({ role: "authenticated", sub: adminUserId }),
]);
const r = await c.query(`select public.admin_save_settings($1::jsonb) as r`, [payload]);
await c.query("rollback");   // <-- wajib, kalau tidak data ikut tersimpan
```

Ini membuat pengujian merge/validasi RPC jadi mungkin tanpa browser,
dan aman karena selalu rollback.

## 39. Kelas warna Tailwind yang tidak dikenal = no-op SENYAP

Tailwind v4 tidak error untuk kelas yang tidak ada token-nya — warnanya
diam-diam tidak dipakai. Di project ini `honey-50`, `honey-100`, dan
`honey-600` sudah dipakai di beberapa komponen (`AppHome`,
`QrisPaymentModal`, `CompleteProfileCard`) padahal palet di `globals.css`
hanya punya `honey-300/400/500`. Akibatnya "Lihat Semua", harga di kartu
Populer, dan latar ikon kategori tidak pernah diberi warna.

Sudah diperbaiki di migration-40 (tambahan token honey). Kalau nanti lihat
UI "ada gaya tapi benar-benar tidak kena", cek dulu token-nya ada di
`@theme` — jangan langsung ganti kelasnya.

## 40. Jangan `npm run db:push` cuma untuk menerapkan satu migrasi

`db-push.mjs` menjalankan ulang `schema.sql` + **semua** migration dari awal.
Itu benar untuk DB kosong, tapi untuk DB produksi berarti menjalankan ulang
40 migrasi historis sekaligus — termasuk yang melakukan `update` pada data
live.

Untuk satu file, pakai `npm run db:apply -- supabase/migration-N.sql`
(`scripts/db-apply.mjs`). File migrasi tetap harus idempoten
(`create or replace`, `add column if not exists`, `drop ... if exists`)
supaya aman kalau nanti `db:push` dijalankan penuh.

## 41. PowerShell `Set-Content -Encoding UTF8` MERUSAK karakter Unicode

Dua kali sesi ini file .tsx rusak setelah disunting lewat PowerShell:

```powershell
$kept = $lines[0..417] + $lines[499..($lines.Count-1)]
Set-Content -Path $p -Value $kept -Encoding UTF8   # <- EM-DASH jadi "â€”"
```

Gejalanya kelihatan saat `grep` menemukan karakter aneh (`â€`, `â˜•`)
dan `tsc` / lint meledak di tempat yang tidak ada hubungannya.

Untuk pengeditan file di repo ini:
- pakai tool `edit` / `write` (menulis UTF-8 dengan benar), atau
- pakai Node: `fs.readFileSync(p,"utf8")` -> ubah -> `fs.writeFileSync(p,s,"utf8")`.

Kalau `-replace` massal memang perlu PowerShell, pakai
`[System.IO.File]::WriteAllText($p, $n, (New-Object System.Text.UTF8Encoding $false))`
agar tanpa BOM dan tanpa ruining isi. Kalau terlanjur rusak, pola yang
muncul: `â€”` -> `—`, `â€™` -> `’`, `â€œ` -> `“`, `â˜•` -> `☕`.

## 42. `react-hooks/static-components`: jangan bikin komponen saat render

Pola ini DITOLAK lint kalau nama komponen berasal dari peta objek:

```tsx
const ICONS: Record<string, typeof UserCircle> = { UserCircle, HelpCircle, ... };
const Icon = iconFor(item.icon);   // <-- "This component is created during render"
return <Icon className="size-4" />;
```

Perbaikannya: kembalikan JSX, bukan komponen.

```tsx
function iconNode(name: string): React.ReactNode {
  switch (name) {
    case "UserCircle": return <UserCircle className="size-4.5" />;
    default:           return <HelpCircle className="size-4.5" />;
  }
}
```

Dipakai di dua tempat: pemetaan ikon bar menu Profil di
`ProfileSheet.tsx` dan di `ProfileMenuClient.tsx`. Nama ikon datang dari
database, jadi mapping lewat switch juga lebih aman daripada indexing objek
dengan string dari luar.

## 43. Menyalin `store_settings` ke tabel lain = salinan yang bisa melenceng

Migration-41 mengisi bar "Hubungi Kami" & "Jam Buka" dari
`store_settings` supaya sheet Profil langsung berguna. Masalahnya: begitu
disalin, nilai itu **tidak lagi ikut berubah** kalau penjual mengedit
Pengaturan.

Akibat nyata: `address` yang rusak (`"Vihara Tian En, Jl.buffers"`) ikut
tersalin dan sekarang tampil ke pembeli sebagai isi popup.

Aturan kalau menyalin settings ke tabel lain:
- beri tahu penjual di UI bahwa isinya salinan (lihat
  `profileMenu.contactCopiedFromSettings`),
- lebih baik lagi, jangan menyalin: baca langsung dari `store_settings`
  saat render kalau bar-nya memang cuma "display setting".

## 44. `npm run lint` = `eslint` tanpa argumen = pindai SELURUH direktori kerja

`package.json` punya `"lint": "eslint"` tanpa path. Artinya ESLint memindai
apa pun yang ada di working tree — termasuk file sementara.

Gejalanya: setelah screenshot headless, `npm run lint` tiba-tiba melaporkan
`✖ 957 problems (37 errors, 920 warnings)` padahal `npm run typecheck` dan
build bersih. Penyebabnya bukan kodenya: `--user-data-dir` Chrome/Edge
menulis **profil browser utuh** (ribuan file `.js`) di dalam repo.

Aturan:
- taruh profil browser **di luar repo** (`join(tmpdir(), ...)`), bukan
  `./.tmp-...`, walaupun `.gitignore` sudah menutup `/.tmp-*`;
- kalau terlanjur menumpuk, hapus dulu baru lint. `rmSync(PROFILE)` di
  `finally` bisa gagal diam-diam di Windows karena file masih di-handle
  proses browser — bungkus error-nya kalau memang penting.

## 45. Test UI headless yang mengklik tombol = menulis DATA NYATA ke produksi

Verifikasi "tombol like berfungsi" dengan `button.click()` bukan uji yang
murni membaca: `useFlavorLikes.toggle()` langsung `POST /api/flavor-like`,
jadi setiap putaran test menulis baris sungguhan ke tabel `flavor_likes`
produksi dan menaikkan `flavors.likes_count`.

Yang terjadi di project ini (10-10-2026): 10 baris `flavor_likes` dan
`likes_count` = 6/0/2/1/1, semuanya artefak pengujian. Token yang jelas
made-up: `session_id` berawalan `s-` dengan pola `s-<random>-<epochms>`.

Aturan:
- sebelum menjalankan tes otomatis yang menyentuh UI, cek dulu apakah
  aksinya menulis ke DB (`fetch(..., { method: "POST" })`);
- kalau iya, pakai endpoint tes/dev yang tidak menulis, atau panggil
  `toggle()` dua kali (like lalu unlike) supaya angka kembali;
- setelah tes, **cek** `flavor_likes` + `flavors.likes_count` dan laporkan
  ke penjual kalau ada data uji yang bocor.

**Status data ini sekarang: sengaja DIJAGA.** Steven sudah tahu dan meminta
agar tidak dihapus — angkanya dipakai sebagai testimoni sosial agar etalase
tidak terlihat kosong (lihat decisions.md **D28**). Jadi jangan ikut
"membersihkan" angka itu. Yang tetap berlaku: laporkan kalau tes berikutnya
menambah baris baru.

## 46. Edge 155: pakai `--headless` polos, bukan `--headless=new`

Di Edge 155, `--headless=new` **tidak lagi dikenali**: proses langsung exit
dan port remote debugging tidak pernah terbuka. Gejalanya lewat Node:
`Error: CDP tidak siap` setelah menunggu 30 detik.

Yang benar: `--headless` polos + `--remote-allow-origins=*`, dan
`--user-data-dir` harus **path absolut**. Path relatif saat dipanggil dari
`spawn()` juga membuat browser exit tanpa membuka port.

## 47. `captureBeyondViewport: true` memalsukan elemen `position: fixed`

Untuk screenshot seluruh halaman, `captureBeyondViewport` dipakai supaya
halaman panjang ikut ter-render. Masalahnya: elemen fixed seperti
`MobileBottomNav` ikut ter-render di tengah gambar dan **menutupi kartu**,
sehingga terlihat seperti bug layout yang tidak ada.

Untuk screenshot satu section:
1. `el.scrollIntoView({ block: "start" })` lewat `Runtime.evaluate`,
2. `Page.captureScreenshot({ format: "png" })` **tanpa** `captureBeyondViewport`.

Hasilnya persis seperti yang dilihat pengguna.

## 48. Kartu di dalam `<li class="flex">` TIDAK otomatis mengisi lebar sel grid

Ini jebakan yang membuat "ukuran kartu tidak sama semua" (10-10-2026) dan
sulit ditebak karena gejalanya murni CSS.

Struktur beranda "Populer":
```tsx
<ul className="grid grid-cols-3">
  <li className="flex"><Kartu /></li>
</ul>
```

`li` adalah grid item (jadi lebarnya = lebar sel, benar), TAPI `li` juga
`display: flex` dengan arah **baris**. Pada flex baris, `align-items: stretch`
hanya meregangkan sumbu **TEGAK**. Lebar kartu diurus oleh sumbu **UTAMA**,
yang governed oleh `flex-basis: auto` — artinya **lebar kartu = lebar
isi teksnya**, bukan lebar sel.

Terukur di HP: sel 113px, tapi kartunya 109px / 95px / 104px sesuai panjang
nama ("Cookies & Cream" vs "Choco Matcha"). Foto `aspect-square` mengikuti
lebar itu → tinggi foto berbeda-beda, dan di PC sisa ruang terbaca sebagai
celah yang kegedean.

Perbaikannya `w-full` pada komponen kartu.

Section "Menu" TIDAK kena masalah ini karena kartunya anak grid langsung
(`<div className="grid grid-cols-3">` → `<Kartu />` tanpa pembungkus) —
grid item meregangkan ke sel di kedua sumbu.

**Aturan:** kalau sebuah komponen kartu dibungkus elemen flex (atau inline,
atau `width: max-content`), ia **tidak** otomatis selebar selnya. Tambahkan
`w-full`. Kalau ragu, ukur dengan `getBoundingClientRect()` per kartu dan
bandingkan — jangan pakai perkiraan mata.

## 49. `aspect-*` di dalam flex column tetap bisa dipampatkan

Kartu `flex h-full flex-col` di dalam `li` yang diregangkan ke tinggi baris
grid: saat kartu diregangkan ke tinggi yang lebih kecil dari kebutuhan,
flexboxshrink item-nya. Kontainer foto `aspect-square` ikut menyusut —
terukur 117px / 101px / 112px padahal semua lebarnya sama dan
`aspect-ratio: 1 / 1` tetap tertulis di `getComputedStyle`.

Jadi `aspect-ratio` yang benar di `getComputedStyle` **tidak menjamin**
tinggi akhirnya benar. Tambahkan `shrink-0` pada elemen yang ukurannya
harus dijaga persis (foto, ikon, thumbnail).

**Cara memastikan tidak menebak:** ukur tinggi tiap kartu/foto lewat
`getBoundingClientRect()` di headless browser dan bandingkan angkanya.
Bug "kartu tidak sama tinggi" hampir selalu terlihat sebagai angka yang
tidak sama, bukan sebagai selisih halus yang perlu dilihat mata.

## 50. Mode "ubah" harus dikeluarkan dari perhitungan stok sendiri

Setiap kali sebuah item bisa diedit (bukan hanya ditambah), perhitungannya
harus bisa mengeluarkan kontribusinya sendiri lalu menghitung ulang.

Kasus di project ini (11-10-2026): bundle yang sudah di keranjang boleh dibuka
lagi untuk mengganti rasa. `OrderBundleModal` menghitung sisa stok lewat
`remainingStockByCategory(categories, quantities, cart.bundles, slots)` — dan
`cart.bundles` **sudah memuat** bundle yang sedang diedit. Ditambah `slots`
baru, slot lama ikut mengurangi stok dua kali. Efeknya pembeli melihat
"Tersedia 0" padahal stoknya masih ada, dan tidak bisa menyelesaikan paket.

Perbaikannya: filter entry yang sedang diedit keluar sebelum menghitung.

```ts
const otherBundles = editingEntry
  ? cart.bundles.filter((b) => b.id !== editingEntry.id)
  : cart.bundles;
```

Aturan umum: kalau sebuah fitur bisa menambah DAN mengubah item yang sama,
cek ulang semua tempat yang menghitung agregat (stok, total harga, jumlah
item). Perbaikannya hampir selalu "kurangi dulu, lalu hitung ulang".

## 51. Halaman `/order` adalah wizard 4 langkah — produk ada di langkah 2

Uji UI `/order` dengan headless browser TIDAK bisa langsung
`querySelector` kartu produk. Halaman ini stepwise:
`01/04 Data Kamu` → `02/04 Pilih Rasa` (produk + bundle) → `03/04 Pembayaran`
→ `04/04 Konfirmasi`.

Di langkah 1 semua input kosong (bahkan `required` pun `false`, validasinya
berbasis state React), jadi `button.click()` biasa tidak cukup.

Cara yang berhasil:
1. isi `input#name` & `input#phone` lewat native setter
   (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`)
   lalu dispatch `input` + `change` — menulis langsung ke `.value` tidak memicu
   state React;
2. klik tombol "Lanjut";
3. tunggu ~3 detik, karena langkah ini memuat banyak komponen client
   (keranjang, hitung stok, bundle).

Konsekuensi: tes apa pun yang menyentuh `/order` harus melewati langkah ini
dulu. Gagal mengisinya membuat tes salah menyimpulkan "kartu tidak ada" padahal
hanya salah langkah.

## 52. Ganti signature RPC = ada jendela transisi antara DB dan deploy

Mengubah jumlah argumen fungsi PostgREST (`track_by_code(text)` jadi
`track_by_code(text, text)`) **tidak** kompatibel ke belakang. Selama kode lama
masih hidup, panggilan lama dapat `404 PGRST202`
("Could not find the function ... in the schema cache") — bukan NULL, bukan
error 500.

Artinya `db:apply` dan deploy harus dipandang sebagai satu langkah. Kalau deploy
dulu, halaman track versi lama rusak sampai kode baru selesai online. Kalau
`db:apply` dulu, halaman lama hanya jatuh ke "tidak ditemukan" (aman, karena
`TrackForm` memperlakukan `rpcError` sama seperti `data === null`).

Verifikasi signature tanpa browser: `fetch` langsung ke
`{SUPABASE_URL}/rest/v1/rpc/nama_fungsi` pakai `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
sebagai `apikey` + `Bearer`. Untuk dapat data uji, query lewat `pg` (lihat
`DATABASE_URL` di `.env.local`).

## 53. ID yang berasal dari `pg` bisa berupa STRING, dan `pg` tidak di-resolve dari luar repo

`pg` mengembalikan `bigint` sebagai string (lihat #36). Dan skrip sementara
yang diletakkan di `%TEMP%` **tidak bisa** `import pg from "pg"` — ESM tidak
perhatikan `NODE_PATH`. Dua jalan keluarnya: simpan skrip di dalam repo lalu
hapus setelah selesai, atau import lewat path absolut:

```js
import pg from "file:///D:/Minimax/Japanese%20Sando/node_modules/pg/lib/index.js";
```

## 54. Badge notifikasi fiktif di top bar dihapus

Lonceng di top bar sempat punya titik oranye `bg-honey-400` di pojok sebagai
penanda "ada notifikasi". Di database **tidak ada tabel notifikasi** sama
sekali — jadi badge itu pemalsuan (gotcha #33). Saat lonceng diarahkan
ke `/track`, titiknya ikut dihapus. Kalau nanti notifikasi sungguhan ada,
tampilkan angka unread dari RPC, jangan pakai titik dekoratif.

## 55. `Stop-Process` pada wrapper `cmd.exe` TIDAK mematikan server Next

Server lokal untuk verifikasi dijalankan lewat
`Start-Process cmd.exe /c "npm run start"`, jadi proses yang tercatat adalah
`cmd.exe`, bukan `node`.

`Stop-Process -Id <pid cmd>` hanya membunuh cmd-nya. Process `node` tetap
duduk di port 3000 dengan **build lama**, dan `npm run start` yang baru akan
gagal bind port (atau diam-diam tidak connect). Gejalanya sangat menyesatkan:
setiap perubahan kode "tidak muncul" padahal `tsc`, `lint`, dan `build` hijau
semua, dan `.next` sudah benar.

Cara aman — cari pemilik portnya:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Lalu tunggu sampai `Get-NetTCPConnection -LocalPort 3000` kosong baru
menjalankan server baru. Cara kedua yang lebih aman: **bangun ulang lalu cek
HTML-nya langsung** sebelum_rules headless, misalnya `Menu Baru` muncul atau
tidak.

## 56. `node -e "..."` di PowerShell rusak oleh backtick, `$`, dan `'`

PowerShell ikut memproses karakter di dalam string yang dikirim ke `node -e`:

- backtick jadi escape (`\``n` = newline, `\``t` = tab, backtick lain hilang),
- `$1` dianggap variabel sehingga hilang,
- `'` di dalam string bisa menutup kutipan lebih awal.

Akibatnya kode yang ditulis benar jadi salah, dan error-nya jauh dari penyebab
(asli: "syntax error at or near \"::\"", karena `$1::jsonb` kehilangan `$1`).

Untuk skrip yang memuat backtick atau `$`, **tulis skrip ke file** lalu jalankan
`node <file>` — jangan `-e`. Contoh yang dipakai berulang kali: skrip sekali
pakai di `%TEMP%`, hapus setelah selesai. Dan perhatikan: skrip di `%TEMP%`
tidak bisa `import pg from "pg"` (lihat #53) — pakai path absolut ke
`node_modules`.

## 57. Hitung kemunculan teks badge dari `querySelectorAll` bisa menghasilkan angka 2x

Badge "New" di kartu produk tersusun dari `<span>` luar (ikon + teks) dan
`<span class="truncate">` di dalam. Keduanya punya `textContent.trim()` yang
sama, jadi `filter(s => s.textContent.trim() === 'New')` menghitung **dua kali
per kartu**.

Saat memverifikasi badge, hitung per-kartu (`section.querySelectorAll('li')`)
atau pakai `:scope >` — jangan menghitung span global, atau nanti terlihat
seolah badge dobel padahal tidak.

## 58. Hapus route = `.next` masih menyimpan validator-nya

Setelah `src/app/admin/(dashboard)/vouchers/` dihapus, `npm run build` gagal
dengan:

```
.next/dev/types/validator.ts(134,39): error TS2307:
  Cannot find module '../../../src/app/admin/(dashboard)/vouchers/page.js'
.next/types/validator.ts(134,39): error TS2307: ...
```

File sumber sudah benar; yang salah adalah **validator hasil generate** di
`.next` yang masih menunjuk route lama. `npx tsc --noEmit` juga ikut gagal untuk
alasan yang sama, jadi ini bukan salah kode.

Solusi: hapus `.next` lalu build ulang. `rm -- ".next"` (diarahkan ke
`mavis-trash`), foldernya gitignored jadi aman dihapus.

## 59. `fetch` tanpa cookie admin tidak bisa menguji route `/admin/*`

`src/proxy.ts` mengarahkan setiap `/admin/*` yang tanpa session ke
`/admin/login` dengan status **307**. Jadi `fetch("/admin/vouchers")` polos
mengembalikan 307 — itu jawaban middleware, bukan jawaban route-nya, dan akan
disalahartikan "route masih ada".

Untuk menguji apakah sebuah route admin benar-benar hilang, sertakan cookie
session admin seperti yang dilakukan `openPage()` di `scripts/test-pages.mjs`:

```js
await fetch(`${APP}/admin/vouchers`, {
  headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
});
```

Dengan begitu 404 yang muncul benar-benar 404 dari router, bukan pengalihan.

## 60. Mengubah fungsi PostgreSQL = salin utuh definisi yang SEDANG live

Tidak ada cara mengubah satu baris di dalam fungsi. Untuk menghapus satu
kondisi dari `create_order` (300+ baris), definisi **harus** diambil verbatim
dari migrasi yang paling akhir yang mendefinisikannya, baru diubah satu baris.
Menyalin dari migrasi lama = mengembalikan fitur yang sudah pernah diupgrade.

Cara aman: cari migrasi terakhir yang punya `create ... function public.<nama>`
(migration-33 untuk `create_order`, bukan migration-18 yang terlihat lebih
"klasik"), lalu generate file migrasi baru dengan skrip supaya tidak salah
ketik. Hasil generate selalu diperiksa ulang sebelum `db:apply`.

Dan **`create or replace`, bukan `drop` + `create`**: drop menghapus grant
`execute` untuk anon & authenticated, sehingga pembeli tidak bisa lagi membuat
pesanan. Tulis ulang `grant execute` secara eksipisit sebagai pengaman.

## 61. `FlavorCard` punya TIGA varian — ubah yang salah diam-diam tidak kena

`FlavorCard` mengembalikan JSX lebih awal di dua titik, jadi isinya **tiga
varian terpisah** yang nyaris tidak berbagi blok:

| Varian | Dipakai di | Ciri |
| --- | --- | --- |
| `storefront` | halaman `/order` | foto 4:3, tombol Add/stepper full-width |
| `dense` | beranda ("Menu", "Populer", "Menu Baru") | foto 1:1, baris like + terjual |
| default | kartu lama / tempat lain | baris like + terjual + stok di bawah harga |

Baris "jumlah like / terjual / sisa stok" ada di varian **default**, tapi
`/order` memakai varian **`storefront`** — jadi mengubah props di
`OrderMenuBrowser` (`showSocial`, `showSold`, `showStock`) **tidak}$
menghasilkan apa-apa, dan tidak ada error apa pun.

Gejalanya: setelah ubah, kartu tetap sama persis; `tsc` dan `eslint` hijau;
hati pojok yangZZH kembali muncul (berarti build-nya memang baru) sehingga
terlihat kontradiktif.

Cara aman: sebelumcredited mengubah, cek **mana** dari tiga `return` yang
memang dipakai. Kalau tidak yakin, buat screenshot sebelum & sesudah dan
bandingkan, jangan relies pada feeling.

## 62. "Maksimal {left} per rasa" — jangan pakai sisa stok sebagai pembatas per item

Bug yang pernah ada (11-10-2026, sudah diperbaiki):

```js
const next = qty + 1;
if (stockEnabled && left > 0 && next > left) { /* tolak */ }
```

`left` = sisa stok kategori **setelah seluruh keranjang dikurangi**, bukan
sisa per item. Membandingkan `next` dengan `left` menghasilkan:
- plafon palsu (stok 10, keranjang 5 → `6 > 5` ditolak, padahal aman);
- dan kebalikannya, saat `left === 0` guard-nya justru dilewati karena syarat
  `left > 0` tidak terpenuhi.

Aturan yang benar untuk pemanggil mana pun: tambah satu item **hanya** berarti
"apakah masih ada sisa?", jadi cukup `if (left <= 0) tolak`.

Yang sama berlaku untuk **kalimat** error-nya. "Maksimal {n} per rasa" membuat
pembeli (dan Steven) mengira ada plafon per rasa padahal tidak ada — pakai
`stockLeft` ("Sisa {n} pcs untuk semua rasa") atau `outOfStock`.

## 63 - `pg_get_functiondef` TIDAK menutup statement dengan titik koma

Menyalin definisi fungsi PostgreSQL ke file migrasi dengan
`pg_get_functiondef` menghasilkan `... $function$` **tanpa** titik koma di
akhirnya. Kalau dua definisi digabung, SQL gagal dengan
`syntax error at or near "CREATE"` - pesan yang tidak mengarah ke penyebab
sesungguhnya.

Setiap definisi hasil dump harus diakhiri sendiri sebelum statement berikutnya.

## 64 - Mengubah `create_order`: salin definisi LIVE, bukan dari file migrasi

File migrasi bisa terlihat benar tapi TIDAK sama dengan yang benar-benar
terpasang di database. Versi live bisa datang dari migrasi lain, atau sudah
di-`create or replace` manual di luar riwayat repo.

Alur yang benar: `select pg_get_functiondef(oid)` untuk versi live, pakai itu
sebagai dasar, suntik baris baru, lalu `create or replace` (bukan `drop` +
`create`, supaya grant execute tidak hilang).

## 65 - `coalesce((payload->>'x')::boolean, default)` mereset kolom yang tidak dikirim

Kalau sebuah kolom boolean baru bisa diubah dari lebih dari satu tempat
(form DAN toggle cepat di daftar), pola `coalesce((p_payload ->> 'is_new')::boolean, false)`
berarti: key tidak dikirim = nilai dipaksa jadi `false`. Toggle cepat yang
mengirim sebagian field akan **memadamkan** kolom yang tidak ikut dikirim.

Pola aman: `case when p_payload ? 'is_new' then coalesce(...) else is_new end`.
Terapkan ke setiap kolom baru seperti ini.

## 66 - `is_preorder_open`, bukan `preorder_enabled`

Untuk menguji halaman `/order` saat pre-order tutup, halamannya merender layar
"sedang tutup" sehingga `test-pages.mjs` gagal - itu bukan regresi kode. Buka
sementara lewat `update public.store_settings set is_preorder_open = true`,
tes, lalu kembalikan ke `false`.

## 67 - Sheet profil: navigasi halaman nyata butuh callback TERPISAH dari `onOpen`

Bar menu Profil punya dua perilaku: buka popup (`onOpen`) atau buka halaman
(`href`). Kalau `href` memakai `onClick={onOpen}`, sheet akan tetap membuka
popup **dan** navigasi sekaligus.

Butuh dua callback terpisah: `onOpen` untuk popup, `onNavigate` (menutup
sheet) untuk link.

## 68 - Dua sumber kebenaran untuk label yang sama pasti tidak sinkron

Menyimpan pilihan "New" di `store_settings.new_flavor_ids` DAN
`flavors.is_new` berarti Steven punya dua cara menandai produk baru, dan
akan ada state yang tidak sesuai maksudnya.

Pilih **satu** sumber. Toggle di form flavor jauh lebih alami karena menempel
pada produknya, jadi kolom settings yang lama dibiarkan (data) tapi UI-nya
dibuang.

## 69 - Screenshot headless admin: tombol "tambah rasa" hanya muncul SETELAH klik kartu kategori

`/admin/menu` menampilkan daftar kategori lebih dulu. Tombol tambah rasa ada
di dalam panel kategori, bukan di halaman utama. Skrip yang langsung mencari
tombol "tambah rasa" tidak akan menemukan apa-apa, dan laporan verifikasi
beralih jadi "modal tidak ketemu".

Kalau selector tidak ketemu, dump dulu
`[...document.querySelectorAll('button')].map(b => b.innerText)`. Membaca
daftar tombol lebih cepat daripada menebak struktur DOM.

## 70 - `window.confirm` = hapus yang bisa "menghilang sendiri"

`window.confirm()` bisa ditutup (Esc / Cancel) tanpa callback apa pun yang jalan.
Artinya aksi merusak bisa dilewati begitu saja dan PENJUAL tidak mendapat umpan
balik - Persisyin yang dilaporkan Steven 12-10-2026: "menu sudah delete tapi di
web ga kehapus".

Diagnosis yang benar: cek dulu apakah bar-nya benar-benar ada di database
(`select ... from flavors where name_id ilike '%mala%'`), baru telusuri RPC-nya.
Kalau backend-nya sehat, masalahnya di lapisan konfirmasi UI, bukan di
database.

## 71 - Skrip Node: `set_config('request.jwt.claims', ..., true)` hilang di query berikutnya

`pg.Client` menjalankan tiap query dalam transaksi implisit sendiri. Kalau
`set_config(..., is_local => true)`, setting-nya ikut hilang di akhir transaksi
itu, jadi query berikutnya jalan sebagai `postgres` biasa dan RPC admin membalas
`not_authorized`.

Untuk menguji RPC admin lewat skrip, pakai `is_local => false` (level sesi).

## 72 - Skrip Node: kolom `id` tidak ada di `public.admins`

Primary key tabel `admins` adalah `user_id` (uuid), bukan `id`. `select id from
public.admins` langsung gagal `42703 column "id" does not exist`. Isinya:
`user_id, email, full_name, role, is_active, created_at`.

## 73 - `pg_get_functiondef` TIDAK menutup statement dengan titik koma

Hasil `pg_get_functiondef()` berakhir dengan `$function$` tanpa `;`. Kalau
hasilnya langsung disambung dengan statement berikutnya (`grant execute ...`),
file migrasi gagal dengan `syntax error at or near "grant"` - dan karena
`create or replace function` sudah dieksekusi statement sebelumnya, sebagian
DDL sudah terlanjur terpasang di database.

Jadi tiap definisi fungsi harus diakhiri sendiri sebelum digabung. Yang paling
aman: jalankan migrasi per-statement (dengan pemisah dollar-quote yang benar)
supaya nomor statement yang gagal langsung diketahui.

## 74 - `RETURNS TABLE` yang berubah -&gt; `create or replace function` DITOLAK

Kalau bentuk tabel balik sebuah fungsi berubah (mis. nambah kolom
`shipping_discounts`), Postgres menolak dengan `42P13 cannot change return type
of existing function`. Yang benar: `drop function if exists ...;` -&gt;
`create function ...` (bukan or replace) -&gt; pasang ulang grant
(`anon`, `authenticated`, `service_role`).

## 75 - `react-hooks/set-state-in-effect` (React Compiler lint)

`useState` + `useEffect` untuk membaca `localStorage` kena aturan
`react-hooks/set-state-in-effect` di `npm run lint` (ERROR, bukan warning).
Ganti dengan `useSyncExternalStore` + snapshot yang referensinya stabil
(cache `JSON.parse` berdasarkan string mentah, jangan parse ulang tiap call).

## 76 - Scanner karakter asing perlu dua lapis

Non-Latin/mojibake saja tidak cukup. Bug penulisan yang paling sering muncul
adalah DUA KATA TEMPEL ("yangdiedit", "fee yangdiedit", "memakաղai") karena
spasi hilang - lolos dari scanner karakter asing dan baru kelihatan saat
membaca SQL/komentarnya di database. Scanner `.tmp-scan2.mjs` menambahkan
pola `<partikel Indonesia><huruf>` untuk menangkap ini.

Karantanya: pakai `\b(yang|dan|...)[a-z]{2,}\b` (kata yang HARUS diikuti
spasi), bukan `[a-z](yang|dan|...)\b` (kata yang jadi akhiran) - versi kedua
salah semua karena "selalu"/"boleh"/"terlalu" jadi false positive.

## 77 - `admin_save_flavor` HAPUS kolom yang tidak ada di payload

RPC `admin_save_flavor` memakai
`coalesce((payload->>'is_new')::boolean, false)` - jadi kalau kunci `is_new`
tidak ada di JSON payload, nilainya jadi `false`, bukan "jangan diubah".

Akibatnya toggle admin yang kirim payload sebagian (`toggleFlavorActive`,
`toggleFlavorFeatured`) diam-diam menghapus label "New" dari produk itu.
Setiap kali menambah toggle baru di form rasa, **kirim SEMUA kolom flag**
(`is_active`, `is_featured`, `is_new`, `stock_enabled`) - jangan hanya yang
berubah. Pola `coalesce(x, false)` aman untuk kolom yang baru, tapi produk
yang sudah punya nilai lama akan ditimpa jadi `false`.

## 78 - Warning `core.autocrlf` itu wajar, bukan diff noise

`core.autocrlf=true` tanpa `.gitattributes` bikin `git diff` mencetak
"LF will be replaced by CRLF the next time Git touches it" untuk file yang
sekarang LF. Itu cuma warning, **bukan** diff noise: index menyimpan LF, jadi
blob yang ter-commit sama saja. Jangan buru-buru mengonversi file ke CRLF
sendiri - working tree repo ini memang campuran (mis. `id.ts` CRLF,
`page.tsx` LF) dan sudah begitu sejak awal.

## 79 - Badge kartu 3 kolom:flex `shrink` menutupi truncation

`truncate` di span TERCILAM hanya diam-diam: span luar punya `min-w-0 shrink`,
jadi flex MENEKAN lebarnya sampai muat. Cek `badge.scrollWidth >
badge.clientWidth` pada span LUAR akan selalu false - yang benar yang harus
diperiksa adalah **span dalam** (`span.truncate`).

Ruang badge di baris foto kartu 3 kolom (viewport 390px) sangat ketat:

| bagian | lebar |
|---|---|
| baris foto | 111px |
| hati `size-7` + `gap-1` | 32px |
| sisa untuk badge | ~79px |

Lebar badge = teks + ikon + gap + padding horizontal. "Favorite" di
Plus Jakarta Sans bold: 35.9px @9px, 39.9px @10px. Jadi `text-[10px]` +
ikon `size-3` + `gap-0.5` + `px-1.5` = ~66px (muat), tapi `px-2` + `gap-1`
= ~72px plus Heart jadi **terpotong jadi "Favo..."**.

Ukur lewat CDP (`getBoundingClientRect` + bikin span sementara untuk mengukur
teks), jangan menebak dari screenshot saja. Catatan tambahan: `clip` pada
`Page.captureScreenshot` memakai koordinat **dokumen**, jadi `y` harus
ditambah `window.scrollY`; `getBoundingClientRect()` mengembalikan koordinat
viewport.

## 80 - Label admin di halaman `/admin/*` tidak ada di HTML SSR

`MenuClient` dsb. ambil data lewat Supabase di client, jadi HTML dari `fetch`
(`/admin/menu`) tidak memuat teks label apa pun - termasuk label toggle.
`grep` HTML tidak bisa membuktikan label sudah benar.

Cara cek yang benar: Edge headless + CDP, set cookie
`sb-<projectRef>-auth-token` (`Network.setCookie`, `domain: "localhost"`,
`value: encodeURIComponent(JSON.stringify(session))`), lalu klik baris
kategori (baris flavor tidak ada sebelum kategori dipilih), klik "Ubah" sampai
modal berisi "Ubah rasa", baca `innerText`-nya, lalu tutup dengan "Batal".

Selector jebakan: teks kategori mengandung kata "jenis" ("Sando Sandwich /
5 rasa"), dan tombol "Tambah jenis makanan" juga mengandung kata itu - klik
yang salah akan membuka modal tambah kategori. Match /^Sando Sandwich/ atau
nama kategori spesifik, bukan /jenis/.

## 81 - Peta tidak bisa diverifikasi dari screenshot headless

Mapbox GL JS **tidak** melakukan render loop tanpa compositor, jadi di Edge
headless: canvas WebGL terbentuk, WebGL 2.0 ada, style + font + icon terunduh
200, tapi **tidak ada satu pun permintaan tile vektor** dan area peta tampil
kosong. Tuple `(canvas ada, request Mapbox 200, area peta kosong)` = artefak
headless, BUKAN token rusak. Tried `--headless=new --use-angle=swiftshader
--enable-unsafe-swiftshader` maupun `--headless=old`; hasilnya sama.

Cara memverifikasi token dengan benar: panggil endpoint-nya langsung di luar
browser. Untuk token `pk.` public scope, semua ini harus 200:

- `api.mapbox.com/geocoding/v5/mapbox.places/<q>.json`
- `api.mapbox.com/styles/v1/mapbox/streets-v12` (style JSON)
- `api.mapbox.com/styles/v1/mapbox/streets-v12/sprite@2x.png`
- `api.mapbox.com/v4/mapbox.mapbox-streets-v8/{z}/{x}/{y}.vector.pbf` ← ini
  yang membuktikan ada scope `tiles:read`

Hindari menebak URL tile: bentuk `@2x` pada endpoint `v4` memang 404 dan itu
bukan tanda akses ditolak.

## 82 - `vercel env add` menolak nama `NEXT_PUBLIC_*` tanpa `--type`

CLI memblokir command itu dengan pesan:choose `--type secret` (ganti nama)
atau `--type config` (biarkan publik). Untuk `NEXT_PUBLIC_MAPBOX_TOKEN`
jawabannya `--type config` - nilai memang meant untuk diekspos ke browser.

Nilai dikirim lewat stdin (PowerShell):
`"pk...." | npx vercel env add NEXT_PUBLIC_MAPBOX_TOKEN production --type config --scope ooraa64`

## 83 - Di flow pemesanan, peta HANYA muncul di zona `requires_address`

`OrderFlow.tsx` merender `AddressPicker` hanya kalau
`draft.deliveryMethod === "delivery" && currentZone?.requires_address`. Zona
fixed seperti "Vihara Tian En" / "UVERS" sengaja **tidak** menampilkan peta
(menampilkan kartu lokasi statis). Jadi saat menguji, urutan yang benar:

identitas -> (tambah 1 rasa ke keranjang) -> tombol "Lanjut" **di dalam sheet
keranjang yang dibuka dari sticky bar bawah** (bukan tombol di step utama)
-> "Diantar" -> zona yang `requires_address` -> "Cari alamat di peta".

## 84 - `| npx vercel env add` di PowerShell menyimpan NEWLINE di nilai

PowerShell menambahkan newline saat menulis ke stdin, dan Vercel menyimpannya
apa adanya. Efeknya nyata danozon: variabel `NEXT_PUBLIC_*` berisi
`"pk...\n"`, ter-inline ke bundle, dan Mapbox membalas **401** di produksi
sementara lokal tetap jalan (lokal baca `.env.local`, bukan stdin).

Gejalanya khas: request ke `api.mapbox.com` returning 401 padahal token-nya
sudah benar di file lokal.

Perbaikan: pakai flag `--value` yang tidak menambah newline.

```
npx vercel env add <NAME> production --type config --value "<nilai>" --yes --scope ooraa64
```

Cara memastikan: setelah deploy, jalankan headless ke domain produksi dan
periksa status response ke `api.mapbox.com`. Kalau 401, cek cara penambahannya
sebelum menebak tokennya salah. Catatan: `--type config` wajib untuk nama
`NEXT_PUBLIC_*`, kalau tidak CLI menolaknya (lihat #82).

## 85 - Ganti font cukup arahkan `--font-display`, jangan edit 26 file

Utility class `font-display` dipakai 54 kali di 26 file, tapi semuanya
menunjuk ke CSS variable yang sama di `globals.css`. Mengubah satu
baris `--font-display` sudah mengubah seluruh aplikasi:

```
--font-display: var(--font-jakarta), ui-sans-serif, system-ui, sans-serif;
```

Jangan mengganti nama class-nya jadi `font-sans` - itu memancing edit
massif dan memicu regresi padding di komponen padat (pernah merusak
badge kartu menu, lihat #80). Nama `font-display` sendiri bukan
penanda serif, dia nama token tema.

Langkah wajibnya: hapus juga import font lama di `layout.tsx`
(`next/font/google`), kalau tidak Next tetap mengunduh font yang
tidak dipakai.

Verifikasi bukan dengan membaca CSS, tapi dengan mengambil
`getComputedStyle` dari body, heading, dan satu elemen ber-
`font-display` lalu cocokkan `fontFamily`-nya.

## 86 - Regex deteksi kata menempel harus tanpa `\s*`

Scanner kata menempel (menggabungkan partikel ke kata berikutnya) yang
menggunakan `\s*` gagal terus karena kata Indonesia sah berprefiks
`di-` ikut kena: `diperbesar`, `ditandai`, `dihapus`, `dipertahankan`.
Pakai `\s*` juga resurrect kata yang sebenarnya menempel.

Gunakan pola tanpa `\s*` untuk partikel (`di`, `ke`, `dan`, `atau`,
`yang`, `untuk`, `dengan`) dan andalkan daftar putih untuk pengecualian.

Efek samping yang sama berlaku untuk deteksi font: regex
`/serif/i` akan cocok dengan kata **"sans-serif"**, jadi
`adaSerif: true` pada hasil scan berarti false positive skrip, bukan
font serif yang bocor. Selalu cocokkan `fontFamily` hasil
`getComputedStyle`, bukan nama font di CSS.

## 87 - `admin_upsert_zone` menimpa koordinat jadi NULL kalau payload kosong

RPC `admin_upsert_zone` (lihat `supabase/migration-25.sql` baris
170-196) memakai `lat = excluded.lat`. Kalau form admin tidak mengirim
lat/lng, `excluded.lat` NULL dan koordinat zona yang sudah ada **hilang**
dari DB - tidak ada error, tidak ada backup.

Jadi saat membuat form admin tanpa peta, `onSave` **wajib tetap mengirim**
`lat`/`lng`/`radius_km` yang dibaca dari zone yang sedang diedit, bukan
menghapus field-nya dari payload.

Perilaku yang sama berlaku untuk form mana pun yang kolomnya dihapus
dari UI tapi kolomnya masih ada di DB: hapus dari UI != hapus dari
payload upsert.

## 88 - `scrollIntoView` tidak selalu menggeser halaman; pakai roda mouse

Halaman admin dan `/order` memakai container sendiri dengan `overflow`
tersendiri. Calling `element.scrollIntoView()` lalu membaca
`window.scrollY` menghasilkan `0` - padahal elemennya sudah bergeser
di dalam container. `document.scrollingElement.scrollTop` juga tidak
berdampak.

Akibatnya `Page.captureScreenshot` selalu menghasilkan frame yang sama
(bagian atas halaman), dan terlihat seolah-olah elemen target tidak ada
padahal `getBoundingClientRect()` menunjukkannya ada.

Cara yang bekerja: `Input.dispatchMouseEvent` dengan
`type: "mouseWheel"` dan `deltaY` positif beberapa kali, lalu cek
ulang `getBoundingClientRect()` sampai `y` masuk viewport.

Always verifikasi "elemen ini tampil atau tidak" dengan dua sumber:
getBoundingClientRect (posisi) **dan** screenshot setelah scroll
sungguhan. Satu saja bisa berbohong.

## 89 - Menghapus elemen dari satu blok render saja tidak cukup

Badge bintang "Favorite" dihapus dari kartu produk, dan DIGITAL UI
begitu: ada DUA blok render di `FlavorCard.tsx` - kartu `dense` (3 kolom)
dan kartu besar (non-dense, dipakai di /order). Yang dense memakai
`showBadge && flavor.is_featured`; yang besar membaca
`flavor.is_featured` **langsung** dan sama sekali tidak pernah menyebut
`showBadge`.

Akibatnya mengubah default `showBadge = false` saja tidak menghapus
badge dari kartu besar - dan bug itu lolos dari `tsc`, `lint`, dan
`build` karena semuanya tetap valid.

Aturan: kalau sebuah prop controlling perilaku punya beberapa blok render
dalam satu file, grep nama prop itu DAN cari akses field langsung di JSX
sebelum menyatakan selesai. Perubahan yang hanya menyentuh satu cabang
selalu perlu diuji di browser, bukan hanya dikompilasi.

Cara cepat verifikasi penghapusan elemen di produksi: hitung kemunculan
teksnya di HTML hasil server (`(text.match(/Kata/g) || []).length`), bukan
cuma `regex.test()`. Kalau elemennya masih ada di N kartu, jumlah
kemunculannya naik dari 1 jadi 1 + N - kelihatan sekilas.

## 90 - Menguji elemen interaktif: periksa strukturnya, jangan diklik

`POST /api/flavor-like` menulis ke tabel `flavor_likes` di database
PRODUKSI. Mengklik hati saat verifikasi headless bukan hal yang aman
seperti mengetik ke keranjang (yang cuma localStorage) - ini mengubah
counter global yang dilihat semua pembeli.

Cara aman memverifikasi elemen interaktif: periksa signature DOM-nya
sebagai ganti menekan. Untuk tombol like, cukup cek
`section.querySelectorAll('button[aria-pressed]')` - kalau jumlahnya
lebih dari 0, tombolnya ada dan punya state terikat. Kalau elemennya
kembali jadi `<span aria-hidden>`, cek ini otomatis gagal.

Dan untuk teks yang juga muncul di section lain (mis. "terjual" yang
hanya ada di kartu), jangan pakai `regex.test()` di seluruh halaman -
checkout jadi false positive. Isolasi substring section-nya dulu:
ambil dari heading sampai `</section>` terdekat.

## 91 - `FlavorCard` punya 3 jalur render; fitur harus ada di semuanya

Satu file, tiga tampilan berbeda, masing-masing dengan markup sendiri:

- varian `storefront` (sekitar baris 170) - dipakai halaman **/order**,
  aksi di `StorefrontAction`
- varian `dense` (sekitar baris 350) - grid 3 kolom di beranda
- varian non-dense (sekitar baris 490) - kartu besar, aksi di
  `FlavorCardStepper`

Awalnya field "catatan per item" hanya ada di `FlavorCardStepper`.
Karena /order memakai varian `storefront`, fitur itu praktis tidak ada
di layar tempat pembeli memilih rasa - dan tidak ada error, tidak ada
warning, build tetap hijau.

Aturan: sebelum bilang "fitur X sudah ada", cek ke VARIAN MANA layar
itu dirender. Cara cepat: cari `aria-label` yang sama di beberapa blok
(mis. `+1 ${name}` muncul di dua komponen berbeda). Kalau muncul di
lebih dari satu tempat, isi fiturnya belum tentu sama.

Catatan tambahan soal pengujian: field yang baru muncul setelah
interaksi (qty > 0, dialog terbuka) TIDAK bisa diuji lewat
`test-pages.mjs` karena skrip itu cuma GET HTTP tanpa state browser.
Untuk kasus seperti ini andalkan headless CDP, dan pastikan tetap
tidak mengirim order.

## Gotcha #92 — Cek teks di HTML gagal kalau memuat `&`

HTML meng-escape `&` jadi `&amp;`. Jadi `openPage` di
`scripts/test-pages.mjs` yang memakai `text.includes("Syarat & Ketentuan")`
selalu gagal walaupun halamannya benar — bukan bug produk.

Jadi `openPage` sekarang men-decode entitas dulu lewat `decodeEntities()`.
Urutannya penting: `&amp;` HARUS diproses terakhir, kalau tidak `"&amp;lt;"`
akan jadi `"<"` dan merusak teks yang memang harus literal.

Kalau menambah cek baru yang teksnya mengandung `&`, `>`, atau `'`, itu
sekarang aman. Kalau menulis helper pencocokan sendiri, beware hal yang sama.

## Gotcha #93 — `overflow-x: hidden` di `html` mematikan `position: sticky`

Untuk menahan scrollbar horizontal, `html { overflow-x: hidden }` adalah
solusi yang paling sering dicari — tapi itu mengubah `html` jadi scroll
container, dan `position: sticky` di dalamneya ikut rusak karena tidak ada lagi
scrollport di santo.

Pakai `clip` sebagai gantinya: `html { overflow-x: clip }`. `clip` tidak
membuat scroll container, jadi `overflow-y: visible` tetap `visible`
(beda dengan `hidden`, yang memaksa sumbu lain jadi `auto`), dan sticky
tetap jalan. Didukung Chrome 90+, Edge 90+, Firefox 81+, Safari 16+.

## Gotcha #94 — Cek "apakah ada scrollbar" bukan lewat screenshot

Screenshot `Page.captureScreenshot` di headless TIDAK pernah menunjukkan
scrollbar browser sama sekali — itu UI browser, bukan konten halaman. Cara
yang benar mengukur layout:

```js
document.documentElement.clientHeight === window.innerHeight
```

Kalau false, ada ruang yang biasanya dipakai scrollbar horizontal. Ini yang
membuktikan bug Steven: konten `/riwayat` berhenti di y=845 pada viewport
861, jadi 16px-nya milik scrollbar. Way yang lebih langsung: ukur
`clientHeight` vs `innerHeight` setelah `Emulation.setDeviceMetricsOverride`.

## Gotcha #95 - sharp `.raw()` mengembalikan RGBA; piksel transparan TERBACA HITAM

`sharp(file).raw().toBuffer()` selalu menghasilkan **4 channel (RGBA)**,
dan `info.channels` yang memberitahu jumlahnya — bukan `data.channels`
(`data` cuma Buffer, jadi `data.channels` = undefined, dan semua indeks
menjadi NaN sehingga `rgb` berisi undefined).

Yang lebih menentukan: kalau hanya RGB yang dibaca, **piksel transparan
`rgba(0,0,0,0)` akan terbaca sebagai `rgb(0,0,0)` = hitam pekat**. Ini
sudah menyebabkan satu diagnosa salah: band "hitam" 23px di screenshot
Steven dianggap bug situs, padahal 100% transparan (artefak screenshot tool
yang dirender gelap oleh viewer).

Aturan: kalau gambar punya `hasAlpha`, WAJIB baca channel ke-4 sebelum
menyimpulkan apa pun soal warnanya:

```js
const { data, info } = await sharp(f).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;              // bukan data.channels!
const px = (x, y) => { const i = (y * info.width + x) * ch; return [data[i], data[i+1], data[i+2], data[i+3]]; };
```

Kalau alpha 0, piksel itu tidak ada sama sekali di halaman — jangan
dibandingkan dengan palet warna situs.

## Gotcha #96 - Screenshot Steven bisa lebih besar dari jendela browser-nya

Ukuran PNG yang Steven kirim (1125x875) **tidak sama** dengan ukuran
viewport browser-nya. Di screenshot itu posisi elemen tampak bergeser ke
kiri (footer di x=74..830 padahal tengah viewport ada di x=562), karena
jendela aslinya hanya ~904px dan alat tangkapan menambahkan sisanya.

Akibatnya posisi piksel di screenshot TIDAK bisa dipakai untuk menilai
layout. Untuk menilai layout, selalu render ulang halaman LIVE dengan
`Emulation.setDeviceMetricsOverride` pada ukuran yang dikehendai, lalu
ukur `getBoundingClientRect()` langsung di DOM — bukan dari gambar.

## Gotcha #97 - `pg_get_functiondef` TIDAK membawa grant dan COMMENT ON

Untuk mengubah satu baris di dalam fungsi SQL yang sudah deployed, cara
teramanpa menyalin body dari migrasi lama:

```sql
select p.oid::regprocedure::text, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_order';
```

Lalu ganti satu barisnya dan tulis ulang hasilnya sebagai file migrasi. Jauh
lebih aman daripada menyalin body dari migration-46, karena yang Anda ubah
adalah versi yang BENAR-BENAR hidup.

TAPI dua hal ini tidak ikut dan harus ditulis ulang manual:

1. **`grant execute ...`** — `create or replace` sebenarnya sudah
   memertahankan grant yang ada, jadi ini opsional; tetap ditulis supaya file
   migrasi utuh.
2. **`comment on function`** — INI HILANG PERMANEN kalau tidak ditulis ulang.
   Untuk `create_order` komentarnya berisi aturan bisnis ("Nama + phone
   wajib. Email & Instagram OPTIONAL") yang berguna sekali buat dibaca siapa
   pun yang-debug order.

Juga: `'public.create_order'::regprocedure` akan gagal dengan "expected a
left parenthesis" kalau fungsinya punya banyak argumen ber-default. Cari lewat
`pg_proc` + `proname`, bukan regprocedure.

## Gotcha #98 - Halaman pendek punya ruang scroll yang sangat sedikit

`/riwayat` punya `scrollHeight=912` dengan `innerHeight=844` — cuma 68px,
dan 68px itu seluruhnya spacer `h-[68px] md:hidden` milik bottom nav itu
sendiri.

Konsekuensi: ambang scroll untuk fitur "muncul setelah digulir" TIDAK BOLEH
besar. Ambang 80px membuat fitur itu tidak pernah aktif di halaman yang justru
dipakai buat melaporkannya. Pakai 16px.

Juga beware: jangan menambahkan cabang "kalau halaman tidak bisa digulir,
tampilkan saja" untuk fitur CTA yang maksudnya disembunyikan sampai di-scroll.
Cabang itu membatalkan seluruh permintaan — fiturnya akan muncul diam-diam
tepat setelah pindah halaman, dan itu justru yang sedang dicoba dihilangkan.
Periksa dulu apakah halaman benar-benar tidak bisa digulir (dihitung dari
`scrollHeight` vs `innerHeight`), bukan berasus-asumsi.
