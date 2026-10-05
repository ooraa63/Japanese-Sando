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

## 7. `data-density` di `<html>`

`FontSizeProvider` set atribut `data-density` di `<html>`. CSS di
`src/app/globals.css` punya aturan `@media (max-width: 639px)` yang
hanya aktif di mobile. **Di desktop (≥ 640px), mode compact tidak
mempengaruhi apa-apa** — by design supaya tidak merusak layout
desktop yang sudah pas.

Kalau menambah styling yang harus ikut berubah di mode compact,
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
