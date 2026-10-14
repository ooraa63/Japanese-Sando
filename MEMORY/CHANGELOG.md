# CHANGELOG

Log kronologis perubahan project. Entry terbaru di atas.

---

## 2026-10-14 — Bar keranjang kembali di bawah + tombol WA turun ke pojok

Steven 14-10-2026, dari screenshot `Eror 1.png`: *"itu keranjangnya kok hilang di
bagian PO ... yang ada dibawah itu yang kita klik itu nanti untuk lanjut"* dan
*"untuk fitur WA itu terlalu tinggi buat di kanan bawah"* — di screenshot itu
tombol WA jelas menimpa kartu produk.

**Dua sebab, keduanya struktural:**

1. **Bar keranjang memang dihapus** di commit `ac8508c` ("8 perbaikan dari
   screenshot", atas permintaan Steven sendiri: *"keranjangnya dihilangkan aja,
   karena terlalu bawah juga orang gaChamp"*). Yang ikut hilang: sticky bar
   bawah, panel `<aside>`, dan `CartDrawer.tsx`. Drawer tidak dihidupkan
   lagi — isinya cuma informasi yang sudah ada di kartu Flavor, dan tidak ada
   tombol "Lanjut" di dalam drawer itu. Yang dikembalikan justru **bar-nya**
   sebagai tombol lanjut.

   Efek samping yang tidak disangka: bar itu adalah tempat tombol "Lanjut"
   berada. Kalau drawer dihapus tanpa pamit, pembeli harus menggulir ke ujung
   daftar untuk advancing.

2. **Offset tombol WA cocok untuk halaman yang salah.** `bottom-[84px]` itu
   disetel untuk melewati `MobileBottomNav` (fixed, 68px, `md:hidden`). Tapi
   `MobileBottomNav` menyembunyikan diri di `/order` — jadi di halaman PO tidak
   ada bar yang perlu dilompati, dan tombolnya melayang 84px di atas dasar
   layar, tepat di atas kartu produk.

   Ironisnya komentar `MobileBottomNav` masih menyebut alasannya: nav disembunyikan
   "karena alur pemesanan punya sticky bar keranjang sendiri". Bar itu sudah
   dihapus di commit yang sama, jadi alasannya sudah tidak berlaku.

**Yang diubah:**

- `src/components/customer/OrderFlow.tsx` — `CartStickyBar` dikembalikan:
  `fixed inset-x-0 bottom-0 z-30`, `md:hidden`. Isinya tombol lanjut
  (`handleNext`) yang menampilkan jumlah item + subtotal, dan link WhatsApp
  di sisi kanannya. Keranjang kosong = tombol disabled dengan teks
  "keranjang masih kosong".
- `StepNav` — `onNext` jadi opsional + prop `hideNextBelowMd`, supaya di HP
  tidak ada dua tombol "Lanjut" di layar sama (bar bawah + StepNav).
- `src/components/customer/WhatsAppLink.tsx` — BARU. Satu `<a>` untuk link
  `wa.me`, dipakai di tiga tempat.
- `src/components/customer/WhatsAppFab.tsx` — sekarang disembunyikan di
  `/order`, karena WA dirender sendiri oleh `OrderFlow`.
- `src/lib/i18n/{id,en}.ts` — `common.itemOne` / `itemMany`. Sebelumnya label
  jumlah pakai `common.qty` yang isinya "Jumlah", jadi terbaca "1 Jumlah".

**Kenapa WA masuk ke dalam bar, bukan tetap mengambang:** bar itu
`inset-x-0`, jadi occupies seluruh lebar dasar layar. Tombol mengambang di sana
pasti menimpanya. "Kanan bawah" yang tidak menutupi apa pun = sisi kanan bar.
Strukturnya pembungkus `<div>` dengan dua saudara (`<button>` + `<a>`), bukan
`<a>` di dalam `<button>` — HTML tidak valid begitu.

**Penting — panel `early return` ikut dapat WA.** `closed` dan `noBatch`
(migration-56) adalah `early return` di atas seluruh isi. Kalau `WhatsAppFab`
disembunyikan di `/order` tanpa menambahkan WA di kedua panel itu, pembeli
kehilangan akses chat justru di saat toko tutup — kondisi paling butuh bantuan.

**Verifikasi (browser, viewport 639px = HP):**
- Langkah Tanggal Ambil: WA mengambang `bottom-4`, tepi bawah 16px dari dasar
  layar.
- Langkah Pilih Rasa: bar bawah tampil — ikon `lucide-shopping-bag`, "1 item",
  "Lanjut", "Rp 18.000", panah, dan WA hijau di kanannya. Tombol bar diklik →
  **advance ke 04/05 Pembayaran** (berfungsi).
- Langkah Pembayaran: WA kembali mengambang di pojok, bar keranjang ikut
  hilang (memang hanya ada di langkah menu).
- Console: 0 error, 0 warn. `tsc` bersih, `eslint --max-warnings=0` bersih,
  `npm run build` sukses.

**BONUS:** Steven membuka batch test (id 13, label "Tes", pickup 16 Oktober,
sisa 30) saat sesi ini berjalan — jadi alur "batch sedang dibuka" yang tadinya
ditandai belum pernah diuji **akhirnya ikut terverifikasi**: Tanggal Ambil →
Data Kamu → Pilih Rasa → Pembayaran berjalan normal.

---

## 2026-10-14 — Tidak ada batch PO = tidak ada pesanan

Steven 14-10-2026, dari produksi: *"tidak ada batch po sama sekali tapi kenapa di
web pembeli ada stock 20 dan mereka bisa po padahl admin tidak ada buka batch
po"*. Bukti dari produksi saat itu: `po_batches` **0 baris**,
`public_po_pickup_dates()` = `{"ada_batch": false, "tanggal": []}`, tapi
`categories` (Sando Sandwich) masih `stock_enabled = true, stock = 20`.

**Penyebabnya dua lapis, bukan satu.** Ini yang bikin masalahnya bertahan:
perbaikan satu sisi saja tidak akan menutup jalan pemesanan yang lain.

1. **Sisi pembeli.** `hasPo = poDates.length > 0` bernilai false saat tidak ada
   batch, jadi langkah "pilih tanggal" dihilangkan dan `stockByCategory`
   jatuh ke `categories.stock`. Angka 20 itu dari sana — bukan dari batch.
2. **Sisi server.** `create_order` punya cabang `else v_batch := null;`, jadi
   pesanan tanpa batch tetap valid dan potong stoknya jatuh ke
   `categories.stock`.

**Yang diubah:**

- `supabase/migration-56.sql` — BARU. Cabang `else` pada validasi batch
  (`p_po_batch_id is null`) sekarang `raise exception 'no_active_batch'`
  pakai errcode `22023`. Guard di sisi server, bukan cuma UI.
- `src/components/customer/OrderFlow.tsx` — panel baru `noBatch` ("Belum ada
  batch PO") dirender saat `!hasPo`, dikembalikan **sebelum** ada langkah yang
  bisa diklik. `NO_PO_FULL_STEPS` / `NO_PO_LOGGED_IN_STEPS` dihapus dan
  `stepsFor(profileComplete, hasPo)` jadi `stepsFor(profileComplete)` — tidak
  ada lagi alur tanpa batch, jadi tidak perlu dua daftar langkah.
- `src/lib/cart-stock.ts` — `remainingStockByCategory()` punya fallback yang
  sama persis. **Ini yang mengatur angka yang benar-benar tampil** di halaman
  menu dan modal bundle, jadi memperbaiki `OrderFlow` saja tidak cukup.
- `src/lib/i18n/{id,en}.ts` — `order.noBatch` + `errors.no_active_batch`.
  Tiga teks lama yang jadi berbohong dikoreksi: `order.date.empty`,
  `admin.po.emptyHint` ("pembeli masih bisa pesan seperti biasa" — sudah tidak
  benar).
- `tsconfig.json` — `scripts` masuk `exclude` (lihat catatan di bawah).

**Jebakan yang hampir terlewat:** `categories.stock_enabled = false` **bukan**
cara menutup toko. Di `create_order` polanya
`if v_category.stock_enabled and v_cat_pcs > v_category.stock then raise
insufficient_stock` — jadi `stock_enabled = false` artinya **TANPA BATAS STOK**,
order lolos tanpa cek. Mematikannya tanpa guard `no_active_batch` akan membuat
masalah lebih parah. Jadi angka `categories.stock` sengaja **dibiarkan** 20
sebagai jejak audit; setelah migration-56 aktif, kolom itu tidak lagi dipakai
pemesanan sama sekali.

**Leak kedua yang ikut tertutup:** kategori yang tidak punya baris di
`po_batch_stock` dulu ikut menampilkan sisa `categories.stock`. Pembeli diberi
angka "20 pcs" untuk menu yang **tidak diproduksi** di batch itu, bisa masuk
keranjang, lalu ditolak backend saat submit dengan `insufficient_stock` yang
membingungkan. Sekarang kategori tanpa baris = 0 (tampil "Habis"), persis
seperti perhitungan backend (`coalesce(v_batch_stock, 0) < v_cat_pcs`).

**Nomor migration 55 sudah dipakai** commit `65440dd` ("Bundle dua mode: Combo
vs Beli pilih rasa sendiri") — jangan menabrak. Sekalian, migration-55 itu
menjatuhkan overload `create_order` 18 parameter yang bisa dipanggil anon
tanpa validasi batch apa pun; overload itu sudah tidak ada di produksi.

**Cara bikin migration dari definisi live** (dipakai untuk 56): jangan ketik
ulang body `create_order` (±19,6 KB) manual. Ambil `pg_proc.prosrc`, sisipkan
satu blok, lalu buktikan selisihnya cuma blok itu — `scripts/gen-migration-56.mjs`
mencetak jumlah baris yang dihapus dan yang berubah isinya sebelum menulis
file. `scripts/verify-migration-56.mjs` cek statiknya, `scripts/test-migration-56.mjs`
menjalankannya di transaksi yang di-ROLLBACK lalu membuktikan order tanpa batch
ditolak dan produksi tetap utuh.

**Catatan `tsconfig.json`:** folder `scripts/` dikeluarkan dari type-check.
Alasannya teknis: `node --experimental-strip-types` mewajibkan
import berakhiran `.ts`, sedangkan `tsc` menolaknya tanpa
`allowImportingTsExtensions` (yang tidak bisa aktif bareng `next build`). Semua
skrip lain di sana masih `.js`/`.mjs` dan memang tidak pernah ikut type-check,
jadi tidak ada yang kehilangan pemeriksaan.

**Verifikasi:**
- `node scripts/test-migration-56.mjs` → **10 OK, 0 GAGAL**: guard aktif,
  `create_order` tanpa batch ditolak `no_active_batch`, batch bogus tetap ditolak
  `batch_not_found`, order tetap 6 dan stok tetap 20 setelah rollback.
- `node --experimental-strip-types scripts/test-cart-stock-batch.ts` → **10 OK,
  0 GAGAL**, termasuk kasus inti "kategori tanpa baris batch = 0, bukan 20".
- `npx tsc --noEmit` bersih · `npx eslint src --max-warnings=0` bersih ·
  `npm run build` sukses.
- `/order` di dev server (HTML + browser): `<h1>Belum ada batch PO</h1>`, ikon
  `lucide-calendar-days`, **0** "Tambah ke keranjang" / "Pilih Rasa" / "Kapan
  mau ambil" / "20 pcs" / "tersisa". Console browser 0 error + 0 warn (tidak ada
  hydration mismatch).

**Status produksi (22-10-2026, setelah Steven bilang "push dan deploy"):**
`supabase/migration-56.sql` sudah **diterapkan** ke produksi lewat
`scripts/run-migration.js`, lalu diverifikasi ulang dengan
`scripts/verify-live-no-batch.mjs` → **9 OK, 0 GAGAL**: guard terpasang di
definisi live, `v_batch := null` hilang, validasi batch lama masih utuh,
`anon` masih boleh memanggil `create_order`, order tanpa batch ditolak
`no_active_batch`, dan order tetap 6 / stok tetap 20 (tidak ada efek samping).

Commit `d2f71c6` ("Tidak ada batch PO = tidak ada pesanan") sudah di-push ke
`main`, jadi Vercel auto-deploy. Buktinya deploy benar-benar build baru, bukan
halaman lama yang kebetulan 200: **sebelum** push `/order` live balas 44791 byte
dan marker `Belum ada batch PO` **tidak ada**; **sesudah** push balas 40692
byte dan marker **ada**. `scripts/prove-deploy-live.mjs` → 13 dari 15 cek OK,
dan dua yang "gagal" ternyata salah cek, bukan regresi:

- `/faq` balas **307** ke `/profile-menu/faq` — itu perilaku yang **disengaja**
  (lihat entri "8 perbaikan dari screenshot Steven": URL lama `/faq`, `/contact`,
  `/jam-buka`, `/syarat-ketentuan` dipertahankan sebagai redirect 307 supaya
  link yang sudah dibagikan tidak mati). Keempatnya terverifikasi redirect
  dengan benar, dan `/profile-menu/faq` balas 200.
- `buildId` "tidak ketemu" karena Next.js 16 (Turbopack) tidak lagi menaruh
  field JSON `buildId` di HTML. Penanda build yang benar adalah nama aset
  ber-content-hash `/_next/static/immutable/chunks/<nama>-<hash>`.
  `scripts/check-deploy-fingerprint.mjs`: 6 request → **1** varian fingerprint
  dengan 16 chunk, artinya satu build yang stabil dilayani.

**Belum:** alur "batch sedang dibuka" belum diuji dengan batch sungguhan
(butuh batch nyata di produksi). Buyer masih bisa menambah barang ke keranjang
dari kartu di beranda (fitur QuickAdd) lalu menemui panel ini di `/order`;
tidak ada order yang bisa masuk, tapi membuat QuickAdd ikut menghormati batch
adalah pekerjaan terpisah.

**Peringatan operasional:** sesi AI lain pernah menulis ke repo ini **secara
bersamaan** (21:34-22:02) dan menerapkan migration ke produksi tanpa koordinasi.
Kalau sebuah file tiba kembali ke isi lama padahal baru saja diedit, cek
`git status` + `git log` dulu sebelum mengulang — bukan berarti edit-nya salah.

---

## 2026-10-14 — Bundle dua mode: Combo (isi terkunci) vs Beli pilih rasa sendiri

Steven 14-10-2026: *"kadang kalau misal ada bundle combo: strawberry dan choco
matcha, maka langsung itu yang terpilih tapi ada juga saya mau buat misal, beli 2
lebih gratis dan mereka bisa pilih rasanya sendiri"*.

Sebelumnya cuma ada perilaku kedua. Tidak ada cara untuk membuat paket yang isinya
sudah ditentukan.

**Baru: `bundles.is_fixed`** (migration-54).

| Mode | Isi paket | Perilaku pembeli |
|---|---|---|
| `is_fixed = true` (Combo) | `flavor_ids` = isi paket | Tidak memilih apa-apa; chip readonly |
| `is_fixed = false` (default) | `flavor_ids` = daftar yang boleh dipilih | Memilih `required_qty` rasa sendiri |

Kolom default `false`, jadi tidak ada bundle lama yang ikut berubah perilaku.

Pada mode combo jumlah slot di form admin jadi hanya-baca dan mengikuti jumlah
rasa yang dicentang, jadi admin tidak mungkin menyimpan paket yang tidak bisa
dibeli. `admin_save_bundle` juga menolak dengan `invalid_bundle_fixed` kalau
`is_fixed = true` tapi jumlah rasa != `required_qty`.

### Temuan penting: create_order yang dipakai aplikasi bukan yang dikira

Permanent lama (18 parameter) ternyata **tidak pernah dipanggil**. Aplikasi
memakai overload 20 parameter (punya `p_po_batch_id` + `p_pickup_date`):

- `src/components/customer/OrderFlow.tsx` — cabang transfer
- `src/app/account/qris-actions.ts` — cabang QRIS Midtrans

Karena itu dua aturan yangalach ada di overload yang salah:

1. **Validasi `bundle_flavors` (migration-45) tidak pernah berjalan.** Artinya
   pembatasan "pembeli hanya boleh memilih rasa yang Seller listing" tadinya
   **hanya dipaksa di UI**. Request langsung ke PostgREST bisa mengirim rasa
   apa saja untuk bundle yang sudah dibatasi-seller. migration-55 memindahkannya
   ke overload yang hidup.
2. migration-54 sempat menimpa overload 18 yang salah sasaran; migration-55
   mengoreksinya ke overload 20.

### migration-55

- Override `create_order` 20 parameter, diambil **utuh dari database** lewat
  `pg_get_functiondef` (bukan diketik ulang, jadi mustahil menyimpang dari versi
  yang benar-benar jalan), lalu ditambahkan validasi `bundle_flavors` per slot
  dan validasi mode combo (tiap rasa di isi paket harus muncul tepat 1x di
  slots — tanpa ini `[strawberry, strawberry]` lolos untuk paket strawberry +
  choco).
- **DROP overload 18 parameter yang mati.** Selain bagus secara rapi, ini juga
  menghapus ambiguitas: selama dua overload ada, pemanggilan `create_order`
  langsung dari SQL ikut error "function is not unique".

### Tes

`scripts/test-bundle-modes.js` — 8/8 OK, seluruhnya di dalam transaksi yang
di-ROLLBACK, jadi tidak ada pesanan/stok yang tersentuh:

```
combo: slots sesuai isi paket diterima            OK
combo: duplikat [x, x] ditolak                    OK
combo: rasa di luar isi paket ditolak             OK
combo: jumlah slot kurang dari required_qty ditolak OK
pilih-sendiri: duplikat [x, x] tetap boleh        OK
pilih-sendiri: rasa di luar daftar ditolak        OK
simpan: combo jumlah rasa != jumlah slot ditolak   OK
simpan: combo jumlah rasa yang cocok diterima      OK
```

`scripts/check-create-order-live.js` dipakai sebagai jaring pengaman: memastikan
`po_batch_flavors`, pemotongan stok, `qris_midtrans`, dan `insufficient_stock`
masih ada setelah override.

### Tooling baru

`dry-run-migration.js` (validasi SQL di transaksi yang dibatalkan),
`run-migration.js`, `check-bundle-slots.js`, `set-bundle-mode.js`,
`test-bundle-modes.js`, `check-create-order-live.js`.

### BELUM diverifikasi

Tampilan popup mode combo **belum diuji di browser** — Browser timeout berulang
selama sesi ini. Yang sudah pasti: tsc/eslint/build hijau, backend 8/8, dan
`is_fixed` default `false` jadi perilaku produksi tidak berubah sampai ada bundle
yang disetel ke mode combo.

### Catatan: pekerjaan lain yang ditemukan di working tree

Saat mulai menambah fitur ini, ada perubahan **belum di-commit** di
`OrderFlow.tsx` + i18n untuk fitur "tidak ada batch PO = tidak ada pesanan"
(panel `noBatch`, stok batch jadi satu-satunya sumber). Komentarnya mengklaim
`create_order` sudah raise `no_active_batch`, tapi **fungsi live tidak punya itu
sama sekali** — bagian backend-nya belum pernah ditulis, dan tidak ada file
migrasi untuk itu.

Perubahan itu **sengaja tidak ikut di-commit** di sini karena:
(1) itu fitur terpisah yang belum diminta Steven di sesi ini,
(2) sekarang ada 0 batch PO aktif, jadi ikut ter-deploy akan menolak semua
pesanan sampai batch baru dibuka,
(3) setengah jadi — panelnya ada, pengaman backend-nya tidak.

Patch-nya tersimpan di `%TEMP%\no-batch-wip.patch` (35 KB) kalau mau dilanjutkan.

---

## 2026-10-14 — Pre-order tidak ke-reset lagi saat pindah halaman

Steven 14-10-2026: *"Kalau misal di pre-order udh sampai step 3 atau 4
misal tpi kita back ke home, semua lgnsung kereset jaa, kecuali cuman refresh
tetap stay di web itu"*.

Ternyata ada **dua** efek yang membersihkan state saat komponen `OrderFlow`
lepas dari layar, dan keduanya harus dihapus supaya perilakunya konsisten.

**Efek 1 — reset total saat unmount (`src/components/customer/OrderFlow.tsx`).**
Menghapus `js_order_step`, `js_po_pickup_date`, lalu memanggil `reset()` yang
mengosongkan seluruh keranjang. Efek ini punya penjaga StrictMode
(`reallyMountedRef`) supaya cleanup saat development probe tidak ikut
menghapus. **Efek beserta penjaganya sekarang dihapus seluruhnya** — tidak ada
lagi reset saat berpindah halaman.

**Efek 2 — hapus identitas saat unmount + `pagehide`.** Ini yang tidak terlihat
dari gejala Steven, tapi justru bikin perilakunya setengah-setelah: langkah
dan keranjang comeback ke posisi sebelumnya, sementara kolom nama/telepon
kembali kosong. Efek ini beserta `clearIdentityRef`-nya juga dihapus, dan
`clearIdentity` tidak lagi di-destructure di `OrderFlow`.

**Reset sekarang HANYA terjadi setelah pesanan benar-benar tersimpan**, di
`handleSubmit` (`clearOrderSession()` -> `reset()` -> `router.push` ke halaman
sukses). Fungsi `clearOrderSession()` yang baru membersihkan `js_order_step` +
`js_po_pickup_date`: tanpa itu, pembeli yang balik ke `/order` setelah pesanannya
masuk akan menemukan keranjang kosong tapi sudah di langkah "Konfirmasi", dan
tidak bisa mundur karena `goTo()` hanya maju dari langkah saat ini.

**Catatan konsekuensi untuk approve:** nama, telepon, email, dan Instagram
sekarang ikut bertahan sampai pesanan dikirim — persis konsekuensi dari
permintaan Steven. `clearIdentity()` di `CartProvider` sengaja tidak dihapus
dari API, cuma pemanggilnya; kalau nanti mau "identitas dihapus tapi keranjang
tetap", cukup panggil sekali di `handleSubmit`, bukan di effect unmount.

---

## 2026-10-14 — Fix loop takfinite di lonceng notifikasi

Error runtime di dev overlay:
`The result of getServerSnapshot should be cached to avoid an infinite loop`
(`src/components/customer/NotificationBell.tsx:56`).

Penyebabnya `getNotificationServerSnapshot()` di `src/lib/notifications.ts`
yang `return []` di dalam fungsi — itu mengembalikan referensi array **baru**
setiap panggilan, dan `useSyncExternalStore` membandingkan hasilnya pakai
`Object.is`, jadi React menganggap store selalu berubah.

Fix: array kosongnya dinaikkan ke konstanta modul `SERVER_SNAPSHOT` yang
dipakai ulang, sama seperti snapshot sisi klien yang sudah di-cache di
`cachedRaw` / `cachedList`. Nilai pertamanya kosong masih valid — `readRaw()`
langsung membaca localStorage saat hydration.

**Verifikasi:** console bersih (`query kind=console` levels error+warn = 0 entry)
setelah reload; test navigasi `isi data -> step 2 -> tambah Choco Matcha ->
ke beranda -> balik ke /order` hasilnya: masih di `02 / 04 Pilih Rasa`, Choco
Matcha qty 1 (stok 20 -> 19), nama `Uji Navigasi` dan telepon `081234567890`
utuh di form.

---

## 2026-10-14 — Ketuk kartu di beranda -> popup tambah ke keranjang

Steven 14-10-2026: *"yang di home yang untuk bundle, favorite, intinya semua
makanan saya mau buat dimana saat kita tap, bisa popup untuk kita add to cart"*.

Sebelumnya kartu di beranda benar-benar.view-only — diklik tidak terjadi
apa-apa, pembeli harus pindah ke `/order` dulu baru bisa memilih rasa.

**File baru `src/components/customer/QuickAdd.tsx`:**
- `QuickAddProvider` — dipasang SEKALI di `src/app/page.tsx` membungkus seluruh
  isi beranda. Kartu-kartu memanggil `useQuickAdd()` sendiri, jadi tidak ada
  prop yang diteruskan berlapis (`AppHome` -> `NewShowcase` -> `FlavorCard`).
- `QuickAddModal` — foto, nama, harga, stepper jumlah, tombol "Tambah ke
  keranjang". Memakai `setQuantity(flavorId, qty)`, BUKAN `add(flavor)`:
  kalau pembeli sudah punya 2 dan memilih 3, totalnya jadi 3, bukan 5.
- Popup **paket** bukan ditulis ulang — `OrderBundleModal` yang sudah ada
  DIPAKAI ULANG, jadi validasi jumlah slot = `required_qty` dan penambahan ke
  keranjang tetap satu sumber kebenaran.

**`useQuickAdd()` mengembalikan `null` di luar provider, bukan melempar error.**
Ini yang membuat halaman `/order` aman: kartu di sana `selectable` (punya
tombol +/− sendiri) dan sengaja tidak diklik. Kalau hook-nya melempar,
`/order` ikut mati.

**Kartu jadi `role="button"` + `tabIndex`, bukan `<button>`** — karena di dalam
kartu ada tombol like, dan `<button>` di dalam `<button>` itu HTML tidak valid.
Klik pada tombol di dalam dicek dengan `closest("button")` supaya menekan
jantung tidak ikut membuka popup.

**Label lewat i18n** (`cart.quickAdd`, `cart.alreadyInCart` di id + en), bukan
teks Indonesia yang ditulis langsung.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih ·
`npm run build` sukses · beranda punya 9 `role="button"` (New + Paket Hemat +
Favorite + grid Menu) · popup tidak terbuka saat halaman dimuat · `/order` punya
**0** `role="button"` (kartu di sana tidak ikut diklik). Belum dicoba Steven
dengan tangan.

---

## 2026-10-14 — Tombol WhatsApp mengambang di kanan bawah

Steven 14-10-2026 (gambar `D:\Gambar 1.png`): *"saya sekalian mau tambahkan
ini fitur kayak tombol untuk bs chat lgsng ke whatsaapp yang selalu ngikut
ketika scroll letak di kanan bawah aja"*.

- `src/components/customer/WhatsAppFab.tsx` — BARU. Tombol hijau `size-14`
  dengan ikon gelembung, `position: fixed` di kanan bawah sehingga nempel
  saat halaman digulir, membuka `wa.me` dengan pesan pembuka.
- `src/app/layout.tsx` — satu-satunya tempat pemanggilannya, jadi tidak perlu
  dipasang di tiap halaman. Root layout ini juga yang merender
  `MobileBottomNav`, jadi posisinya konsisten.

**Tiga hal yang sengaja diperhatikan:**
1. **Sembunyi di `/admin`.** Dicek `usePathname()` di dalam komponen — kalau
   tidak, tombolnya akan menutupi sidebar dashboard.
2. **Offset bawah memakai titik potong `md`, bukan `sm`.** `MobileBottomNav`
   juga `fixed bottom-0` dan baru hilang di `md:hidden` (>=768px). Kalau
   tombolnya pakai `sm:bottom-6`, di lebar 640-767px tombol akan menutupi item
   paling kanan di nav bawah. Jadi di bawah 768px tombol naik ke
   `bottom-[84px]` (68px nav + 16px), di atas 768px turun lagi ke `bottom-6`.
   `z-40` sengaja — di bawah modal (`z-50`), supaya tidak muncul di atas popup
   pemesanan.
3. **Tidak dirender kalau nomor kosong.** `store_settings.whatsapp` boleh kosong;
   tombol tanpa nomor hanya menghasilkan halaman WhatsApp yang kosong.

**PERINGATAN untuk Steven:** nomor WhatsApp di database masih **placeholder
`621234567890`** (dicek 14-10-2026, `scripts/check-store-contact.mjs`). Jadi
setelah deploy, tombolnya akan tampil tapi membuka nomor yang salah. Isi
nomor asli di `/admin/pengaturan` → tab kontak. Nomor TIDAK dikarang di kode.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih ·
tombol terdeteksi di HTML beranda (`wa.me/621234567890` + kelas fixed) · tidak
ada di `/admin/login` · `npm run build` sukses. Belum dicek Steven visual.

---

## 2026-10-14 — Deskripsi rasa dihapus dari kartu menu

Steven 14-10-2026: *"untuk description setiap menu (rasa) itu dihilangkan aja,
ga perlu ada description"*.

- `src/components/customer/FlavorCard.tsx` — blok `<p className="flavor-desc">`
  dihapus di KEDUA varian kartu (kartu besar beranda + kartu ringkas
  `/order`), beserta variabel `desc` yang jadi tidak terpakai.
- `src/app/globals.css` — blok `@media (max-width: 639px)` untuk
  `.density-flavor-grid > article .flavor-desc` ikut dihapus karena elemennya
  sudah tidak ada (CSS mati = jebakan "kelas tak dikenal = no-op senyap").

**Yang SENGAJA tidak dihapus:**
- Kolom `flavors.desc_id` / `desc_en` di database. Datanya masih dipakai
  **pencarian** di `MenuBrowser.tsx` (haystack menyertakan deskripsi), jadi
  kata kunci lama purchaser tetap menemukan rasa yang relevan. Field edit
  deskripsi di admin Menu juga dibiarkan supaya data lama tidak hilang.
- Deskripsi **kategori** (`MenuBrowser`, `OrderCategoryModal`) dan deskripsi
  **bundle** (`BundleShowcase`, `OrderBundleModal`) — itu entitas lain, bukan
  "menu (rasa)", dan Steven tidak minta dihapus.

**Efek sampingan yang bagus:** `min-h-[3.6em]` pada deskripsi dulu dipakai
menyamakan tinggi kartu antar-rasa; sekarang kartu setinggi isinya sendiri,
jadi grid jadi lebih padat.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih ·
`npm run build` sukses. Belum dicek Steven secara visual.

---

## 2026-10-14 — 8 perbaikan dari screenshot Steven (gambar 1-8)

Steven mengirim 8 screenshot (`D:\Gambar error\Gambar 1-8.png`) + 8 keluhan.
Empat keputusan yang mengubah arah kerja ditanyakan lewat kuis dan dijawab
Steven lebih dulu: halaman mana yang pindah, perlakuan URL lama, popup pilih
toko (toko baru menyusul), dan cara notifikasi dikirim (polling 15 detik).

### 1. Halaman info pindah ke /profile-menu/*

`/contact`, `/faq`, `/jam-buka`, `/syarat-ketentuan` dipindah ke
`src/app/profile-menu/<slug>/`. URL lama **tidak dihapus** — diganti halaman
redirect (307) supaya link yang sudah dibagikan di WhatsApp / hasil pencarian
Google tidak mati.

- `src/app/{contact,faq,jam-buka,syarat-ketentuan}/page.tsx` — jadi redirect.
- Tautan internal (footer, ShopInfo, `revalidatePath`) diarahkan langsung ke
  URL baru, bukan mengandalkan redirect — satu hop lebih murah dan tidak
  pecah kalau CDN menambah hop.
- **Data**: `profile_menu_items.href` untuk `contact`, `faq`, `hours`, `terms`
  di-update ke URL baru. Ini WAJIB: `href` itu satu-satunya jalan pembeli
  ke halaman-halaman tersebut dari ProfileSheet / MobileBottomNav. Sebelum ini,
  kalau `href` kosong, halaman `/faq` dsb. benar-benar tidak punya pintu masuk
  dari UI. Script: `scripts/fix-profile-menu-hrefs.mjs` (cek + `--apply`).
- Sidebar admin: `/admin/faq` dan `/admin/terms` **dihapus** (gambar 1). Editor
  keduanya masih hidup — bisa dibuka dari tombol "Kelola isi halaman" di
  `/admin/profile-menu` (`PAGE_EDITOR` di `ProfileMenuClient.tsx`).

### 2. Kartu QRIS center vertikal

Penyebabnya bukan isi kartu: grid metode pembayaran menyamakan tinggi semua
kartu, dan kartu "Transfer bank" lebih tinggi karena punya deskripsi + catatan.
Kartu QRIS jadi kelihatan nempel di atas. Fix: `justify-center` di wrapper
`ChoiceCard` (`OrderFlow.tsx`).

### 3. Popup PILIH toko (bukan popup detail)

Dulu klik "Ambil di toko" langsung membuka popup **detail** toko pertama —
pembeli tidak pernah bisa memilih. Sekarang: klik "Ambil di toko" ->
popup **pemilih toko** (`PickupStorePicker`). Grid kartu toko yang panjang di
bawahnya diganti ringkasan "Toko pilihan" + tombol "Ganti toko".

- Sumber data: `delivery_zones` dengan `kind='pickup'` — sudah ada, ditata dari
  admin "Ambil & Kirim". **Tidak ada tabel toko baru** (Steven: "popup pilih
  toko dulu, toko baru menyusul"). Kalau nanti daftar toko jadi datastore
  sendiri, tinggal ganti isi prop `zones`.
- Cuma 1 titik pickup -> langsung dipakai, tanpa popup (memilih satu dari satu
  tidak ada artinya).
- **Guard baru di `validatePayment()`**: kalau metode pickup tapi tidak ada
  titik valid terpilih, pesanan DITAHAN dengan pesan jelas dan popup dibuka
  lagi. Tanpa ini pembeli bisa menutup popup tanpa memilih, `deliveryZone`
  tetap nilai bawaan yang tidak ada di tabel, dan `create_order` menolaknya
  dengan error yang membingungkan.

### 4. Keranjang dihapus

Dihapus: `<aside>` ringkasan di kanan, sticky bottom bar, dan `CartDrawer.tsx`
seluruh file. Yang tersisa hanya keranjang di memori `CartProvider`.

**Konsekuensi yang harus ditangani:** dulu tombol "Lanjut" hidup DI DALAM
drawer. Kalau drawer dihapus apa adanya, pembeli tidak punya cara advance ke
pembayaran. Jadi `StepNav` dikembalikan ke langkah "menu" (tombol back memakai
`prevStep` yang sudah ada, tombol Lanjut disabled saat keranjang kosong).

### 5. Bill: semua harga satu kolom

Blok item tadinya hidup di dalam `ReviewRow`, yang kolom kontennya selalu
menyempit oleh tombol "Ubah" di kanan — jadi harga item berhenti lebih kiri
daripada Subtotal/Total. Fix: item jadi blok penuh sendiri + konstanta
`PRICE_COL = "w-28 shrink-0 text-right tabular"` yang dipakai item, subtotal,
ongkir, dan total. Satu ukuran = satu tepi kanan.

### 6. Tabel Mutasi

Ternyata TIGA sebab, semuanya soal grid:
1. Header dan tiap baris = dua `grid` terpisah, kolom terakhir
   `minmax(150px, auto)` — lebar `auto` dihitung sendiri-sendiri, dan
   selisihnya diserap kolom PELANGGAN yang `1fr`, jadi tepi kanan TOTAL/BAYAR
   bergeser antar baris.
2. Kolom TANGGAL & KODE tanpa `whitespace-nowrap`, tanggalnya satu string
   panjang -> jadi tiga baris.
3. Template kolom diulang dua kali (header + baris) -> gampang berbeda.

Fix: semua kolom lebar tetap, template dipindah ke konstanta `TX_COLS` yang
dipakai header DAN baris, tanggal dipecah dua baris lewat helper baru
`formatDateTimeParts()` di `utils.ts`, kolom numerik dikunci nowrap.

### 7. Halaman Menu admin

Tombol "Tambah jenis makanan" pindah ke kiri, kotak cari ke kanan, satu baris
sejajar (sebelumnya tombol di kanan dan cari berdiri sendiri di baris bawah
rata kiri, jadi separuh baris kosong). Badge "N pcs tersisa" di kartu jenis
makanan **dihapus** — stok hanya bisa diset di batch PO.

### 8. Notifikasi (polling 15 detik)

Dua sumber, **tanpa tabel baru**:

1. **Status pesanan.** Kode + telepon diambil dari riwayat lokal
   (`js_order_history_v1`, sudah menyimpan keduanya), lalu `track_order(code,
   phone)` dipoll tiap 15 detik untuk 5 pesanan terbaru. Status berubah ->
   notifikasi baru. Baseline "status terakhir yang dilihat" disimpan di
   `js_seen_order_status_v1`; pesanan yang statusnya belum pernah disentuh cuma
   dicatat baseline-nya (bukan jadi notifikasi), supaya pembeli tidak langsung
   dikira punya notifikasi baru tiap buka halaman.
2. **Pengumuman admin.** Tabel `announcements` + `public_list_announcements()`
   sudah ada sejak migration-13 tapi **nol pemakai** — di sini dinyalakan.

File baru: `src/lib/notifications.ts`, `src/components/customer/NotificationBell.tsx`.
Lonceng di `SiteHeader` diganti dari tautan `/track` jadi lonceng sungguhan, dan
sekarang juga tampil di **desktop** (sebelumnya cuma mobile).
Halaman admin pengumuman: `/admin/announcements` (pakai 4 RPC yang sudah ada:
`admin_list_announcements`, `admin_save_announcement`,
`admin_delete_announcement`).

Notifikasi disimpan di localStorage, bukan tabel `notifications` — supaya
konsisten dengan keputusan Steven "beda HP beda history": tidak ada akun yang
perlu ditautkan.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih ·
`npm run build` sukses · 4 halaman baru balas HTTP 200 di dev server · URL lama
balas 307 · `profile_menu_items.href` terverifikasi 4/4 di database produksi.

**Belum:** semua perubahan tampilan belum dicek Steven secara visual (butuh
login admin / Device reviewer). Belum ada commit untuk 8 poin ini — menunggu
perintah Steven.

**Catatan teknis untuk sesi berikutnya:**
- jangan pernah merangkai class Tailwind secara dinamis (`lg:${VAR}`) — scanner
  tidak melihat class utuhnya dan tabel diam-diam kehilangan kolom. Tulis string
  class LITERAL lengkap di konstanta.
- setelah memindahkan file route, `.next/dev/types` bisa menyimpan info lama
  (MEMORY/gotchas #3).

---

## 2026-10-14 — Kartu menu di tab Stok dipipihkan jadi petak

Steven 14-10-2026 lewat screenshot `D:\eror.png`: *"untuk yang menu untuk stok,
terlalu besar dan makan tempat buat jadi petak juga aja jangan makan tempat"*.

Kartu "Sando Sandwich" di tab Stok memang boros: ikon 56px, badge status di
baris sendiri, input stok melebar penuh, plus DUA baris teks penjelasan — total
kartu ±380px tinggi untuk isi yang sebenarnya cuma 4 baris.

**Perubahan (semanya `MenuStockCard` di `PoBatchDetailClient.tsx`):**

| Bagian | Sebelum | Sesudah |
|---|---|---|
| Ikon kategori | `size-14`, padding `p-4` | `size-10`, padding `p-3` |
| Badge status | baris sendiri di bawah nama | pindah ke kanan kepala, satu baris dengan nama |
| Chip rasa | `px-2 py-1 text-[12px]`, gap `1.5` | `px-1.5 py-0.5 text-[11px]`, gap `1` |
| Kaki kartu | 4 baris: label / input full width / hint panjang / stok awal | 2 baris: label + badge + input (w-24) / stok awal |
| Teks penjelasan panjang | tampil 2 baris | dipindah ke atribut `title` (tooltip) |
| `basis` kartu | `19rem` | `21rem` (ruang untuk kaki 2 baris itu) |
| Padding section + aside | `p-5` | `p-4` |

**Tidak ada yang dihapus dari fungsinya** — rasa, tombol Pilih semua/Kosongkan,
input stok, badge sisa, dan angka stok awal semuanya masih ada. Yang dipipihkan
cuma jarak, bukan isinya. Total tinggi kartu turun ±80px (dari ±380 ke ±295).

**Catatan:** `basis-` tetap pakai flex-grow, bukan `grid-cols-N` — pelajaran dari
14-10-2026 (lihat entri "Bundle di samping"), grid dengan N kolom tetap
menyisakan sel kosong kalau kategorinya kurang dari N.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih. **Belum dicek
Steven secara visual** — halaman butuh login admin, jadi AI tidak bisa membuka
sendiri; dia melihatnya di dev server localhost:3000 yang sedang jalan.

---

## 2026-10-14 — Harga bundle tidak bisa diset di batch (hanya centang + harga utama)

Steven 14-10-2026: *"pertama ada semua menu dan bundle yang udh kita set di sidebar
utama ... lalu di sub menu untuk PO ini, kita nanti tinggal tentuin mana yang mau
kita jual untuk batch ini, rasa apa aja, dan stocknya berapa, untuk harga tetap
ikutin yang utama jadi kita gabisa set harga disini"*

Checklist dari pesan itu:
1. Semua menu + bundle dari sidebar utama tampil di tab Stok → **sudah terpenuhi**.
   Diverifikasi ke `public_menu`: yang aktif cuma 1 kategori (Sando Sandwich,
   5 rasa) + 1 bundle (Sando 2, Rp 35.000) — persis yang tampil di layar Steven.
2. Tentukan rasa mana yang dijual → sudah ada (migration-53).
3. Tentukan stok → sudah ada per kategori.
4. **Harga tidak bisa diset di sini → baru dikerjakan sekarang.**

**Perubahan:**
- `PoBatchDetailClient.tsx`: input "Harga batch" + label + hint dihapus. Yang
  tersisa cuma teks kecil di bawah paket yang dicentang: "Harga ikut menu utama,
  tidak bisa diubah di sini".
- State `picked` berubah dari `Record<number, number|null>` (harga) jadi
  `Set<number>` (daftar id paket yang dicentang). `setBundlePrice()` dihapus.
- `savePoBatchBundlesAction(batchId, bundleIds: number[])` — signature-nya
  berubah, `price` tidak lagi diterima dari pemanggil dan selalu dikirim `null`,
  sehingga `public_po_batch_for_date` jatuh ke `coalesce(pb.price, bu.price)` =
  harga menu utama. Jadi-even kalau ada form/API lain yang mencoba, harga batch
  tidak bisa diisi lagi.
- `src/lib/i18n/{id,en}.ts`: `bundlesPrice` dihapus, `bundlesPriceHint` diubah
  jadi kalimat "harga ikut menu utama".

**Bonus — bug lama ikut tertutup.** Draft lama menulis
`draft[id] = b.dipakai ? (b.harga_batch ?? null) : null`, artinya paket yang
dipakai tapi `harga_batch` null jadi `null` = "tidak dicentang". Jadi paket aktif
bisa tampil tidak tercentang padahal database bilang dipakai. Sekarang state-nya
murni dari `b.dipakai`.

**Kenapa tidak ada migration baru:** `po_batch_bundles` masih punya kolom `price`,
tapi tabelnya **kosong** (dicek langsung ke produksi: 0 baris) dan payload baru
selalu `price: null`. `coalesce` otomatis jatuh ke harga utama, jadi tidak ada
data yang perlu dibersihkan dan tidak ada risiko merusak apa pun. Kolomnya
dibiarkan supaya tidak perlu migration; kalau nanti Steven mau sekalian dihapus
dari skema, itu migration terpisah.

**Verifikasi:**
- `npx tsc --noEmit` bersih · `npx eslint src --max-warnings=0` bersih ·
  `npm run build` sukses.
- `node scripts/test-bundle-price.mjs` → **10 OK, 0 GAGAL** ke database asli:
  simpan bundle dengan `price: null`, lalu `public_po_batch_for_date` mengirim
  `price: 35000` = harga di `public_menu`, dan `po_batch_bundles.harga_batch`
  null untuk batch 2 maupun 12. Data uji dibersihkan di akhir.
- Layout belum dicek Steven di browser (butuh login admin).

**Gotcha yang kena lagi saat nulis tes:** `public_po_batch_for_date` menerima
parameter **`p_pickup_date`** (bukan `p_date`), dan key bundle di payload-nya
**`bundle_id`** (bukan `id`). Teeth juga: fungsi itu memilih batch dengan sisa
stok terkecil, jadi tidak bisa diarahkan ke satu batch — harus di-set ke semua
batch aktif biar tesnya kena sasaran.

---

## 2026-10-14 — Bundle di samping, kartu menu ikut melebar (flex-grow)

Steven 14-10-2026, koreksi ketiga untuk masalah yang sama.

Dua perintah sebelumnya terdengar bertentangan tapi sebenarnya satu hal:
- "bundle jangan di samping sana" (versi kolom kanan terlalu sempit)
- "jangan atas bawah, itu sampingnya kan masih kosong" (versi susun ke bawah
  menyisakan setengah halaman kosong di kanan)

Akar masalahnya sama: **ada ruang kosong**. Versi kolom kanan benar layoutnya,
tapi kartu menunya cuma memenuhi 1/3 lebar kolom karena `xl:grid-cols-3`
dengan kategorinya hanya satu — jadi di DALAM kolom kiri pun masih rongga.

**Perbaikan:** kartu menu tidak lagi pakai grid kolom tetap, tapi
`flex flex-wrap` + tiap kartu `flex-1 basis-[19rem]`. Consequences:
- 1 kategori → kartunya melebar penuh
- 2 kategori → membagi rata
- 3+ → membungkus otomatis

Bundle tetap di kolom kanan (`22rem`, sticky) karena hanya sedikit isinya dan
hanya 1-2 paket.

**Pelajaran:** untuk daftar kartu yang jumlah itsnya tidak pasti, pakai
`flex-1 basis-*` BUKAN `grid-cols-N`. Grid dengan N kolom tetap selalu menyisakan
N-1 sel kosong kalau isinya lebih sedikit dari N — dan itulah yang bikin Steven
tiga kali beerotasi layout.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih · `build` sukses.

---

## 2026-10-14 — Bundle balik ke bawah, label "Stock", tombol simpan mengambang

Steven 14-10-2026 lewat screenshot ketiga (setelah versi kolom kanan). Tiga
koreksi atas perubahan sebelumnya:

1. **Bundle dikembalikan ke BAWAH kartu menu.** Versi kolom kanan
   (`lg:grid-cols-[minmax(0,1fr)_20rem]`) Steven tolak: "bundle jangan di
   samping sana, intinya untuk menu dan bundle itu satu itu layout yang sama
   aja". Kolom 20rem membuat area menu terasa sempit. Sekarang satu kolom,
   Bundle jadi `mt-6 border-t pt-6` di bawah grid menu.
2. **Label kaki kartu: "Sisa (ubah di sini)" → "Stock".** Kata "sisa" membingungkan
   karena di sebelah kanannya sudah ada badge "0 pcs tersisa" — dua-duanya
   bicara hal sama dengan nada berbeda.
3. **Tombol Simpan tidak lagi nangkot di ujung kanan bawah halaman.** Sekarang
   pill mengambang di TENGAH bawah layar: `sticky bottom-3` + `flex
   justify-center`, isi badge "Belum disimpan" + tombol. Steven: "jangan di
   ujung kanan bawah bgt susah lihat". Sticky membuat tombolnya selalu kelihatan
   tanpa harus menggulir sampai paling bawah — itu masalah vertikalnya,
   bukan horizontalnya.

Bonus: list Bundle jadi `sm:grid-cols-2` supaya tidak melebar penuh.

**Pelajaran:** "susah lihat" pada tombol yang melayang hampir selalu soal
posisi VERTIKAL (harus scroll sampai bawah), bukan horizontal. Menggeser dari
kanan ke tengah saja tidak akan menolong — yang menolong adalah `sticky` +
kartu pengingat "Belum disimpan".

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih · `build` sukses.

---

## 2026-10-14 — Fix: checkbox rasa tidak bisa di-uncheck + Bundle ke kolom kanan

Steven 14-10-2026 lewat screenshot `D:\eror.png`.

### Bug: centang tidak bisa dilepas

**Penyebabnya hal yang sangat sepele:** `checked` pada checkbox membaca

```tsx
const on = semuaRasaAktif ? true : rasaOn.has(r.flavor_id);
```

`semuaRasaAktif` diambil dari `initial.semua_rasa_aktif` — data server yang
hanya berubah setelah Steven menekan Simpan. Jadi selama belum disimpan, semua
kotak **selalu** tercentang dan diklik pun kelihatan tidak berefek. Steven
mengira checkbox-nya rusak, padahal tidak.

**Perbaikan:** draft lokal `rasaOn` sekarang diisi **penuh** saat
`semua_rasa_aktif` true (bukan cuma baris `dipakai`), dan `checked` membaca
draft lokal itu saja. Label "semua tampil" / "{n} dipilih" juga dihitung dari
draft lokal supaya ikut berubah seketika. Ditambah tombol kecil **"Pilih
semua" / "Kosongkan"** per kategori, karena tanpa itu menghapus 5 rasa satu
satu terasa merepotkan.

**Pelajaran:** jangan pernah pakai data server sebagai sumber kebenaran untuk
state kontrol yang bisa diedit sebelum disimpan. Sumbernya harus state lokal.

### Bundle pindah ke kolom kanan

`StockTab` jadi `lg:grid-cols-[minmax(0,1fr)_20rem]`:
- Kiri — kartu Menu & Stok ( grid `sm:2` / `xl:3`, jadi di layar sempit
  otomatis jadi 2 kolom, bukan 1 seperti sebelumnya yang bikin banyak ruang
  kosong).
- Kanan — panel Bundle, `lg:sticky lg:top-24` jadi ikut menggulir.
- Tombol Simpan jadi `lg:col-span-2`.

Di HP tetap menumpuk ke bawah seperti biasa.

### Catatan teknis

`rasaByKategori` **tidak** dipakai `useMemo` lagi. React Compiler error
"Existing memoization could not be preserved" karena nilainya dibaca di dalam
callback `setRasaOn`. Daftarnya cuma puluhan baris, dihitung ulang tiap render
tidak mahal.

**Verifikasi:** `tsc` bersih · `eslint --max-warnings=0` bersih · `build` sukses.
Catatan: verifikasi visual TIDAK dilakukan — halaman `/admin/po/[id]` butuh
sesi login dan sesi browser tidak boleh diisi kredensial oleh AI, jadi Steven
yang cek tampilannya.

---

## 2026-10-14 - Migration-53: pilih rasa mana yang tampil di satu batch PO

**Permintaan Steven:** "untuk yang menu pastikan kita bisa set rasa itu rasa
apa aja yang mau dimunculin pada batch po itu".

**Masalah:** stok batch (migration-49) itu **per KATEGORI** — itu disengaja,
karena stok dipakai buat produksi. Yang tidak ada adalah lapisan
"tampilkan/sembunyikan rasa". Batch lama tidak bisa menyembunyikan satu rasa
tanpa menyembunyikan seluruh kategorinya.

### Semantik (sengaja sama dengan po_batch_bundles)

| Baris di `po_batch_flavors` | Arti |
|---|---|
| Nol baris | Semua rasa aktif tampil (mode lama) |
| Ada baris | HANYA rasa yang dipilih yang boleh dibeli |

Batch yang dibuat sebelum migrasi ini punya nol baris, jadi **tidak ada produk
yang tiba-tiba hilang**. Begitu Steven mencentang satu rasa, itu yang berlaku.

### Database — `supabase/migration-53.sql` (SUDAH DI-APPLY)

- Tabel baru `po_batch_flavors (batch_id, flavor_id, is_active, created_at)` +
  2 index + RLS (tanpa policy SELECT untuk anon).
- `admin_save_po_batch_flavors(bigint, jsonb)` — array kosong = kembali ke
  mode "semua rasa". Menolak rasa yang sudah tidak aktif.
- `admin_list_po_batch_detail` + key `flavors` (semua rasa aktif + flag
  `dipakai`) dan `semua_rasa_aktif`.
- `public_po_batch_for_date` + key `flavors` (array id, `null` = semua).
- `create_order` menolak rasa tersembunyi di **DUA titik**: item satuan **dan**
  slot bundle — kalau cuma item yang dicek, pembeli bisa menembus lewat paket.

### Dua jebakan yang memakan waktu (penting!)

1. **`pg_get_functiondef` mengembalikan definisi yang acak kalau ada overload.**
   Gotcha lama masih berlaku. `scripts/verify-overloads.js` dipakai dulu untuk
   memastikan tidak ada overload sebelum patch — sekarang sudah bersih
   (migration-52 yang membuangnya).
2. **`create or replace` gagal dengan `42P13 cannot remove parameter defaults
   from existing function`** kalau default parameter tidak ditulis ulang.
   Solusinya: tulis ulang signature lengkap dengan `DEFAULT ...` seperti
   migration-52, bukan cuma nama + tipe dari dump.
3. **Fungsi hasil `pg_get_functiondef` ada yang perlu patch di tengah-tengah.**
   `admin_list_po_batch_detail` punya `ringkasan` sebagai objek NESTED, jadi
   menyisipkan key baru sebelum `) into v_result;` akan menaruh kuncinya
   DI LUAR `jsonb_build_object` → syntax error. Anchor yang benar: sebelum
   `'ringkasan', jsonb_build_object(`.
4. **`node scripts/dump-fn.js X > file` lewat PowerShell menulis UTF-16.**
   Pakai `cmd /c "node ... > file"` supaya byte apa adanya.

### Kode

- `lib/po.ts` — `PoBatchStock.flavors: Set<number> | null` + parsing key baru.
- `OrderFlow.tsx` — `visibleCategories` menyaring rasa per allowlist; dipakai
  untuk `OrderMenuBrowser` DAN `CartDrawer`. `flavors`/`cartLines` otomatis
  aman karena diturunkan dari daftar yang sudah disaring, jadi rasa yang baru
  disembunyikan **langsung hilang dari keranjang**.
- `admin/actions.ts` — `savePoBatchFlavorsAction` + tipe `PoBatchFlavorRow`.
- `PoBatchDetailClient.tsx` — chip rasa jadi checkbox; badge "semua tampil" vs
  "{n} dipilih"; ikut tersimpan bareng stok & bundle di tombol Simpan yang sama.

### Verifikasi

`npx tsc --noEmit` bersih · `npx eslint src --max-warnings=0` bersih ·
`npm run build` sukses.

`node scripts/test-batch-flavors.mjs` — **11 OK, 0 GAGAL** (butuh
`ADMIN_EMAIL` + `ADMIN_PASSWORD` di `.env.local`; variabelnya
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, bukan `ANON_KEY`):

```
OK  detail batch mengirim key flavors
OK  admin_save_po_batch_flavors berhasil
OK  hanya rasa yang dipilih yang ditandai dipakai [1]
OK  RPC publik hanya mengirim rasa yang diizinkan [1]
OK  create_order MENOLAK rasa tersembunyi -> 22023 flavor_unavailable
OK  create_order MENERIMA rasa yang diizinkan -> RK-261014-041
OK  allowlist uji dibersihkan di semua batch
```

Skrip cleans up sendiri: allowlist dikosongkan, stok dikembalikan, order uji
dihapus. Dicek ulang: 0 baris allowlist, 0 order uji, total stok batch 0.

**Gotcha tes:** `public_po_batch_for_date` memilih batch dengan **sisa stok
terkecil**. Kalau cuma satu batch yang diset, RPC bisa memilih batch lain dan
tesnya salah sasaran — harus apply ke SEMUA batch aktif.

---

## 2026-10-14 - "Perubahan tidak muncul": dev server mati, bukan kode salah

**Gejala:** Steven kirim `Eror 1/2/3` (11:15-11:16) yang masih menunjuk tampilan
LAMA — nav kolom-kiri, kartu header, dan "Ringkasan batch" yang sudah dihapus.

**Penyebab sebenarnya:** tidak ada Next.js server yang jalan sama sekali saat
screenshot diambil (port 3000 kosong, nol proses `node`). Chrome Steven started
10:17 — SEBELUM kode ditulis (10:40-10:52) — jadi tab-nya masih memegang DOM lama
yang tidak pernah di-refresh, lalu difoto. SemuaScreenshot itu basi, bukan
regresi.

**Kenapa build hijau tidakantee apa pun:** `tsc`/`eslint`/`build` hanya
membuktikan kode benar, bukan bahwa ada proses yang menyajikan kode itu.

### Yang diperbaiki sekalian (2 dari3 poin Steven memang sah)

- **Header dikecilkan lagi.** Satu baris tanpa padding, font 12-13px, tinggi
  ~24px. Tombol tab dinaikkan ke `py-3 text-[15px]` supaya sub-menu bar jadi
  fokus utama halaman.
- **Tab Stok sekarang "Menu & Stok".** Steven (EROR 2): "belum ada perubahan,
  lihat masih tidak ada seperti konssep yang menu & stock sebelumnya yang di
  Menu bar utama". Tabel angka (JENIS MENU / STOK AWAL / TERJUAL / SISA) DAN
  pratinjau menu terpisah DIGABUNG jadi satu panel kartu per kategori —
  meniru grid kategori `/admin/menu`: gambar, jumlah rasa, badge status
  visibility, chip rasa, dan input stok di kaki kartu. `MenuPreview` dihapus,
  digantikan `MenuStockCard`. Label `colName`/`colLeft`/`menuTitle`/
  `menuSubtitle`/`menuEmpty`/`pcsLeft`/`noStock` dihapus dari kamus karena
  sudah tidak dipakai.

### Gotcha baru (nomor berikutnya)

**Screenshot "tidak berubah" hampir selalu berarti tidak ada yang menyajikan
kode baru — cek proses SEBELUM membaca kodenya lagi.** Urutan yang benar:

1. `Get-NetTCPConnection -LocalPort 3000 -State Listen` — kosong? tidak ada
   server, apa pun isi `.next`.
2. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` — StartTime proses
   browser bisa jauh lebih tua dari file yang diedit.
3. Baru setelah yakin server hidup, barleyt koding ulang.

Melihat kode yang "benar" berulang kali wastes satu turn penuh kalau
penyebabnya proses yang mati. Hubungkan juga gotcha #55 (proses `node` lama
duduk di port 3000 dengan build basi).

**Verifikasi:**
- `npx tsc --noEmit` bersih · `npx eslint src --max-warnings=0` bersih.
- `npm run dev` dijalankan ulang; `GET http://localhost:3000/admin/login` → 200.
- Catatan: `/admin/po/1` tanpa sesi admin akan balas halaman login (title
  "Seller sign in"), jadi verifikasi markup detail batch butuh login dulu.

---

## 2026-10-14 - Tab batch disamakan dengan sidebar + "Ringkasan batch" dihapus

**Permintaan Steven (14-10-2026, 8 poin dari `D:\Gambar eror\Gambar 1-8.png`):**
hapus tulisan atas di halaman detail batch, pratinjau menu per batch, tab
Pesanan/Pelanggan/Mutasi harus sama dengan halaman sidebar, hapus Ringkasan
batch, filter Mutasi jadi ringkas, langkah konfirmasi pembeli jangan terlalu
lebar, dan bill (subtotal/total di atas, catatan di akhir, harga di ujung kanan).

### Komponen bersama baru (`src/components/admin/shared/`)

Tiap tab batch tadinya menulis ulang tabel sendiri yang jauh lebih sulit dibaca
(text 11px, tombol ikon tanpa label). Sekarang penampilannya DIEKSTRAK dan
dipakai dua tempat, jadi tidak bisa lagi melenceng:

| File | Dipakai oleh |
|---|---|
| `shared/OrderCards.tsx` | `/admin/orders` + tab Pesanan di `/admin/po/[id]` |
| `shared/CustomerTable.tsx` | `/admin/customers` + tab Pelanggan |
| `shared/SalesTransactions.tsx` | `/admin/sales` + tab Mutasi |

`OrderDetailModal` (modal detail pesanan + simpan catatan admin) ikut
dipindahkan ke `shared/OrderCards.tsx` dengan state internal.

### Mengubah

- `PoBatchDetailClient.tsx` — kartu header (tanggal buka/tutup, badge, catatan
  ruang lingkup) dihapus; sisa baris link kembali + nama batch + status +
  tanggal ambil, semuanya satu baris. Nav Stok/Pesanan/Pelanggan/Mutasi jadi
  BARIS PENUH (4 tombol `flex-1`) tanpa grid `lg:grid-cols-[210px_...]`.
  Blok "Ringkasan batch" dihapus dari semua tab.
- `PoBatchDetailClient.tsx` — `MenuPreview` baru di tab Stok: pratinjau
  READ-ONLY kategori + rasa yang benar-benar dilihat pembeli, dengan badge
  `Dijual di batch ini` / `Sisa habis` / `Di luar batch ini` / `Disembunyikan`.
  Aturannya dibalik dari `stockByCategory` di `OrderFlow` (batch pakai sisa
  batch, kategori tanpa baris batch pakai `stock_enabled` + `stock` global).
- `po/[id]/page.tsx` — ambil `getPublicMenu()` dan kirim `menu` ke client
  untuk pratinjau di atas. Tidak ada migration baru.
- `SalesTransactions.tsx` — filter dipindah dari kartu besar terpisah jadi
  tombol kecil + baris input ringkas di KEPALA "Daftar transaksi". Teks kecil
  diperbesar: header kolom `text-[11px]` -> `text-xs`, tanggal/kode `text-xs`
  -> `text-[13px]`, nama pembayaran `text-[10px]` -> `text-[12px]`.
- `OrderFlow.tsx` — langkah "Konfirmasi" dibungkus `max-w-2xl` (sebelumnya
  melar ~1100px di desktop). Blok subtotal/total dipindah ke ATAS kolom catatan
  dan digambar seperti struk (garis putus-putus, nominal rata kanan, total
  ditebalkan); field Catatan turun ke isian terakhir sebelum persetujuan.
- `i18n/id.ts`, `i18n/en.ts` — blok `admin.po.detail` dirapikan: `subtitle`,
  `scopeNote`, `summary.*`, dan label kolom yang tidak lagi dipakai dihapus;
  label pratinjau menu baru ditambahkan. `viewDetail` DIPERTAHANKAN karena
  masih dipakai daftar batch di `/admin/po`.

### Catatan

- Tidak ada perubahan skema database, jadi tidak ada migration baru.
- `getPublicMenu()` memakai `cache()` dari React, jadi pemanggilan di
  `po/[id]/page.tsx` tidak menambah query kalau sudah dipanggil di halaman lain.

**Verifikasi:**
- `npx tsc --noEmit` — bersih.
- `npx eslint src --max-warnings=0` — bersih.
- `npm run build` — lihat entri bila ada kegagalan.

---

## 2026-10-14 - Detail batch jadi halaman penuh + batch punya bundle sendiri

**Permintaan Steven (14-10-2026):** tunjuk `EROR1.png` (halaman lama: kotak nav
kecil + tabel tipis) dan `OK1.png` (halaman Mutasi asli). "Bukan hanya gini
maksudnya... yang akan kita butuhkan nanti, stock (buat konsep yang sama seperti
sebelumnya yang menu dan stock), mutasi, pelanggan." Dan lewat kuesioner: nav
tetap kotak di dalam halaman, tapi tiap tab jadi halaman lengkap; halaman Stok
bisa diset DAN bundle bisa diset per batch; tab Pesanan tetap ada dengan aksi
ubah status.

### BUG KRITIS YANG KETEMU (dan sudah diperbaiki)

Migration-49 ternyata tidak pernah benar-benar meng-apply bagian `create_order`.
Di produksi ada DUA overload:

| signature | punya logika batch? | pernah dipanggil? |
|---|---|---|
| 18 argumen | TIDAK | tidak (frontend selalu pakai 20) |
| 20 argumen (ada `p_po_batch_id`) | YA | ya |

Artinya batch yang Steven buat HARI INI belum benar-benar jadi: stokka dipotong
dari `categories.stock`, bukan dari `po_batch_stock`. Ketahuan waktu
menguji harga bundle — masih Rp 17.500/slot padahal batch diset Rp 15.000.
Penyebabnya `create or replace` dengan signature berbeda membuat overload,
bukan mengganti (lihat gotcha #107).

Migration-52 sekarang: overload 18 argumen di-drop, dan overload 20 argumen
di-patch dari definisi LIVE-nya — bukan ditulis ulang dari nol — supaya logika
batch dari migration-49 tetap utuh.

### Migration-52 (SUDAH LIVE, idempoten)

- Tabel `po_batch_bundles` (batch_id, bundle_id, price, is_active) + index.
- RPC `admin_save_po_batch_stock` (satu batch, stok per kategori, tidak boleh
  turun di bawah yang sudah dipesan) dan `admin_save_po_batch_bundles`.
- `admin_list_po_batch_detail` +`bundles` + `semua_bundle_aktif`.
- `public_po_batch_for_date` +`bundles` (id + harga) untuk sisi pembeli.
- `create_order` (20 argumen) di-patch: bundle di luar batch ditolak
  (`bundle_unavailable`), harga pakai harga batch kalau diisi.

Diuji langsung ke produksi, 4 kasus: batch tanpa set bundle → semua paket boleh
(mode lama); bundle nonaktif → ditolak; bundle aktif harga 30.000 → harga per
slot 15.000; dikosongkan lagi → kembali mode lama.

### Halaman detail

Empat tab sekarang halaman LENGKAP, bukan tabel tipis:

- **Stok** — `Stok & Bundle`. Tabel stok per jenis menu bisa DIEDIT langsung
  (kolom "Sisa" adalah input), plus daftar paket dengan checkbox dan kolom
  "Harga batch" (kosong = pakai harga bawaan). Tombol Simpan muncul hanya
  saat ada perubahan, dan mengexclude `admin_save_po_batch` supaya halaman ini
  tidak perlu mengirim ulang tanggal/label.
- **Pesanan** — tabel lengkap dengan cara ambil + cara bayar, dan tombol aksi
  status (terima / siap / selesai / tolak) yang mengikuti rantai
  pending → accepted → ready → delivered.
- **Pelanggan** — pencarian + tabel (nama, telepon, IG, jumlah pesanan, total,
  kode pesanan terakhir), terfilter ke batch ini.
- **Mutasi** — kartu ringkasan + rasa terlaris + pencarian + tabel transaksi,
  meniru halaman Mutasi di sidebar utama.

### Sisi pembeli

`visibleBundles` di `OrderFlow`: kalau batch punya daftar bundle, hanya itu
yang tampil (dengan harga batch). Kalau belum pernah diset (`bundles: null`),
semua bundle aktif tetap tampil seperti dulu. `validateMenu` menolak keranjang
yang masih punya paket yang sudah dihapus Steven dari batch itu.

### Verifikasi

`tsc` 0, `eslint` 0, build sukses, `test:pages` 41/41, headless dengan sesi
admin asli 9/9 termasuk screenshot. Data produksi utuh: 6 pesanan, 1 batch
(milik Steven), tidak ada sisa batch uji.

## 2026-10-14 - Detail batch: klik batch -> sidebar Stok/Pesanan/Pelanggan/Mutasi

**Permintaan Steven:** "yang saya inginkan adalah contoh setelah kita buat batch
kita bisa click itu lalu nanti di dalamnya ada beberapa sidebar yang sama seperti
mutasi, stock, pesanan, pelanggan namun khusus utk batch itu aja".

### Database — migration-51 (SUDAH LIVE, idempoten)

- Index partial `orders (po_batch_id, created_at desc) where po_batch_id is not null`.
- `admin_list_orders`, `admin_list_mutasi`, `admin_list_customers` masing-masing
  dapat parameter baru `p_po_batch_id` di AKHIR daftar, default NULL.
- RPC baru `admin_list_po_batch_detail(bigint)`: header batch, rincian stok per
  jenis menu (sisa / terjual / stok awal), dan ringkasan pesanan.
  Raise `batch_not_found` kalau id tidak ada.

**JAWAHAH NYATA YANG HAMPIR MELALUI:** `create or replace function` dengan
JUMLAH ARGUMEN BERBEDA tidak mengganti fungsi lama — Postgres membuat OVERLOAD
baru. Karena semua parameter baru punya DEFAULT, panggilan lama 4 argumen jadi
ambigu: `function admin_list_orders(unknown, unknown, integer, integer) is not
unique`. Kalau tidak di(drop) dulu, `/admin/orders`, `/admin/sales`, dan
`/admin/customers` production akan langsung rusak. Ketahuan karena migration-51
sudah di-apply sebelum dicek — sekarang migration-51 sudah punya `drop function
if exists` untuk ketiganya.

### Halaman `/admin/po/[id]`

- `src/app/admin/(dashboard)/po/[id]/page.tsx` — server component, otomatis dapat
  `AdminShell` + guard admin karena ada di dalam group `(dashboard)`.
  Batch hilang atau id bukan angka -> `notFound()` (404).
- `src/components/admin/PoBatchDetailClient.tsx` — sidebar kiri berisi 4 tab:
  Stok / Pesanan / Pelanggan / Mutasi. Di mobile sidebar jadi strip horizontal
  yang bisa digeser; di desktop jadi kolom vertikal yang `sticky`.
- Empat tab dimuat SEKALI di server lalu dipindah lewat state. Tidak ada fetch
  ulang saat tab berganti, jadi pindah tab instan dan tidak ada request
  bolak-balik.
- Kartu batch di `/admin/po` sekarang tautan ke `/admin/po/<id>` dengan label
  "Lihat detail". Tombol Ubah/Hapus SENGAJA di luar `<Link>` supaya klik
  Hapus tidak pernah membuka detail.

### Keputusan data

- **`stok_awal` tidak ada di database**, jadi diturunkan dari
  `sisa + terjual`. Akurat karena stok awal hanya turun karena penjualan dan
  naik lagi saat pesanan dibatalkan. Ditampilkan dengan catatan eksplisit di
  bawah judul kolom.
- **"Terjual" memakai semantik kartu batch** (semua status kecuali
  rejected/cancelled), bukan semantik Mutasi (accepted/ready/delivered).
  Menghitung pesanan yang dibatalkan sebagai terjual akan membuat kolom
  "Terjual" tidak cocok dengan kolom "Sisa" di tabel yang sama.
- Kategori yang tidak punya baris stok DAN tidak pernah terjual di batch itu
  disembunyikan dari tabel — supaya tidak ada baris 0 yang membingungkan.
- Tab Mutasi menampilkan revenue/pesanan/PCS dari batch itu. Field
  `revenue_today` sengaja TIDAK ikut difilter batch (dan tidak dirender di
  sini) karena "hari ini" itu selalu hari ini.

### Verifikasi

`tsc` 0, `eslint` 0, build sukses (route `/admin/po/[id]` muncul),
`test:pages` 41/41, headless dengan sesi admin asli 10/10 termasuk screenshot
tab Stok dan keempat tab. RPC diuji langsung ke produksi: `p_po_batch_id` NULL
tetap memberi hasil yang sama dengan panggilan lama, dan batch uji dihapus.

## 2026-10-13 - Tahap B: batch PO lengkap (sisi pembeli + admin)

**Scope:** sisa dari 15 permintaan Steven (poin 4, 5, 6, 12, 13, 14). Tahap A
sudah live di commit `cee672d`. Semua 15 permintaan sekarang beres.

### 1. Migration-49 (SUDAH LIVE di produksi, idempoten)

Tabel `po_batches` + `po_batch_stock`, kolom `orders.po_batch_id` dan
`orders.pickup_date`, fungsi `restore_order_stock` / `consume_order_stock`
service-role only, RPC publik `public_po_pickup_dates()` dan
`public_po_batch_for_date(date)`, RPC admin `admin_list_po_batches` /
`admin_save_po_batch` / `admin_delete_po_batch`.

Bonus: `admin_update_order_status` DITAMBAHKAN — tadinya menulis ke
`store_settings.total_stock` yang sudah tidak ada sejak migration-11, jadi
setiap reject/cancel error. Sekarang panggil `restore_order_stock` /
`consume_order_stock` dan mengembalikan JSON tanpa `total_stock`.

### 2. Migration-50 (SUDAH LIVE di produksi)

`admin_list_orders` sekarang ikut membawa `delivery_zone`, `po_batch_id`, dan
`pickup_date` ke JSON. Tanpa ini penjual tidak bisa melihat tanggal ambil.

### 3. Sisi pembeli

- **Langkah baru "Tanggal Ambil"** (`OrderFlow.tsx`), muncul SEBELUM identitas
  hanya kalau ada batch yang sedang dibuka. Tanpa batch, langkahnya dihilangkan
  dan pembeli jalan mode lama — daftar langkah jadi 4, bukan 5, jadi tidak ada
  layar kosong yang membingungkan.
- **Stok per batch** mengalir lewat `stockOverride` → `remainingStockByCategory`.
  Kategori yang ada di batch memakai angka batch dan SELALU dianggap
  `stock_enabled`, karena mengaktifkan stok itu memang makna kolomnya.
- **3 metode pengambilan**: Ambil di toko / Diantar / Pesan Kurir. Kurir tidak
  minta alamat dan tidak ada ongkir yang kita tagih.
- **Popup lokasi** untuk Ambil & Diantar (komponen `LocationPopup`), berisi
  nama titik + catatan admin + alamat toko. Tidak ada data yang dikarang.
- Tanggal pilihan disimpan di sessionStorage (`js_po_pickup_date`) supaya
  refresh tidak menghapus pilihan dan stok tidak balik ke `categories.stock`.
- `p_po_batch_id` + `p_pickup_date` dikirim di kedua jalur pemesanan
  (transfer dan QRIS). Schema zod QRIS ikut menerima `poBatchId` /
  `pickupDate`, dan `deliveryMethod` sekarang izinkan `courier`.

### 4. Sisi admin

- **`/admin/po`** (baru): daftar batch, badge status, tanggal buka/tutup/ambil,
  terjual/pcs/pendapatan, stok per jenis menu, tambah/ubah/hapus.
- **`/admin/menu`**: stepper stok DIHAPUS dari header kategori DAN form
  kategori, plus komponen `QuickStockInput`. Stok sekarang hanya di batch PO.
- **Dashboard**: tombol buka/tutup pre-order + banner status dihapus
  (prop `isPreorderOpen` ikut dibuang dari `DashboardClient` dan page).
- **`/admin/orders`**: tanggal ambil tampil di baris meta tiap pesanan.
- **Menu Profil**: tiap bar (FAQ, Syarat, Jam buka, Kontak, Akun) dapat tombol
  "Kelola isi halaman" yang menuju editor yang sesuai — Profil jadi pintu
  masuk, bukan editor kedua.

### 5. Footer

`main { min-height: 100dvh }` di `globals.css` (tanpa `@layer`) + `min-height:
0 !important` di blok `@media print`. Terverifikasi di enam halaman pendek
(/riwayat, /contact, /faq, /jam-buka, /syarat-ketentuan, /track): footer selalu
mulai di bawah lipatan layar 900px.

### Verifikasi

`tsc` 0, `eslint` 0, build sukses, `test:pages` 34/34 (2 tes lama ditulis
ulang karena "Menu & Stok" dan "Stok" memang sengaja hilang), headless lokal
14/14 (mode lama) + 13/13 (batch aktif, termasuk bukti kartu menunjukkan
"Tersisa 5" dari batch dan bukan 20 dari `categories.stock`). Batch uji di
produksi sudah dihapus; 6 pesanan lama `JS-` utuh.

## 2026-10-13 - Tahap A dari 15 permintaan: alur order + admin

**Scope:** 15 permintaan Steven (13-10-2026, gambar 1-11 di `D:\Gambar error`),
dijawab lewat kuesioner. Bagian ini Tahap A; feature batch PO (poin 4, 5, 6, 12,
13, 14) menyusul karena butuh tabel dan fungsi SQL baru.

### 1. Scroll-reveal dibatalkan total (poin 8 + 15)

Steven mengoreksi: "maksud saya BUKAN muncul ketika scroll, tapi KARENA DIA
ADA DI BAWAH". Jadi tidak ada efek apa pun lagi.

- `src/lib/useRevealOnScroll.ts` DIHAPUS.
- `MobileBottomNav` selalu tampil; `visible translate-y-full opacity-0` dan
  hook-nya dibuang.
- `SiteFooter` selalu tampil; `invisible opacity-0` dan hook-nya dibuang.
- `<body>` di layout.tsx kembali ke `min-h-dvh` polos. Ruang scroll 64px yang
  dipaksakan (`min-h-[calc(100dvh+4rem)]`) dicabut juga — tanpa efek reveal,
  tidak ada alasan halaman pendek harus bisa digulir.

Netralkan efek reveal berarti feedback loop scroll anchoring (gotcha #99) dan
reservasi ruang scroll (#101) ikut hilang, bukan sekadar disembunyikan.

### 2. Panel keranjang hanya di langkah "Pilih Rasa" (poin 1)

`showCartPanel` di `OrderFlow.tsx` berubah dari `step !== "identity"` jadi
`step === "menu"`. Di Pembayaran dan Konfirmasi isinya cuma mengulang apa yang
sudah tertulis di kartu "Periksa pesananmu".

### 3. QRIS (poin 2)

`qrisMidtrans` jadi `"QRIS"`, `qrisMidtransDesc` jadi kosong di id.ts dan
en.ts. `ChoiceCard` sekarang hanya merender blok deskripsi kalau `desc`
berisi, supaya tidak menyisakan jarak kosong.

### 4. Judul bagian pengambilan (poin 3)

`deliveryTitle`: "Bagaimana cara menerimanya?" -> "Pengambilan". Dipakai
lagi di baris review pesanan.

### 5. Kartu alamat toko yang salah label dihapus (poin 7)

Kartu itu berlabel "ALAMAT PENGIRIMAN" tapi isinya `settings.address` —
alamat TOKO, bukan alamat pembeli. Salah label itu yang bikin membingungkan,
dan di langkah "Ambil di toko" pembeli memang tidak butuh alamat pengiriman.

### 6. Admin: "Lihat pesanan" dihapus + teks diperbesar (poin 9)

Tombol expandable di daftar pesanan dihapus beserta `OrderRow.tsx`. Rincian
yang dihidupkannya (Telepon, Pembayaran, Pengiriman, alamat, tanggal) semuanya
sudah tertulis di header kartu, dan versi lengkapnya sudah ada di modal detail
yang terbuka saat kode pesanan ditekan.

Teks di header kartu diperbesar: nama pelanggan `text-sm` -> `text-base`,
daftar item `text-[13px]` -> `text-sm`, baris tanggal/pembayaran/delivery
`text-[11px]` -> `text-[13px]`.

### 7. Font dashboard admin diperbesar (poin 10)

Ada ratusan kemunculan `text-[10px]` s.d. `text-[13px]` di `src/app/admin/**`
dan `src/components/admin/**`. Semuanya ditangani dari satu tempat: blok CSS
`.admin-shell` di `globals.css` yang menaikkan ukuran font terkecil, lalu
kelas penanda `admin-shell` ditambahkan ke `AdminShell` dan halaman login
admin. Aturan ini SENGAJA tanpa `@layer` — CSS tanpa layer menang atas utility
Tailwind (layer `utilities`). Tampilan pembeli tidak tersentuh.

### Verifikasi

`tsc` 0 error, `eslint` 0 error, build sukses, `test:pages` 30/30.

Headless lokal 4/4: footer `/riwayat` 1912x807 langsung `visible` dengan sisa
scroll 0px (tidak ada ruang scroll paksa lagi), nav bawah 390x844 `visible`
dengan `transform: none` tanpa perlu scroll, `/order` tidak lagi memuat panel
keranjang maupun teks "QRIS via Midtrans", dan aturan `.admin-shell` terbukti
terpasang di CSS terpasang.

Pemeriksaan visual admin BELUM dilakukan otomatis karena `ADMIN_EMAIL` dan
`ADMIN_PASSWORD` tidak tersimpan di `.env.local` — perlu dicek manual Steven.
## 2026-10-13 - Footer ikut tersembunyi sampai di-scroll

**Scope:** 1 permintaan Steven (13-10-2026 13:15, dikonfirmasi lewat kuesioner):
"sembunyikan footer juga sampai di-scroll". Footer yang dimaksud adalah blok
coklat info toko (`SiteFooter`, tampil di desktop), bukan MobileBottomNav.

### Yang berubah

- **`src/lib/useRevealOnScroll.ts` (baru)** - hook bersama untuk
  "muncul setelah digulir", dipakai `MobileBottomNav` dan `SiteFooter`.
  Ambang `REVEAL_AFTER_PX = 16`. Argumen `tampilkanJikaTidakBisaGulir` yang
  sempat ada untuk footer DIHAPUS: begitu ada pengecualian halaman pendek,
  elemen muncul diam-diam tepat setelah pindah halaman, persis perilaku yang
  Steven tolak.
- **`src/components/customer/SiteFooter.tsx`** - pakai hook itu. Efeknya
  `invisible` + `opacity` dengan `transition-opacity`.
- **`src/components/customer/MobileBottomNav.tsx`** - hook lokal
  `useShowNavOnScroll` dihapus, diganti hook bersama.
- **`src/app/layout.tsx`** - `<body>` jadi `min-h-[calc(100dvh+4rem)]`,
  sebelumnya `min-h-dvh`.

### Dua jebakan yang bikin lama

**1. `translate-y-full` di footer memicu scroll anchoring.** Footer itu
`position: static`, jadi saat transform-nya berubah seiring scroll, anchoring
browser mengoreksi scroll, scroll turun lagi, footer hilang, anchoring dorong
naik, dan seterusnya. Akibatnya `scrollY` terkunci di 12px dan `opacity`
footer berkedip di 0.031 tiap frame. Nav bawah aman karena `position: fixed`.

**2. Padding di footer TIDAK menambah tinggi halaman.** Tiap halaman punya
anak `flex-1` di dalam wrapper `min-h-dvh`; anak itu menyerap seluruh ruang
kosong yang tersisa. `pb-16` di footer maupun `<div class="h-16">` sebagai
saudara setelah footer sama-sama dikompensasi: `/riwayat` 1912x807 tetap
`scrollHeight` 807 = persis tinggi viewport. Satu-satunya tempat yang tidak
menyerap adalah `<body>`, jadi ruang scroll minimal 64px dipasang di sana.

Perhatikan juga: aturan `min-height` untuk `body` di `@layer base` globals.css
sama sekali tidak berlaku, karena class utility `min-h-*` di JSX menang atas
cascade layer `base`. Itu sempat membuat satu percobaan gagal tanpa error.

### Verifikasi

Headless (Edge + CDP, scroll via `Input.dispatchMouseEvent`): 8/8 lulus.
Footer `visibility: hidden` di layar pertama dan `visible` setelah di-scroll
di `/riwayat`, `/faq`, `/track`, `/jam-buka`, `/syarat-ketentuan`, `/contact`
(1912x807) dan `/riwayat` (1920x1400). Bottom nav mobile `/riwayat` 390x844
tetap muncul setelah digulir. `tsc` 0 error, `eslint` 0 error, build sukses,
`test:pages` 30/30.

Verifikasi produksi (`japanese-sando-87l6xhawy-ooraa64`, deploy ke
https://japanese-sando.vercel.app): 8/8 lulus dengan angka yang sama persis.

Satu jebakan pengukuran yang sempat bikin salah baca: menunggu 2,5 detik setelah
`Page.navigate` ke produksi terlalu cepat. Bundle CSS belum sempat terpasang,
jadi `getComputedStyle(footer).visibility` masih nilai default `visible` padahal
kelas React-nya sudah benar (`invisible opacity-0`). Jejak 120ms membuktikan
classes React sudah benar sejak frame pertama; yang belum ada hanya CSS-nya.
Jeda aman: 6 detik. Gotcha #102.

Catatan: `store_settings.hours_*` dan `deadline_*` masih kosong di produksi,
jadi blok jam buka di footer belum menampilkan apa pun. Tidak diisi dengan
data karangan.
## 2026-10-13 - Prefix kode pesanan RK-, nav bawah muncul setelah di-scroll

**Scope:** 2 permintaan Steven (13-10-2026 12:15) + 1 screenshot `/track` yang
masih menampilkan placeholder "JS-260930-001".

### 1. Prefix kode pesanan JS- menjadi RK-

Steven: "itu di kode pesanan JS diubah jdi RK dulu".

Kode pesanan dibuat di fungsi SQL `create_order`, satu baris:

```sql
v_code := 'JS-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('order_code_seq')::text, 3, '0');
```

Cara_AMAN mengubahnya: `supabase/migration-48.sql` **tidak** menyalin body dari
migration-46. Body diambil VERBATIM dari versi LIVE lewat
`pg_get_functiondef(pg_proc.oid)`, lalu hanya baris itu yang diganti. Panjang
body sebelum dan sesudah sama persis (14436 karakter) — bukti tidak ada satu
baris lain yang ikut berubah.

Dua hal yang harusVIA `pg_get_functiondef` TIDAK ikut dan ditulis ulang manual:

- **`grant execute ... to anon, authenticated, service_role`**. Sebenarnya
  `create or replace` sudah mempertahankan grant, tapi ditulis eksplisit
  supaya file migrasi utuh.
- **`comment on function`.** Function-nya punya komentar
  ("RPC buyer: buat pesanan. Nama + phone wajib..."). Kalau tidak ditulis ulang,
  komentar itu hilang permanen.

Yang TIDAK diubah, dan sengaja:

- **`supabase/schema.sql`** ikut di-update (`RK-YYMMDD-001`) karena dipakai
  `npm run db:push` untuk instalasi database kosong. Migrasi historis
  (2-46) TIDAK disentuh — itu catatan sejarah, bukan kode yang dijalankan lagi.
- **`i18n` placeholder** `codePlaceholder` di id.ts + en.ts, dan contoh
  `"order_id"` di komentar webhook Midtrans.
- **Pesanan yang sudah ada.** 6 pesanan lama tetap `JS-` dan itu benar:
  kodenya sudah tercetak, sudah dipakai pembeli cek status, dan sudah jadi
  `order_id` di Midtrans. Mengubahnya akan membatalkan riwayat. Hanya pesanan
  BARU yang dapat `RK-`.

Kenapa aman: tidak ada kode frontend atau RPC lain yang mem-parse "JS-".
Kolom `orders.order_code` cuma `text not null unique`, dan semua pencarian
lewat `upper(order_code) = upper(kode yang diketik)`. Jadi `RK-` langsung bisa
dicari di /track tanpa perubahan lain.

### 2. Nav bawah hanya muncul setelah di-scroll

Steven: "itu nav bawahnya hanya muncul ketika dislide kebawah, jangan ketika
klik Riwayat langsung muncul".

`MobileBottomNav` sekarang pakai hook `useShowNavOnScroll(active, pathname)`:

- Nav di-render dengan `invisible translate-y-full opacity-0` saat
  `scrollY <= NAV_REVEAL_PX`, dan `visible translate-y-0 opacity-100` di atas
  ambang itu. `invisible` dipakai bareng `translate` supaya nav yang
  tersembunyi benar-benar KELUAR dari tab-order — kalau hanya digeser keluar
  layar, link di dalamnya masih bisa difokus pakai keyboard.
- Hooknya dipanggil SEBELUM `if (hidden) return null`. Hook yang bersyarat akan
  mengubah urutan hook antar navigasi dan React melempar "Rendered more hooks
  than during the previous render".
- `pathname` jadi dependensi efek supaya hook berjalan ulang tiap pindah
  halaman. Next.js mengembalikan scroll ke 0, tapi event "scroll" tidak selalu
  sempat dilepas pada momen itu.
- Tidak ada `setShow(false)` di dalam efek (men-trigger eslint
  `react-hooks/set-state-in-effect`). Hook mengembalikan `active && show`:
  saat `active` false, komponen sudah `return null` jadi nav memang tidak
  dirender.

Dua percobaan yang GAGAL dan alasannya — jangan diulang:

- **Ambang 80px terlalu besar.** `/riwayat` hanya punya 68px ruang scroll,
  dan itu seluruhnya cuma spacer `h-[68px] md:hidden` milik nav itu sendiri.
  Dengan ambang 80px nav TIDAK PERNAH muncul di halaman yang justru jadi
  keluhan Steven. Threshold sekarang **16px**.
- **Pengecualian "kalau halaman tidak bisa digulir, tetap tampilkan"** —
  pakai ini karena triglyceride agar pembeli tidak kehilangan navigasi di
  halaman pendek. JustruSRU yang menDibuat: di `/track` (pendek) nav muncul
  diam-diam tepat setelah pindah halaman, persis yang Steven minta dihapus.
  Pengecualian itu juga tidak perlu, karena setiap halaman pembeli sudah
  merender spacer 68px, jadi selalu ada yang bisa digulir. Dihapus total.

### Verifikasi

tsc 0, eslint 0, build sukses, test-pages **30/30**, headless **8/8**:

- `/riwayat` nav `visibility=hidden` saat dibuka (`scrollY=0`)
- setelah wheel scroll: `visibility=visible opacity=1 scrollY=68`
- balik ke atas: `visibility=hidden` lagi
- klik tab Orderan -> `/track` -> nav `visibility=hidden` (tidak langsung muncul)
- beranda: hidden saat dibuka, visible setelah scroll (`scrollY=1430`)

Migrasi 48 diverifikasi langsung ke database: prefix `RK-` aktif, `'JS-' ||`
hilang, ketiga grant utuh, komentar fungsi ada, 6 pesanan lama tetap `JS-`
dan 0 pesanan `RK-`. Tidak ada order yang dibuat saat verifikasi.
## 2026-10-13 - Footer /riwayat (dan 3 halaman lain) jadi full width

**Scope:** lanjutan permintaan Steven (13-10-2026 11:24) — "masih ngebug
itu bawahnya", dengan screenshot 1125x875 dan lingkaran tangan di area
footer.

### Koreksi hipotesis sebelumnya: itu BUKAN scrollbar

Entry sebelumnya menyimpulkan band gelap = scrollbar horizontal Chrome mode
gelap. **Kesimpulan itu salah**, dan sudah dibuktikan dengan membaca channel
alpha screenshot-nya:

```
y=0..11    rgba(60,60,60,255)  -> title bar jendela Chrome yang ikut tertangkap
y=12..850  opaque              -> isi halaman
y=851      rgba(...,64)        -> 1px anti-alias tepi tangkapan
y=852..874 rgba(0,0,0,0)       -> 23px FULLY TRANSPARANT
```

Band "hitam" di bawah itu **nol piksel dari website**. Dia cuma transparan
yang dirender gelap oleh image viewer Steven. Render langsung halaman LIVE
di 1125x875 menunjukkan y=0 dan y=874 sama-sama cream, tanpa band apa pun,
`clientHeight === innerHeight`, dan `color-scheme: light` sudah aktif.

Jadi perbaikan `color-scheme: light` + `overflow-x: clip` tetap dipertahankan
(mMurah, benar, dan menutup kemungkinan nyata), tapi alasannya bukan untuk
menyembunyikan band yang ada.

### Bug NYATA yang Steven maksud: footer tidak full width

Mengukur `getBoundingClientRect()` footer di 6 halaman (viewport 1125px):

| Halaman        | Lebar footer |
|----------------|--------------|
| `/`             | 1110px (full) |
| `/contact`      | 1110px (full) |
| `/faq`          | **768px** (`max-w-3xl`) |
| `/syarat-ketentuan` | **768px** |
| `/jam-buka`     | **768px** |
| `/riwayat`      | **672px** (`max-w-2xl`) |

Penyebabnya struktural: di halaman-halaman itu, `SiteFooter` berada **di
dalam** wrapper `max-w-XXxl`, sedangkan di `/` dan `/contact` wrapper-nya
hanya membungkus `main` sehingga footer otomatis full width. Akibatnya blok
coklat footer jadi kotak sempit melayang di atas cream — persis yang Steven
lingkari.

Perbaikan: di keempat halaman, wrapper `max-w` dipindah ke dalam satu div
lagi yang membungkus header + main saja, dan `SiteFooter` jadi saudara di
luarnya:

```jsx
<div className="flex min-h-dvh w-full flex-col">
  <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
    <SiteHeader ... />
    <main className="flex-1 ...">...</main>
  </div>
  <SiteFooter settings={settings} />
</div>
```

Hasil: keenam halaman sekarang footer `0..1110` atau `0..1125` (seluruh
lebar viewport), tanpa scrollbar horizontal di mana pun.

### Verifikasi

tsc 0, eslint 0, build sukses, test-pages 30/30, dan pengukuran ulang keenam
halaman: semua footer full width, `clientHeight === innerHeight` di semua.
## 2026-10-13 - Nama fallback "RK", halaman Jam Buka + Syarat & Ketentuan, scrollbar paksa terang

**Scope:** 3 permintaan Steven sekaligus (13-10-2026 10:15)

### 1. Nama toko di kode jadi "RK"

Steven: "Untuk kode JS diubah jadi RK aja karena nanti nama tokonya Ruma
Komugi". Setelah ditanya, pilihannya `RK` (bukan "Ruma Komugi").

Sebelumnya ada **17 literal `"Rumakomugi"`** tersebar di 16 file sebagai
fallback `settings?.store_name ?? "Rumakomugi"`. Semuanya sekarang memakai
satu konstanta baru, `DEFAULT_STORE_NAME = "RK"` di `src/lib/brand.ts`.

Konstanta lokal `DEFAULT_STORE` di `src/app/layout.tsx` dihapus dan diganti
konstanta bersama, supaya ada **satu** tempat untuk mengubah nama fallback.

Catatan: yang tampil di situs sebenarnya tetap nilai DB
`store_settings.store_name` (masih "Rumakomugi") — Steven bisa mengubahnya
dari Admin > Pengaturan. Nilai `RK` hanya muncul kalau `store_settings` kosong
atau gagal dimuat. Nama file `/logo-rumakomugi.jpg` **tidak** diubah, karena
itu path aset, bukan teks brand.

### 2. "Navbar" gelap di bawah footer /riwayat

Steven kirim screenshot 975x861 sambil menyebut bagian paling bawahnya
"kelihatan kayak ngebug, muncul nav". Forensics piksel per baris (sharp):

```
y=848  cream + coklat footer + cream
y=852  full-width rgb(64,64,64)
y=856  full-width rgb(28,28,28)
y=859  rgb(28,28,28) + run rgb(41,41,41) di x=56-100
```

Tiga bukti bahwa itu **bukan elemen situs**:

1. **Tingginya 16px dan konten berhenti tepat 16px di atas batas bawah
   viewport** (861 - 845 = 16). Scrollbar horizontal memakan tinggi layout
   dengan cara persis seperti itu. Band gelap itu scorch-nya, bukan navbar.
2. Warnanya abu-abu netral, bukan palet situs: cream `#fdfaf4` dan
   cocoa-900 `rgb(26,17,10)`. Nilai `28/41/64` abu-abu itu warna scrollbar
   Chrome mode gelap.
3. Steven mengonfirmasi perangkatnya **Windows + Chrome**.

Perbaikannya di `src/app/globals.css`, pada blok `html` di `@layer base`:

```css
color-scheme: light;   /* scrollbar & kontrol form ikut tema situs */
overflow-x: clip;       /* insure tak ada scrollbar horizontal */
```

`overflow-x: clip` dipilih, **bukan** `hidden`: `clip` tidak membuat elemen
jadi scroll container, jadi `position: sticky` (header melayang, sheet profil)
tetap jalan. Kenapa bukan `hidden` + kompensasi padding — itu guncang.

### 3. Halaman /jam-buka dan /syarat-ketentuan

Steven: "yang jam buka dan syarat & ketentuan belum ada /nya". Ternyata di
`profile_menu_items`, hanya `faq` (`/faq`) dan `contact` (`/contact`) yang
punya `href`; `hours` dan `terms` punya `href = NULL` sehingga `ProfileSheet`
membuka popup — dan popup Ketentuan cuma berisi satu kalimat.

Migration-47 (`supabase/migration-47.sql`, sudah DITERAPKAN ke produksi):

- Tabel baru `terms_sections` + RLS + RPC `public_terms`, `admin_list_terms`,
  `admin_save_terms`, `admin_delete_terms` — pola meniru `faq_items`
  (migration-46).
- Seed 8 bagian. **Tidak ada angka komersial yang dikarang**: ongkir, jadwal,
  promo sengaja tidak ditulis. Kalimat asli dari
  `profile_menu_items.body_id` ("Pesanan dibuat setelah pembayaran
  dikonfirmasi...") ikut dipertahankan utuh di bagian Pembayaran dan
  Pembatalan.
- `update ... where code = 'hours' and href is null` → `/jam-buka`, dan
  `code = 'terms'` → `/syarat-ketentuan`. Filter `where code = ...` dipakai
  supaya bar lain yang kebetulan `href` kosong tidak ikut berubah diam-diam.

**"/jam-buka" tidak butuh tabel baru.** Sumber tunggalnya sudah ada:
`store_settings.hours_id` / `hours_en`, diisi dari Admin > Pengaturan, dan
sudah dipakai footer, /contact, /order, dan /account. Halaman baru membaca
sumber yang sama, jadi tidak mungkin berbeda isi satu sama lain.

**Kolom jam buka di database saat ini KOSONG.** Jadi `/jam-buka` menampilkan
empty state + ajakan tanya WhatsApp. Isi jam buka yang sebenarnya harus
diisi Steven lewat dashboard — tidak dikarang di kode.

`body_id`/`body_en` bar `terms` sengaja tidak dihapus: begitu `href` terisi,
frontend melewati popup, tapi kalau `href` dikosongkan lagi isinya masih ada.

**Tidak ada array cadangan** untuk terms, berbeda dengan `faq.ts`. FAQ punya
isi lama yang harus tetap tampil kalau RPC mati; terms justru baru dibuat,
jadi menyalin 8 bagian antara migrasi dan kode hanya menciptakan dua sumber
yang harus dijaga. Array kosong + empty state jujur lebih baik daripada teks
karangan.

File baru: `src/lib/terms.ts`, `src/lib/brand.ts`, `src/app/jam-buka/page.tsx`,
`src/app/syarat-ketentuan/page.tsx`, `src/components/admin/TermsClient.tsx`,
`src/app/admin/(dashboard)/terms/page.tsx`. Menu `/admin/terms` ditambahkan
di `AdminShell.tsx` tepat setelah `/admin/faq`.

### Perbaikan tes

`openPage` di `scripts/test-pages.mjs` sekarang men-decode entitas HTML
sebelum mencocokkan. Sebelumnya cek `"Syarat & Ketentuan"` selalu gagal padahal
halamannya benar, karena HTML menulisnya `Syarat &amp; Ketentuan`. Ini akan
menyakiti setiap cek berikutnya yang memuat tanda `&`.

### Verifikasi

tsc 0 error, eslint 0 error, `npm run build` sukses (route `/jam-buka`,
`/syarat-ketentuan`, `/admin/terms` terdaftar), `test-pages.mjs` **30/30**,
headless CDP **20/20**:

- 4 bar sheet Profil semuanya `<a href>`: Hubungi Kami=/contact, FAQ=/faq,
  Jam Buka=/jam-buka, Syarat & Ketentuan=/syarat-ketentuan — tidak ada yang
  jatuh ke popup lagi.
- Klik bar Ketentuan benar-benar pindah ke `/syarat-ketentuan`.
- 8 `h2` dari database tampil, urut dari Pemesanan sampai Perubahan Ketentuan.
- `getComputedStyle(html).colorScheme === "light"`, `overflowX === "clip"`.
- `/riwayat` 975x861: `clientHeight === innerHeight` (861) — tidak ada lagi
  ruang 16px tempat scrollbar pernah muncul.
- 0 request `/api/flavor-like`, tidak ada storage produksi yang disentuh.

## 2026-10-12 - Field catatan per rasa muncul lagi di halaman pre-order

**Scope:** fix - laporan Steven 12-10-2026 15:46 dengan screenshot kartu
rasa di /order: "saat pre-order tidak ada notenya saat di pilih rasa"

**Penyebabnya bukan fitur yang hilang, tapi fitur yang ada di tempat yang
salah.**

`FlavorCard.tsx` punya TIGA jalur render yang berbeda, masing-masing
dengan komponen aksi sendiri:

| Varian | Dipakai di | Komponen aksi | Punya field catatan? |
| --- | --- | --- | --- |
| `storefront` | halaman **/order** | `StorefrontAction` | **tidak** |
| `dense` | beranda (Menu / Menu Baru / Favorite) | tombol statis | tidak perlu |
| non-dense | kartu besar | `FlavorCardStepper` | ya |

Halaman /order memakai varian `storefront`, dan varian itu - satu-satunya
yang dipakai pembeli saat memilih rasa - justru yang paling sederhana:
hanya tombol `+`, angka, dan `-`. Field catatannya hanya ada di
`FlavorCardStepper`, yang dipakai kartu besar di halaman lain.

Jadi Steven memang tidak pernah bisa mengetik "jangan pakai cabe" saat
memilih rasa. Satu-satunya jalan adalah membuka drawer keranjang dulu.

**Perbaikan:** field catatan dipindahkan (bukan disalin) ke
`StorefrontAction`, di dalam cabang `qty > 0`:

- `const note = cart.notes[String(flavor.id)] ?? ""` ditambahkan, dan
  input memakai `cart.setNote(flavor.id, ...)` - key yang sama
  dengan `FlavorCardStepper` dan `CartDrawer`, jadi ketiganya membaca
  satu nilai yang sama.
-(stepper + input) dibungkus `<div className="space-y-2">`; indentasi
  seluruh blok dirapikan ulang.
- Field sengaja TIDAK muncul sebelum produk dipilih. Satu baris input
  kosong di setiap kartu akan membuat halaman pilihan terasa berat
  tanpa ada yang mengisinya.
- `aria-label` ditambahkan (`"${t.menu.notePlaceholder} — ${name}"`),
  karena di grid 2 kolom placeholder-nya bisa terpotong dan pembaca
  layar butuh tahu kolom ini milik produk yang mana.
- Sekalian dibetulkan typo menua di komentar blok yang sama:
  "supayaqty" dan "satu-satuanya".

**Tidak ada perubahan di sisi server:** kolom `order_items.note` sudah
ada dan `OrderFlow` sudah mengirim `notes[flavorId]`. Yang hilang murni
masalah UI.

**Verifikasi end-to-end (lokal, tanpa mengirim order):** tambah Choco
Matcha -> field catatan muncul -> ketik "tolong sedikit less sweet" ->
`localStorage['js_cart_v1'].notes = { "3": "tolong sedikit less sweet" }`
-> buka drawer keranjang -> catatan yang sama tampil. 0 request
`create_order`, 0 request `/api/flavor-like`, 0 exception.
`tsc` 0 error, `lint` 0 error, `build` sukses, `test-pages` 27/27.

---

## 2026-10-12 - Section "Favorite" jadi bisa di-like dan ikut menampilkan jumlah terjual

**Scope:** feat - permintaan Steven (12-10-2026 15:33), langsung setelah
baris "Favorite" pertama kali dikirim

Steven: "di favorite buat ada jumlah terjualnya berapa juga sama kyk
menu, dan kalau bisa, bisa like juga disana".

Dua perubahan, keduanya di `AppHome.tsx` pada `FavoriteShowcase`:

- `readOnlySocial` DIHAPUS. Hati di pojok kartu sekarang `<button>`
  dengan `aria-pressed`, sama seperti di section "Menu". Section
  "Menu Baru" tetap `readOnlySocial`.
- `showSold={false}` -> `showSold` + `soldCount={soldCounts[f.id] ?? 0}`,
  dengan angka dari hook `useSoldCounts()` yang sama persis dipakai
  `MenuBrowser`. Jadi satu rasa tidak punya dua angka terjual berbeda
  di dua tempat, dan angkanya tetap berasal dari RPC publik
  (`public_flavor_sold_counts`) - tidak pernah dikarang.

Kenapa satu produk yang sama bisa di-like dari dua tempat tanpa bentrok:
semua kartu membaca store modul-level `useFlavorLikes`. Snapshot-nya
di-cache pada tingkat modul dan `useSyncExternalStore` menyinkronkan
semuanya sekaligus. Menekan hati di "Favorite" langsung mengubah
hati kartu yang sama di "Menu". Persis yang diminta Steven - satu
produk, satu status suka.

Catatan penting untuk pengujian: `/api/flavor-like` menulis ke tabel
`flavor_likes` di database produksi. Verifikasi headless TIDAK boleh
mengklik hati. Yang diperiksa hanya strukturnya: elemennya `<button>`
dengan `aria-pressed`. Diperkuat juga dengan pesan di
`useFlavorLikes.ts` supaya sesi berikutnya tidak salah klik.

Komentar lama yang menyatakan "section Menu = satu-satunya tempat like
di beranda" di `FlavorCard.tsx` (3 tempat) dan `useFlavorLikes.ts`
sudah ditulis ulang karena aturannya memang berubah.

`test-pages`: 2 cek baru (total 27). Keduanya mengisolasi HTML section
"Favorite" dulu - ambil substring dari `>Favorite<` sampai
`</section>` terdekat - supaya tidak ikut tertaut dengan section
"Menu" yang juga memuat kata "terjual" dan tombol like.

Verifikasi lokal: `tsc` 0 error, `lint` 0 error, `build` sukses,
`test-pages` 27/27, headless 3 kartu dengan `hatiTombol: true` dan
baris sosial `"1 | 0 terjual"`, 0 request `/api/flavor-like`,
0 exception.

---

## 2026-10-12 - Baris "Favorite" dikembalikan di bawah Bundle; badge bintang dihapus dari kartu

**Scope:** feat - permintaan Steven (12-10-2026 15:15)

Steven: (1) "saya mau kembalikan fitur yang baris popular di bawah
bundle", (2) "Yang logo favorite, itu tidak perlu lagi, jadi nanti ada
baris tersendiri yang dibawah bundle yaitu Favorite/best seller".

Saat ditanya, Steven mengonfirmasi sumber baris itu: **produk yang
ditandai "Favorite"** - toggle yang sudah ada di Admin > Menu, bukan
pemilih baru.

**Yang berubah:**

- `AppHome.tsx` - komponen `FavoriteShowcase` baru, dirender
  **setelah** `BundleShowcase`. Isinya
  `allFlavors.filter(f => f.is_featured)`. Grid 3 kolom
  `gap-2.5 / sm:gap-3`, kartu `FlavorCard` mode `dense` dengan
  `readOnlySocial` dan `showSold={false}` - sama persis dengan section
  "Menu Baru" di atasnya. Kalau tidak ada produk yang ditandai, section
  disembunyikan total (bukan menampilkan judul kosong).
- `FlavorCard.tsx` - **default `showBadge` berubah dari `true` jadi
  `false`**. Badge bintang "Favorite" tidak lagi muncul di foto produk.
  Penting: kartu BESAR (non-dense) sebelumnya membaca `flavor.is_featured`
  langsung dan **tidak pernah memakai `showBadge`** - kalau hanya yang
  dense yang diubah, badge masih nempel di kartu besar. Keduanya sekarang
  hormat ke `showBadge`.
  Propsi `showBadge` sengaja **tidak dihapus**, karena section "Menu Baru"
  memakai jalur `badgeLabel` dan masih butuh badge "New".
- `page.tsx` plus komentar menua di `FlavorCard.tsx` dan
  `MenuBrowser.tsx` yang menyebut section "Populer" atau badge
  "Favorite" di kartu - semuanya ditulis ulang supaya tidak lagi
  menyatakan hal yang sudah tidak benar.
- i18n (ID & EN, harus sinkron) - kunci baru
  `home.favoriteSection: "Favorite"`. `admin.menu.featuredHint` ditulis
  ulang karena sekarang menjelaskan bahwa produk masuk ke **baris**
  "Favorite" di beranda, bukan ke badge di foto.
- `scripts/test-pages.mjs` - 3 cek baru menggantikan 4 cek lama:
  beranda punya section "Favorite", kata "Favorite" muncul **maksimal
  sekali** (hanya judul section; kalau badge masih ada, tiap kartu
  menambah satu kemunculan), dan "Paket Hemat" tetap ada.

**Yang sengaja tidak diubah:** kolom `popular_flavor_ids` di DB. Baris ini
sumbernya `is_featured`, bukan kolom itu, tapi kolom lama dibiarkan
supaya draft admin tetap membawanya apa adanya.

**Verifikasi lokal:** `tsc` 0 error, `lint` 0 error, `build` sukses,
`test-pages` **25/25**, headless 0 exception. Urutan section terukur:
Hero -> "Pilihan Paket Hemat" -> "Favorite" -> "Menu", 0 chip
"Favorite", kata "Favorite" muncul 1x.

---

## 2026-10-12 - Mapbox dihapus total, alamat jadi ketik manual; font serif -> sans-serif

**Scope:** feat/refactor - permintaan Steven (12-10-2026 15:15)

Steven: "Untuk Map saya mau hapus dulu deh kita jangan pakai map dulu
hapus semuanya, untuk deliver to your location nanti mereka harus isi
dengan detail aja pakai ketik" dan "Tulisan jangan pakai Serif,
pakainya san serif".

Artinya peta dibatalkan total (bukan cuma disembunyikan), dan seluruh
tulisan aplikasi pindah dari serif ke sans-serif.

**Mapbox dihapus total:**
- File dihapus: `EnhancedMapPicker.tsx` (pembeli),
  `MapModal.tsx` (pembeli), `InlineMapPicker.tsx` (admin zona).
- `AddressPicker.tsx` ditulis ulang jadi form teks murni: satu `textarea`
  alamat (placeholder "Jalan, nomor, kelurahan, kota") + satu `textarea`
  detail/location note (placeholder "mis. pagar putih, rumah cat biru,
  depan masjid, Gg. Melati No. 12") + kartu konfirmasi alamat dengan
  tombol hapus. Tidak ada modal, tidak ada peta, tidak ada reverse
  geocoding.
- `OrderFlow.tsx`: kartu zona fix (Vihara / UVERS) tidak lagi
  menampilkan lat/lng, dan tombol "pilih di peta" hilang.
- `DeliveryZonesClient.tsx` (admin): blok peta + input `radius_km`
  dihapus. **Penting:** `onSave` tetap mengirim `lat`/`lng`/`radius_km`
  dari draft (baris ~138-140 mengisi dari zone yang ada) supaya RPC
  `admin_upsert_zone` yang memakai `lat = excluded.lat` tidak
  mengosongkan koordinat zona yang sudah tersimpan di DB.
- `globals.css`: `@import "mapbox-gl/dist/mapbox-gl.css"` dan seluruh
  blok CSS Mapbox dihapus.
- `package.json`: `npm uninstall mapbox-gl`.
- `.env.local`: blok Mapbox diganti catatan "DIDAPUS 12-10-2026";
  `NEXT_PUBLIC_MAPBOX_TOKEN` **sudah dihapus** dari Vercel production.
- `.env.example`: blok Mapbox diganti catatan bahwa tidak ada lagi.

**Font serif -> sans-serif tanpa menyentuh 26 file:**
- `globals.css`: `--font-display` diarah ke
  `var(--font-jakarta), ui-sans-serif, ...`. Karena ada 54 pemakaian
  utility class `font-display` di 26 file, semua ikut berubah tanpa
  edit per-file. Nama class `font-display` sengaja **dipertahankan**
  (dipakai theme/density, bukan penanda serif).
- `layout.tsx`: import + `const playfair` dihapus, `<html>` sekarang
  hanya `className={jakarta.variable}`. Playfair tidak lagi diunduh
  sama sekali (hemat request font).
- Komentar di `FlavorCard.tsx` yang menyebut Playfair diperbarui.

**Yang sengaja TIDAK diubah:**
- Kolom `lat`/`lng` di tabel `orders` tetap ada, dan `CartDraft`
  masih punya field tersebut - hanya tidak diisi dari UI. Tidak perlu
  migration.
- `requires_address` tetap dipakai: itu yang menentukan pembeli harus
  mengetik alamat manual atau cukup datang ke zona fix.

**Verifikasi lokal** (`npm run start` port 3000 + headless Edge):
font body/heading/`font-display` semuanya resolve ke
`"Plus Jakarta Sans", ..., sans-serif`; `adaCanvasMapbox: false`,
`adaTombolPeta: false`, 0 request ke `api.mapbox.com`; 2 textarea
dengan placeholder yang benar; `tsc` exit 0, `npm run lint` 0
problem, `npm run build` sukses. Tidak ada data produksi yang diubah
(verifikasi hanya membuka form lalu menutup dengan "Batal").

Catatan: `adaSerif: true` di skrip scan itu **false positive** -
regex-nya mencocokkan kata "serif" di dalam "sans-serif".

**Verifikasi produksi** (`japanese-sando-6q6bwmufm-ooraa64`, alias
`japanese-sando.vercel.app`):
- Font `body` / `h1` / elemen ber-`font-display` / `textarea` semuanya
  resolve ke `"Plus Jakarta Sans"`. Tidak ada Playfair/Georgia/Times.
- HTML hasil server untuk `/`, `/order`, `/admin/pickup-delivery` **tidak
  mengandung** string `mapbox`, `api.mapbox`, maupun `pk.eyJ` - token
  tidak bocor ke bundle.
- Flow address: 2 textarea dengan placeholder benar, **0 request** ke
  `api.mapbox.com`, tidak ada `.mapboxgl-canvas`/`.mapboxgl-ctrl`,
  tidak ada angka koordinat, 0 exception.
- Admin `/admin/pickup-delivery`: heading "Catatan Pengambilan &
  Pengiriman" sans-serif, 0 peta, 0 exception.
- `admin_list_zones` =&gt; koordinat zona di DB **utuh** (nilai
  `-6.917 / 107.6-107.7` masih ada, tidak jadi NULL).
- `scripts/test-pages.mjs` terhadap domain produksi: **26/26 lulus**.
- Tidak ada data produksi diubah - verifikasi hanya membuka form dan
  menutupnya, tidak ada order yang dikirim.

Cara cek form yang ada di bawah fold: `scrollIntoView` **tidak**
menggeser halaman kalau container-nya punya `overflow` sendiri -
pakai `Input.dispatchMouseEvent` `mouseWheel`. Screenshot yang diambil
sebelum scroll hanya memperlihatkan step atas, padahal elemennya
sudah ada di DOM.

---

## 2026-10-12 - Angka koordinat dihapus dari peta; kegagalan peta jadi terlihat

**Scope:** fix - dua laporan Steven dari screenshot (12-10-2026 13:52)

Steven: (1) "Mapnya gada", (2) untuk angka `1.13777, 104.03088` "itu dihapus,
saya gamau pakai angka, saya mau nama jalannya aja".

**Koordinat dihapus dari dua tempat:**
- `EnhancedMapPicker.tsx`: baris "koordinat + label" diganti jadi satu baris
  **nama jalan saja** (ikon pin + `reverseLabel` dari reverse geocoding). Kalau
  masih memuat, muncul teks "Geser peta atau ketik nama jalan di atas."
- `AddressPicker.tsx`: baris `<p>` berisi `lat.toFixed(5), lng.toFixed(5)` di
  bawah chip alamat dihapus; chip jadi satu blok tanpa sub-baris.
- Koordinat **tetap** diambil dan dikirim ke `create_order` - yang hilang hanya
  tampilannya.

**Peta kosong: diverifikasi ulang dan ternyata TIDAK rusak di sisi server.**
Canvas WebGL terbentuk (348x300 CSS), `isContextLost()` false, style + font +
**tile vektor 200**, 0 console error, 0 request gagal. Isi canvas di-sample dan
mengandung **122 warna unik** - peta benar-benar ter-render.

Penyebab "kotak kosong" yang terlihat di screenshot adalah headless/lingkungan
yang tidak meng-composite layer WebGL (`Page.captureScreenshot` headless tidak
menangkap WebGL sama sekali, meski `preserveDrawingBuffer` sudah on).

Tapi kegagalannya tadinya **tidak terlihat sama sekali** - tidak ada umpan balik
jika peta gagal, dan pembeli akan mengira fiturnya rusak. Karena itu:

- `m.on("error", ...)` sekarang menangkap error Mapbox (error kecil soal
  sprite/glyph/abort didiamkan saja karena tidak merusak peta).
- Watchdog 12 detik: kalau `!map.loaded()`, tampilkan overlay
  **"Peta belum tampil"** + alasannya. Kolom alamat tetap bisa diketik manual,
  jadi overlay ini informasi, bukan blokir.
- `preserveDrawingBuffer: true` ditambahkan ke konfigurasi Map.

Verifikasi lokal: `koordinatTampil: []` (tidak ada angka di layar),
`adaNamaJalan: true` ("Merdeka, 40113, Sumur Bandung, Bandung, Jawa Barat..."),
`adaOverlayGagal: false`, canvas 122 warna unik, 0 error. `tsc` bersih,
lint 0 error, `test-pages.mjs` 26/26 lulus.

**Tambahan (Steven: "masih belum tampil" setelah hard refresh):** ditambahkan
deteksi "peta sudah termuat tapi tidak bisa digambar". Ini kondisi ketiga yang
belum tertangkap: `m.loaded()` = true, semua request 200, tapi canvas tetap
tidak menampilkan apa pun karena browser/perangkat tidak meng-composite layer
WebGL. Sebelum ini tidak ada error, jadi tidak ada apa pun yang kelihatan.

`scheduleBlankCheck()` menyalin canvas ke canvas 2D berukuran 64x64 lalu
menghitung jumlah warna unik. Peta sungguhan selalu berisi puluhan warna;
kalau cuma 1-3 warna berarti isinya rata. Baru kemudian overlay
"Peta belum tampil" muncul dengan saran konkret. Setter error disimpan di
`WeakMap<mapboxgl.Map, setter>` supaya fungsi modul bisa menjangkau instance
map tanpa jadi props/state tambahan.

Syaratnya `preserveDrawingBuffer: true` - tanpa itu buffer WebGL dibuang tiap
frame dan tidak bisa dibaca.

Verifikasi: di lingkungan yang normal, sample 64x64 menghasilkan **841 warna
unik** dan overlay **tidak** muncul (tidak salah-positive). `koordinatTampil:
[]`, `adaNamaJalan: true`, 0 exception.

---

## 2026-10-12 - Midtrans: cek akun production, hasil belum aktif (tetap sandbox)

**Scope:** docs/investigasi — Steven minta lanjut ke production karena
business registration (Step 2) sudah selesai. Diperiksa langsung, production
**belum bisa dipakai**.

**Temuan utama:**
- Klien sudah menyelesaikan Step 2 (business registration) di dashboard Midtrans.
  Tapi Step 3 (business review) / Step 4 (Result) belum selesai.
- Probe langsung ke API Midtrans (GET status, order_id dummy, tanpa charge):
  - `api.sandbox.midtrans.com` -> **HTTP 200** `404 Transaction doesn't exist`
    (auth LOLOS — key valid, order memang tidak ada)
  - `api.midtrans.com` -> **HTTP 401** `Unknown Merchant server_key/id`
  - Artinya merchant **belum terdaftar/aktif di environment production**.
- Penting: prefix key `Mid-server-P-...` (format production) TIDAK menjamin
  akun production aktif. Yang menentukan adalah host mana yang menerima key itu.

**Keputusan:** `.env.local` **tetap** `MIDTRANS_IS_PRODUCTION=false`. Flipping ke
`true` sekarang akan bikin `/order` menampilkan opsi QRIS tapi charge selalu 401.

**Verifikasi (semua read-only, tidak ada transaksi/charge dibuat):**
- Kolom `orders.qris_*` (5 kolom) + RPC `set_order_qris_charge`,
  `set_order_qris_status`, `public_order_qris_status` -> sudah ada di DB
  produksi. Migration-18 sudah applied.
- Webhook live `GET https://japanese-sando.vercel.app/api/midtrans/webhook`
  -> **200** `{"ok":true,"endpoint":"midtrans-webhook","accept":"POST"}`.
- Signature webhook `verifyWebhookSignatureAsync` memakai
  `MIDTRANS_SERVER_KEY` — jadi saat nanti ganti ke production key, env di
  **Vercel Production** harus di-update bersamaan dengan `.env.local`,
  kalau tidak webhook akan 403 `invalid_signature` dan status tidak pernah
  sinkron.

**Belum dilakukan (perlu keputusan Steven):** set 3 env var di Vercel
Production + update Payment Notification URL. Tidak dikerjakan karena
production key belum valid — men-set sekarang hanya menambah env yang mati.

**File yang berubah:**
- `.env.local` — hanya komentar blok Midtrans (pentingnya kunci production
  dinota). Nilai env tidak berubah, `MIDTRANS_IS_PRODUCTION` tetap `false`.

---

## 2026-10-12 - Mapbox diaktifkan (token dipasang, peta jadi jalan)

**Scope:** feature - menghidupkan fitur peta yang kodenya sudah ada sejak lama

Peta sudah terpasang lengkap sejak awal (dependency `mapbox-gl`, CSS brand di
`globals.css`, `EnhancedMapPicker` untuk pembeli, `InlineMapPicker` untuk admin,
`MapModal` + `AddressPicker` untuk flow pemesanan). Yang belum ada cuma
`NEXT_PUBLIC_MAPBOX_TOKEN`, sehingga kedua picker menampilkan panel merah
"Mapbox token belum disetel" dan peta tidak pernah tampil.

- Token publik (`pk.…`, akun trial tanpa kartu kredit) dipasang ke `.env.local`
  dan ke Vercel **Production** sebagai `type: config`.
- `.env.example` diberi blok Mapbox: apa akibatnya kalau token kosong, bahwa
  token ini publik, dan bahwa `NEXT_PUBLIC_*` harus **build ulang** (restart
  saja tidak cukup karena di-inline saat build).
- Tidak ada perubahan kode aplikasi pada iterasi ini.

Verifikasi:
- Token diuji langsung ke API Mapbox: geocoding 200, style 200, sprite 200,
  **tile vektor 200 (199 KB protobuf)**, raster tile 200 → cakupan public scope
  lengkap, termasuk `tiles:read`.
- Peta admin (`/admin/pickup-delivery`, inline di form zona): canvas 470×300,
  request Mapbox semua 200, tanpa panel token kosong, ditutup dengan "Batal".
- Peta pembeli (`/order` → Pembayaran → Diantar → zona "Antar ke alamatmu" →
  "Cari alamat di peta"): canvas 348×300, reverse-geocode berhasil
  ("Merdeka, 40113, Sumur Bandung"), 0 exception.
- `tsc` bersih, `test-pages.mjs` 26/26 lulus.

**Bug yang ketemu saat verifikasi produksi (pertama):** cara pertama memasang
token ke Vercel (`"pk...." | npx vercel env add ...`) menghasilkan **401** dari
Mapbox di domain produksi, padahal tokennya benar di `.env.local` dan lokal
jalan. Sebabnya PowerShell menambah newline ke stdin, dan Vercel menyimpannya
apa adanya — jadi nilai yang ter-inline `"pk...\n"`. Diperbaiki dengan
`vercel env rm` lalu `vercel env add ... --value "<nilai>"`, lalu deploy ulang.
Setelah itu: request tile vektor asli
(`/v4/mapbox.mapbox-streets-v8,...`) **200**, style 200, font 200, tanpa 401.

**Catatan:** area peta tetap kosong di screenshot headless karena Mapbox GL JS
memang butuh compositor untuk menjalankan render loop. Di produksi headless
tile-nya sudah terunduh 200 (jadi permintaannya benar), hanya catnya yang tidak
ter-composite. Yang terbukti: canvas + WebGL 2.0 terbentuk, style/font terunduh,
geocoding jalan, tile vektor 200.

---

## 2026-10-12 - Label badge "Signature" balik jadi "Favorite", badge diperbesar sedikit

**Scope:** fix - koreksi label + ukuran, dengan screenshot

Steven melihat hasilDeploy sebelumnya dan minta dua hal: labelnya balik
**"Favorite"** (bukan "Signature"), dan badge-nya **diperbesar dikit aja**.

- i18n (ID & EN): `t.menu.signature` dan `t.admin.menu.favorite` nilainya
  dikembalikan ke `"Favorite"`. `t.menu.featured` (EN) juga disamakan dari
  `"Signature"` ke `"Favorite"` supaya tidak ada sisa kata itu di kamus.
  `featuredHint` ditulis ulang menyesuaikan ("Tandai sebagai Favorite...").
  Semua kunci `signature`/`favorite` tetap ada - hanya **nilai** yang berubah,
  karena serialisasi i18n menuntut kunci `id.ts` dan `en.ts` cocok persis.
- Badge di foto kartu dense (`FlavorCard.tsx`): `text-[9px]` -> `text-[10px]`,
  ikon `size-2.5` -> `size-3`, `py-0.5` -> `py-[3px]`, `px-1.5` (dipertahankan),
  `gap-0.5` (dipertahankan).
- Komentar di `FlavorCard`, `AppHome`, `page.tsx`, `MenuClient` disesuaikan.
- `scripts/test-pages.mjs`: cek "badge Favorite tampil" + cek baru "tidak ada
  label lama Signature" (total 26 cek).
- Warning lint `Flavor` tidak terpakai di `SettingsClient.tsx` (sisa dari
  penghapusan prop `flavors` di iterasi sebelumnya) ikut dibersihkan -
  sekarang `npm run lint` 0 problem, bukan 0 error + 1 warning.

**Penting soal ukuran:** versi pertama (`px-2 gap-1`) justru membuat badge
terpotong jadi "Favo...". Baris foto kartu 3 kolom hanya ~111px; hati
(`size-7`) memakan 28px + `gap-1` 4px, jadi sisa untuk badge cuma ~79px.
Butuh lebar badge = teks + ikon + gap + padding horizontal: 39.9 + 12 + 2 + 12
= ~66px. Karena itu padding harus tetap `px-1.5` dan gap `gap-0.5` - teks
10px harus tetap muat utuh.

Verifikasi: `tsc` bersih, lint 0 problem, build sukses, `test-pages.mjs`
26/26 lulus. Headless lokal: badge 66×18px, `teksScroll == teksClient` (tidak
terpotong), 6 badge di DOM, 0 teks "Signature", 0 exception. Admin form "Ubah
rasa" terbaca `["Tampil di website", "Favorite", "New"]` dan ditutup dengan
"Batal" - tidak ada data produksi yang diubah.

---

## 2026-10-12 - Section "Populer" beranda dihapus, badge "Signature" di halaman Menu

**Scope:** feature - dua permintaan Steven sekaligus (dengan screenshot)

Steven minta dua hal: (1) cancel baris "Popular" di beranda, (2) pindahkan
penandaan produk ke halaman Menu dengan gaya **badge bintang "Signature"** di
foto produk, dan bisa diset admin penjualan.

- `src/components/customer/AppHome.tsx`: komponen `PopularGrid`, `PopularCard`,
  helper `pickByIds`, prop `popularIds`, dan import `useSoldCounts` **dihapus**.
  Komposisi beranda sekarang `HomeGreeting -> HeroBanner -> NewShowcase ->
  BundleShowcase`. Section "Menu" di beranda tetap read-only dan jadi satu-
  satunya tempat likes, seperti sebelumnya.
- `src/app/page.tsx`: prop `popularIds` dihapus, import `normalizeFlavorIds`
  ikut dibuang.
- `src/components/admin/SettingsClient.tsx`: pemilih produk "Populer" (dan
  komponen `HomePickField` yang hanya untuk itu) dihapus dari tab "Beranda".
  Kolom DB `store_settings.popular_flavor_ids` **tidak di-drop**, dan draft
  pengaturan tetap membawanya apa adanya supaya tidak ikut terkosongkan kalau
  admin menyimpan. Prop `flavors` juga dibuang dari `SettingsClient`.
- `src/app/admin/(dashboard)/settings/page.tsx`: `getActiveFlavors` tidak lagi
  dipanggil.
- Label admin untuk `flavors.is_featured` diubah **"Favorite" -> "Signature"**
  (ID & EN) supaya kata yang dilihat penjual sama persis dengan yang dilihat
  pembeli. Hint `featuredHint` diperjelas: badge bintang muncul di foto produk
  di halaman Menu.
- Badge-nya sudah ada sebelumnya di kartu menu; yang diset lewat toggle
  "Signature" di form rasa (`MenuClient`).

**Bug fix (penting):** `toggleFlavorActive` dan `toggleFlavorFeatured` di
`MenuClient.tsx` sekarang mengirim `is_new: f.is_new`. Sebelumnya payload tidak
menyertakan kunci itu, sedangkan `admin_save_flavor` memakai
`coalesce((payload->>'is_new')::boolean, false)` - jadi menyalakan/mematikan
"Tampilkan di website" atau "Signature" **diam-diam menghapus label "New"** dari
produk itu. Bug ini sudah aktif sejak sebelum permintaan ini.

Verifikasi: `tsc` bersih, lint 0 error, build sukses, `test-pages.mjs` 25/25
lulus (4 cek baru: beranda tidak boleh punya teks "Populer", badge "Signature"
harus tampil di kartu menu). Headless lokal 0 console error — beranda tanpa
"Populer", halaman Menu punya 3 badge Signature (Choco Matcha, Creme Brulee,
Strawberry Cheese dari data `is_featured` yang sudah ada), form admin punya
toggle "Signature" dan "New", tab Beranda admin tidak punya pemilih Populer.
Produksi tidak diubah: verifikasi admin selalu ditutup dengan "Batal".

---

## 2026-10-12 - "Orderan" buka halaman lacak pesanan; "Riwayat" jadi tab di atas halaman

**Scope:** fix - koreksi ketiga, dengan screenshot halaman "Aktivitas" GoFood

Maksud Steven sekarang jelas: satu tab "Orderan" di bottom nav yang ketika
ditekan langsung membuka halaman lacak pesanan, dan **di halaman itu** ada bar
tab untuk pilih Cek Pesanan atau Riwayat - seperti bar "Riwayat / Dalam Proses
/ Terjadwal / Draf" di GoFood.

- Komponen baru `src/components/customer/OrderHubTabs.tsx`: deretan label
  di atas konten, tab aktif tebal + garis bawah honey, `aria-current="page"`,
  `sticky top-0`.
- Bar dirender oleh `/track` dan `/riwayat`, jadi dari mana pun pembeli masuk
  (termasuk tautan "Lihat pesanan" di halaman sukses) dia bisa pindah tab
  tanpa lewat bottom nav.
- `MobileBottomNav` disederhanakan total: "Orderan" kembali jadi `<a href="/track">`,
  nav hanya satu bar lagi (spacer 68px), dan **tidak ada state sama sekali**.
  State `hubAt` dan `<button aria-expanded>` dihapus.
- Tab "Orderan" aktif di `/track` **dan** `/riwayat`.
- `HistoryBack` (link "Kembali ke beranda") dihapus dari `/riwayat`; bottom nav
  sudah punya tombol Beranda.

Verifikasi headless: beranda -> tap Orderan mendarat di `/track` dengan tab bar
di y=81 dan "Cek Pesanan" aktif; tap "Riwayat" -> `/riwayat` dengan tab itu
aktif; tap balik -> `/track`. `<nav>` bottom sekarang punya 1 anak saja
(`ul`). 0 console error, tsc bersih, lint 0 error, build sukses, test-pages
21/21.

---

## 2026-10-12 - Bar Cek Pesanan + Riwayat jadi muncul SETELAH tab "Orderan" ditekan

**Scope:** fix - koreksi kedua atas bar pesanan

Steven koreksi lagi: bar `Cek Pesanan` + `Riwayat` jangan selalu terlihat.
Bottom nav jadi `Beranda | Orderan | Profil`, dan bar kedua **muncul hanya
setelah tab "Orderan" ditekan**.

- Tab tengah berubah dari link ke `/track` jadi `<button>` bernama "Orderan"
  (`t.nav.orderHub`, key baru; `t.nav.orders` yang sudah ada tidak diubah karena
  dipakai tempat lain). Punya `aria-expanded` + `aria-controls`.
- State `hubAt: string | null` menyimpan **pathname** saat tombol ditekan,
  bukan boolean. Bar menutup sendiri begitu halaman berpindah - tanpa
  `useEffect` + `setState` yang kena aturan `react-hooks/set-state-in-effect`,
  dan tanpa bar yang menggantung di halaman lain seperti /faq.
- Spacer bawah ikut berubah: 68px saat tertutup, 114px saat terbuka.
- `items` (array link lama) dan `quickActions` dihapus - sekarang hanya satu
  array `orderPages`.

Verifikasi headless alur nyata: beranda (bar tutup, nav 56px) -> tap Orderan
(bar muncul, nav 107px) -> pilih Riwayat (bar tutup, nav 56px) -> tap Orderan
-> pilih Cek Pesanan (bar tutup). Buka `/track` langsung dari luar juga bar
tutup. 0 console error, tsc bersih, lint 0 error, test-pages 21/21.

---

## 2026-10-12 - Bar Cek Pesanan + Riwayat dipindah ke BAWAH bar tab

**Scope:** fix - koreksi posisi dari permintaan sebelumnya

Steven koreksi: bar quick-action "Cek Pesanan" + "Riwayat" jangan ditaruh di
ATAS bottom nav, tapi setelah / di bawah bagian "Track order" (tab kedua,
kanan Home).

- `MobileBottomNav`: `<ul>` tab sekarang dirender lebih dulu, baru bar
  quick-action di bawahnya (dulu kebalik). Keduanya tetap dalam SATU elemen
  `<nav>`, jadi tidak ada offset `fixed` yang perlu dihitung ulang.
- Spacer bawah tetap 114px (tinggi `<nav>` tidak berubah, hanya urutan isi).
- Verifikasi headless: `<nav>` berisi 2 anak, `ul` (55px) lalu `div` bar (51px),
  `barAtas 756 >= tabBawah 701` - jadi bar benar-benar di bawah. `/riwayat`
  tetap terbuka, 0 console error.

---

## 2026-10-12 - Stok bisa diketik, konfirmasi hapus in-app, bar Cek Pesanan + Riwayat, diskon ongkir bertingkat, FAQ dari admin, kartu beranda seragam

**Scope:** feat + fix - enam permintaan Steven dengan screenshot (stok, menu nyangkut, bar bawah, zona ongkir, halaman FAQ, ukuran kartu)
**Migrasi:** `supabase/migration-46.sql` (sudah diterapkan)

### 1. Field stok di admin bisa DIKETIK (bukan hanya -/+)

Header kategori di `/admin/menu` tadinya hanya punya tombol -1 / +1 / +10, jadi
set stok jadi 250 harus menekan tombol hundreds kali atau membuka form kategori
terpisah. Sekarang angka stok jadi `<input>` biasa (`QuickStockInput`):

- mengetik hanya mengubah teks di layar, TIDAK menyentuh database;
- `Enter` atau blur = commit sekali (bukan tiap ketikan, supaya mengetik "250"
  tidak menulis 2 -> 25 -> 250);
- `Escape` = batal, kembali ke nilai terakhir;
- angka non-digit dibuang, nilai dikunci `>= 0`.

Fungsi `changeCategoryStock` (+/-) sekarang berbagi helper yang sama dengan
versi absolut, lewat prop baru `setCategoryStockTo` di `FlavorList`.

### 2. Hapus tanpa jejak: `window.confirm` diganti dialog in-app

Keluhan Steven "menu sudah dihapus tapi masih tampil di web". Setelah menelusuri
database, penyebabnya bukan backend: `MenuClient` memakai `window.confirm()`
untuk konfirmasi hapus. Dialog itu bisa ditutup (Esc / Cancel) tanpa umpan
balik apa pun di aplikasi, jadi PENJUAL bisa mengira hapus sudah jalan padahal
tidak ada RPC yang dipanggil sama sekali.

- Komponen baru `src/components/ui/ConfirmDialog.tsx`.
- `MenuClient` (kategori, rasa, bundle) dan `DeliveryZonesClient` sekarang
  menyimpan target hapus di state `pendingDelete` lalu memanggil `removeX()`
  dari tombol "Hapus" pada dialognya.
- Efeknya membatalkan jadi tidak mungkin disalahartikan.

Catatan data: rasa "Mala" (id 441) sudah TIDAK ADA di database - sudah dihapus
sebelum iterasi ini, dan produksi (`https://japanese-sando.vercel.app`) sudah
terverifikasi tidak menampilkannya lagi (5 rasa, `is_new` kosong).

### 3. Bar cepat di atas bottom nav: Cek Pesanan + Riwayat

- `MobileBottomNav` sekarang dua lapis dalam SATU elemen `<nav>`: bar quick
  action ("Cek Pesanan" -> /track, "Riwayat" -> /riwayat) lalu bar tab. Spacer
  bawah naik dari 68px ke 114px.
- Halaman baru `/riwayat` (`src/app/riwayat/page.tsx` +
  `HistoryList.tsx`). Isinya dibaca dari `localStorage` perangkat, bukan
  database - sesuai permintaan "beda HP beda history".
- `pushOrderHistory` dipanggil dari `SuccessClient` begitu invoice termuat, jadi
  pesanan otomatis masuk riwayat tanpa aksi pembeli.
- Pembacaan pakai `useSyncExternalStore` dengan snapshot stabil
  (`getOrderHistorySnapshot` / `subscribeOrderHistory` di `src/lib/utils.ts`),
  bukan `useState` + `useEffect` - React menandai `setState` sinkron di dalam
  effect sebagai pola yang memicu render berlapis.

### 4. Diskon ongkir bertingkat per zona

- Kolom baru `delivery_zones.shipping_discounts jsonb` bentuk
  `[{ "min": 50000, "percent": 50 }, ...]`, per zona (bukan global).
- Form zona di `/admin/pickup-delivery` dapat blok "Potongan ongkir" tepat di
  bawah field "Ongkir (Rp)": tambah/hapus tingkat, minimal belanja + persen.
  Titik pengambilan tidak punya blok ini (ongkirnya 0).
- `create_order` menerapkan aturan dengan `min` TERTINGGI yang terlampaui
  subtotal (potongan tidak menumpuk), `100%` = gratis ongkir.
- `resolveShipping()` di `src/lib/utils.ts` menghitung angka yang sama di sisi
  pembeli, jadi yang tampil di ringkasan order = yang ditagih. Bar "Potongan
  ongkir" muncul di bawah "Ongkos kirim", plus petunjuk "belanja Rp x lagi".

BUG YANG IKUT TERPERBAIKI: `create_order` selama ini membaca ongkir dari jsonb
lama `store_settings.delivery_zones` (vihara/uvers = Rp10.000, zona `antar` =
Rp0 alias gratis), sementara frontend memakai tabel `delivery_zones` (fee
Rp5.000). Akibatnya pembeli melihat Rp5.000 tapi backend menagih Rp10.000, dan
zona "antar" gratis ongkir. Sekarang fee dibaca dari TABEL.

### 5. FAQ bisa diedit dari admin

- Tabel baru `faq_items` + RLS + trigger `faq_items_touch`, diisi 6 pertanyaan
  lama (seed dibungkus `do $$ ... if not exists ... $$` supaya idempoten).
- RPC baru: `public_faq()`, `admin_list_faq()`, `admin_save_faq(jsonb)`,
  `admin_delete_faq(bigint)`.
- Halaman admin baru `/admin/faq` (sidebar, di antara "Menu Profil" dan
  "Pengaturan") + `FaqClient.tsx`: tambah, ubah, sembunyikan, hapus.
- `/faq` dan section FAQ di `/contact` sekarang baca `getFaq()` dari database,
  jadi keduanya tidak pernah berbeda isi. `src/lib/faq.ts` berubah jadi isi
  cadangan (dipakai kalau RPC gagal) plus `normalizeFaq()`.

### 6. Ukuran kartu New / Bundle / Popular diseragamkan

"Menu Baru" tadinya baris mendatar yang bisa di-scroll (`w-36 sm:w-40`), Bundle
punya kartu besar sendiri (`aspect-[5/3]`, `PriceTag size="lg"`), sementara
"Populer" sudah grid 3 kolom. Ketiganya sekarang satu pola: `grid grid-cols-3
gap-2.5 sm:gap-3`, foto persegi, nama 1 baris, `PriceTag size="sm"`.
`BundleShowcase` ditulis ulang tanpa varian `wide` (tidak ada pemakainya lagi).

### Verifikasi

- `npx tsc --noEmit` bersih, `npm run lint` 0 error, `npm run build` sukses
  (route baru `/admin/faq` dan `/riwayat` muncul di daftar).
- `scripts/test-pages.mjs` 21/21 lulus (dinaikkan dari 17, ditambah 4 cek baru:
  `/admin/faq`, `/faq`, `/riwayat`, `/contact`).
- Headless Edge lokal: 6 pemeriksaan lolos, 0 console error. Semua form admin
  dibuka lalu dibatalkan (BATAL / dialog ditutup) - tidak ada yang menekan
  Simpan, jadi tidak ada data produksi yang tersentuh.
- Uji tulis ke database (tidak lewat UI): `admin_save_faq` tambah -> ubah ->
  `admin_delete_faq` (sisa 0 bar, total kembali 6). Bar uji dibuat dengan
  `is_active: false` supaya tidak pernah tayang di halaman publik.
- Aturan diskon diuji read-only: 49.999 -> 0%, 50.000 -> 50% (Rp5.000 jadi
  Rp2.500), 150.000 -> 100% (gratis).
- Produksi terverifikasi: beranda tidak menampilkan "Mala".

---

---

---

---

## 2026-10-12 — Isi bundle bebas, label "New" per rasa, halaman nyata /faq, switch bahasa, back + tanpa cart di identitas

**Scope:** feat — enam permintaan Steven dengan screenshot (bundle, menu admin, profil, header, pre-order back, pre-order identitas)

### 1. Bundle tidak lagi terkunci ke kategori — PENJUAL yang menentukan isi

Selama ini satu-satunya pembatas isi bundle adalah `bundles.category_id`: kalau
tidak NULL, pembeli hanya boleh memilih rasa dari kategori itu (harus "Sando
Sandwich"). Sekarang itertools:

- **Tabel baru `bundle_flavors`** (`bundle_id`, `flavor_id`) — daftar rasa per
  bundle. RLS + policy baca publik, tulis admin.
- Form "New bundle" **menghapus** `<select>` kategori dan menggantinya dengan
  pemilih rasa: chip per kategori, tombol "Pilih semua" / "Kosongkan".
- `admin_save_bundle` menerima `flavor_ids` (jsonb array) lalu delete+insert
  `bundle_flavors`.
- `public_menu` & `admin_list_bundles` mengirim `flavor_ids` per bundle.
- `OrderBundleModal.allowedFlavors`: daftar terisi → hanya rasa itu; kosong →
  semua rasa. Bundle tidak terkunci kategori mana pun.
- `bundles.category_id` sengaja **tidak dihapus** (data), tapi form tidak lagi
  mengirimnya, jadi nilainya jadi NULL saat bundle disimpan ulang.

**Validasi backend (`create_order`) diredefinisi** — slot bundle yang rasa
nya di luar daftar penjual DITOLAK `flavor_unavailable`. Daftar kosong →
semua rasa lolos (bundle berdiri sendiri). Diuji dalam transaksi lalu rollback:
slot dari daftar = LOLOS, slot di luar daftar = DITOLAK.

**Penting (gotcha #60 again):** definisi `create_order` diambil **VERBATIM
dari versi live** lewat `pg_get_functiondef`, bukan dari migration-44. Semua
fungsi lain di migration-45 juga disalin dari definisi live. `pg_get_functiondef`
**tidak menutup statement dengan titik koma** — tiap definisi harus diakhiri
`;` sendiri, kalau tidak SQL-nya gagal dengan `syntax error at or near "CREATE"`.

### 2. Toggle "New" di form flavor

- Kolom baru `flavors.is_new boolean not null default false`.
- `admin_save_flavor` memakai pola aman: `case when p_payload ? 'is_new' ... else is_new end`,
  jadi toggle cepat dari daftar (yang tidak mengirim `is_new`) **tidak** mereset
  flag yang sudah menyala.
- Toggle "New" duduk **tepat di bawah "Favorite"** di form "New flavor", plus
  badge "New" di baris daftar produk.
- Section "Menu Baru" di beranda sekarang dibaca dari `flavors.is_new`
  (`allFlavors.filter(f => f.is_new)`, maks 6). Tetap **di atas Paket Hemat**.
- Pemilih "Menu Baru" di Dashboard → Tampilan beranda **dihapus** (data
  `store_settings.new_flavor_ids` dibiarkan). Satu sumber kebenaran: kalau dua
  tempat bisa menandai "New", pasti bisa tidak sinkron.

### 3. Bar menu Profil membuka halaman nyata

- Kolom baru `profile_menu_items.href text`. NULL = popup seperti lama; terisi
  (mis. `/faq`) = bar jadi `<Link>` dan sheet langsung tertutup.
- `admin_save_profile_menu_item` menormalisasi `href`: harus diawali `/` atau
  `http(s)`, maksimal 200 karakter, nilai lain diabaikan.
- **Halaman baru `/faq`** — akordeon + kotak pencarian (gaya referensi Steven).
  Isi dipindah ke `src/lib/faq.ts` supaya `/contact` dan `/faq` tidak pernah
  berbeda isi. `/contact` sekarang juga punya link ke halaman penuh.
- Nilai default diisi lewat migrasi: `faq` → `/faq`, `contact` → `/contact`.
  Bar `hours` & `terms` tetap popup (isi-nya memang teks pendek, bukan halaman).
- Field baru "Link halaman (opsional)" di form admin Menu Profil.

### 4. Switch bahasa di top bar HP

`LanguageToggle` dapat varian baru `mini`: **dua** tombol terpisah ID | EN
(bukan satu tombol yang isinya berganti seperti versi `pill`), memakai
`setLang`. Dipasang persis di sebelah kiri lonceng di top bar HP. Versi
desktop (`pill`) tidak berubah. Header desktop sudah punya switch sejak dulu.

### 5. Tombol back di pre-order

Navigasi mundur ada di **setiap** langkah, bukan cuma payment/review:

- Mobile: tombol panah di kiri pill langkah, `aria-label="Kembali ke <langkah>"`.
- Desktop: langkah yang sudah dilewati (`done`) jadi bisa diklik untuk cek ulang.
- Isi form **tidak hilang** — sudah terverifikasi: nama tetap "Steven" setelah
  naik lalu turun.

### 6. Keranjang disembunyikan di langkah identitas

`showCartPanel = step !== "identity"`. Di langkah identitas grid jadi satu kolom
penuh dan `<aside>` keranjang tidak dirender sama sekali. Alasannya: di langkah
itu keranjang masih kosong dan belum ada apa pun yang bisa ditambah, jadi panel
"0 qty / Rp 0" cuma memenuhi ruang kosong.

### Verifikasi

- `tsc --noEmit` bersih · `eslint` bersih · `npm run build` sukses, `/faq`
  terdaftar di route.
- `scripts/test-pages.mjs` **17/17 lulus**.
- Headless lokal (Edge 430px & 1280px), **0 console error**:
  - header: tombol ID + EN ada, tepi kanan ID di x=334, lonceng mulai x=374
    (switch di sebelah kiri lonceng). Klik EN → `html.lang = "en"`.
  - `/faq`: 6 pertanyaan, kotak cari ada, buka/utup akordeon jalan (1→2→1),
    cari "QRIS" menyaring jadi 2, cari "zzzznada" → 0 + pesan kosong. Versi EN
    terpisah rapi.
  - sheet Profil: bar `/faq` dan `/contact` benar-benar link; klik `/faq`
    → `location.pathname = /faq` dengan `<h1>FAQ`.
  - pre-order identitas: `adaPanelCart: false`, `adaTombolBack: false` (benar,
    ini langkah pertama). Langkah pilih rasa: `adaPanelCart: true`,
    `labelBack: "Kembali ke Data Kamu"`. Klik back → kembali ke identitas,
    `namaTerisi: "Steven"`, cart tetap tersembunyi.
  - admin form flavor: toggle urut `Tampil di website → Favorite → New`.
  - admin form bundle: `#b-category` **tidak ada**, judul "Rasa di dalam
    bundle", 5 chip, "Pilih semua"/"Kosongkan" ada, hint berubah saat dicentang.
  - admin menu profil: `#pm-href` ada, nilainya `/faq`.
- Tidak ada yang disimpan ke database dari pengujian (tidak menekan Save).

**Cara uji `/order` saat pre-order tutup:** `test-pages.mjs` gagal karena
`store_settings.is_preorder_open = false` (data produksi Steven). Buka
sementara, tes, kembalikan. Nama kolomnya `is_preorder_open`, bukan
`preorder_enabled`.

---

## 2026-10-11 — Batas "Maksimal N per rasa" yang palsu dihapus, info like/terjual/stok dikembalikan ke /order

**Scope:** fix+feat: dua keluhan Steven dengan screenshot

1. "Sudah dikatakan jangan ada maximum per rasa" — toast
   "Choco Matcha — Maximum 5 per flavor" masih muncul.
2. "Gambar 2, itu di pre-order belum ada jumlah like, terjual dan sisa stock".

**1. Akar masalahnya bukan batas, tapi PENGECEKAN YANG SALAH**

Steven diberi tahu bahwa batas 10 pcs per rasa di backend sudah dihapus
sebelumnya (migration-44), dan chek-nya memang tidak lagi ada. Tapi toastnya
masih muncul karena kode frontend menghitung:

```js
const next = qty + 1;
if (stockEnabled && left > 0 && next > left) { toast("Maksimal {left} per rasa"); return; }
```

`left` itu **sisa stok kategori setelah SELURUH isi keranjang dikurangi**, bukan
sisa per rasa. Bug-nya di dua arah:

- stok 10, keranjang 5 rasa yang sama → `left = 5`, tambah jadi 6 dicek
  `6 > 5` lalu **ditolak**, padahal 6 dari 10 masih aman. Itulah yang Steven
  lihat sebagai "Maximum 5 per rasa" — padahal tidak ada plafon sama sekali;
- saat `left = 0`, syarat `left > 0` gagal sehingga **guard dilewati
  sepenuhnya** dan pembeli bisa menambahkan melebihi stok.

Yang benar hanya satu pertanyaan: "masih ada sisa?". Jadi keduanya (stepper
kartu etalase + stepper ringkas) sekarang:

```js
if (stockEnabled && left <= 0) {
  toast.warning(name, left === 0 ? t.order.menu.outOfStock
                                : t.order.menu.stockLeft.replace("{n}", String(left)));
  return;
}
cart.add(flavor);
```

Ini juga sesuai dengan yang sudah dilakukan `OrderBundleModal.addOne()`.

**Kalimat toast-nya ikut diganti.** Key `t.order.menu.maxReached`
("Maksimal {n} per rasa" / "Maximum {n} per flavor") **dihapus** dari i18n
karena justru menyuruh — sekarang pakai `stockLeft` ("Sisa {n} pcs untuk semua
rasa") dan `outOfStock`. Satu pemakai lain, `OrderBundleModal` di tombol slot
bundle, sekarang memakai key baru `t.menu.bundleSlotsFull` ("Semua slot sudah
terisi") karena itu memang batas **jumlah slot**, bukan batas per rasa.

**2. Jumlah like, terjual, dan sisa stok dikembalikan di kartu /order**

Varian kartu yang dipakai `/order` adalah mode **`storefront`** — bukan varian
"default". Baris info (like / terjual / stok) yang sudah ada di komponen
ternyata hanya ada di varian **default**, jadi tidak pernah terlihat di
`/order`. Baris itu sekarang ditambahkan ke varian `storefront`, di atas harga
dan di bawah deskripsi:

- **jumlah like** — read-only (`readOnlySocial`), jadi section "Menu" di
  beranda tetap satu-satunya tempat pembeli bisa likes;
- **jumlah terjual** — dari `useSoldCounts` (RPC publik, tidak pernah dikarang);
- **sisa stok** — `Flame` + "Only {n} left", memakai `lowStock`/`inStock`
  yang sudah ada.

Prop `showHeart` yang sempat dibuat di iterasi sebelumnya **dicabut lagi** —
hati pojok foto sekarang tampil kembali, jadi kartu punya hati + tiga angka.

**Verifikasi lokal** (headless, stok kategori 10)

| Aksi | Hasil |
| --- | --- |
| klik "+1" berulang | keranjang **10 Qty** (Rp 180.000) — jauh lewat angka 5 yang dulu muncul |
| stok habis terpakai | semua kartu jadi "Sold out" + tombol "Unavailable" |
| toast batas | tidak ada kalimat "Maximum N per flavor" |

`tsc` bersih · `eslint` bersih · `build` sukses · `test-pages.mjs` **17/17** ·
0 console error.

---

## 2026-10-11 — Voucher dihapus, strip kategori & info like di /order dihapus, batas maksimal pesanan dihapus

**Scope:** feat+fix: empat permintaan Steven dengan tiga screenshot

1. "untuk voucher juga fiturnya dihapus aja dulu"
2. "pre order yang gambar 2 itu dihapus aja" (strip kartu "All" / nama kategori)
3. "gambar 3, sisa stok, jumlah like dan penjualan tidak ditulis" (kartu produk di /order)
4. "Gada maksimal pemilibhan 1 rasa, semua bergantung pada stok"

**1. Fitur Voucher dihapus dari aplikasi** — code, bukan data

Dihapus: item nav `/admin/vouchers` (`AdminShell.tsx`), route
`src/app/admin/(dashboard)/vouchers/`, `VouchersClient.tsx`,
`VouchersSection.tsx`, `getVouchersAction` / `saveVoucherAction` /
`deleteVoucherAction`, `getMyVouchersAction` + pemakaiannya di `/account`, dan
tipe `Voucher` / `VoucherType` / `VoucherList` di `src/lib/types.ts`.

**Yang SENGAJA tetap:** tabel `vouchers` dan RPC-nya (`admin_list_vouchers`,
`admin_upsert_voucher`, `admin_delete_voucher`, `list_my_vouchers`) di database.
Stevensaid "dihapus dulu", jadi kode dibuang tapi data disimpan — kalau berubah
pikiran, fiturnya bisa dinyalakan lagi tanpa kehilangan voucher yang sudah ada.
I18N grup `admin.vouchers` juga dibiarkan karena `DeliveryZonesClient` memakai
`statusActive` / `activeLabel` dari grup itu.

**2. Strip kategori di /order dihapus** — `src/components/customer/MenuBrowser.tsx`

Kartu "Semua" + kartu nama kategori (dengan jumlah rasa) dihapus seluruhnya,
bersama state `activeCategory`, `totalFlavors`, penyaringan per kategori, dan
anchor `sr-only` ber-`id="category-..."`.

Alasan: strip itu cuma menambah satu tap sebelum pembeli bisa lihat produk, dan
yang dibuka lewat strip tetap "Semua" — jadi tidak ada gunanya. `shownFlavors`
sekarang selalu menggabungkan semua kategori. `MenuBrowser` (beranda) **tidak**
disentuh — state `activeCategory`-nya di sana masih dipakai.

Catatan ditulis di tempat blok itu supaya kalau nanti ada kategori kedua, tinggal
dikembalikan.

**3. Info like/stok/penjualan di kartu /order dihapus** — `FlavorCard.tsx`

Ternyata stok (`showStock={false}`), jumlah like (`showSocial={false}`), dan
penjualan memang **sudah tidak pernah ditulis** di kartu itu. Yang masih
tersisa cuma ikon hati di pojok foto — itu yang dihapus, lewat prop baru
`showHeart` yang hanya berlaku untuk mode `storefront`. Halaman `/order` mengirim
`showHeart={false}`.

Mode `dense` (beranda) tidak terpengaruh: section "Menu" tetap satu-satunya
tempat pembeli bisa likes, sesuai keputusan sebelumnya.

**4. Batas maksimal per rasa dihapus** — `supabase/migration-44.sql`

`create_order` menolak pesanan dengan
`if v_qty > v_settings.max_per_order then raise 'invalid_quantity'`
— plafon 10 pcs per rasa yang tidak ada hubungannya dengan stok, padahal
fungsi yang sama sudah memeriksa stok kategori (`insufficient_stock`).

Definisi fungsi diambil **verbatim** dari migration-33 (versi yang live), lalu
hanya baris itu yang berubah; `create or replace` dipakai supaya grant execute
untuk anon & authenticated tidak hilang. Grant juga ditulis ulang eksplisit.
Kolom `store_settings.max_per_order` sengaja **tidak** dihapus — tidak ada
frontend yang membacanya, dan menahannya membuat perubahan ini bisa dibatalkan.

**Verifikasi batas pesanan** (`pg`, semua dalam transaksi lalu ROLLBACK):

| Percobaan | Hasil |
| --- | --- |
| qty 25, stok kategori 100 (dulu pasti kena plafon 10) | **lolos** |
| qty 30, stok kategori 20 | ditolak `insufficient_stock` |
| qty 0 | ditolak `invalid_quantity` (validasi bentuk data, bukan batas dagang) |

Stok kategori dan jumlah baris `orders` setelah rollback: tidak berubah.

**Verifikasi lain**

- `tsc --noEmit` bersih · `npm run lint` bersih (0 warning) · `npm run build`
  sukses, `/admin/vouchers` hilang dari daftar route.
- `scripts/test-pages.mjs` **17/17 lulus**. Uji voucher dibalik jadi
  "/admin/vouchers harus 404" + "menu admin tidak punya tautan Voucher".
- headless lokal: `/order` tanpa strip kategori, kartu tanpa hati, tanpa teks
  stok/like/penjualan; sidebar admin berisi 8 menu tanpa Vouchers; 0 console error.

---

## 2026-10-11 — Logo + nama toko di top bar HP, section "Menu Baru" (label New) + pemilih di admin

**Scope:** feat: dua permintaan Steven

1. "diatas sini mungkin bisa letak logo dan nama dari identitas toko?" — bagian
   tengah top bar HP tadinya kosong total (hanya tombol menu kiri + lonceng
   kanan).
2. "Nanti akan ada menu baru, dan ingin diletak di mungkin atas
   bundle lalu seperti biasa namun mau tambahin satu tulisan kayak 'New' jadi
   orang bisa tertarik, dan di admin dia bisa set menu mana yang new kalau di
   set new nanti masuk ke sana."

**1. Logo + nama toko di top bar HP** — `src/components/customer/SiteHeader.tsx`

Spacer `<span className="flex-1" />` diganti `Link` ke `/` berisi logo
(`size-9`, bulat seperti versi desktop) + nama toko (`font-display`, `truncate`).
Brand line disembunyikan di HP supaya bar tetap setinggi 64px. Ketuk logo atau
nama = balik ke beranda.

**Catatan untuk Steven:** file logo sekarang (`/logo-rumakomugi.jpg`) sudah
memuat tulisan "Rumakomugi" di dalamnya, jadi di top bar terlihat
"Rumakomugi Rumakomugi". Kalau ingin bersih, ganti ke logo **tanpa teks**.

**2. Kolom baru `store_settings.new_flavor_ids`** — `supabase/migration-43.sql`

Pola yang sama persis dengan `popular_flavor_ids` (migration-40): jsonb array of
flavor id, terurut, dibersihkan `clean_flavor_id_list`, dan
`admin_save_settings` ditulis ulang utuh (bukan sebagian — kalau sebagian, semua
field lain ikut hilang).

- CHECK constraint `settings_new_flavor_ids_ok`: harus array, maksimal **6**.
- Batas **6** (bukan 3 seperti "Populer") karena section-nya baris mendatar.
  Angka ini harus sama di tiga tempat: `MAX_NEW_PICKS` (utils), tombol dashboard,
  dan CHECK constraint.
- `admin_save_settings` sekarang mengembalikan `new_flavor_ids` di payload.

**3. `FlavorCard` dapat prop `badgeLabel`** — `src/components/customer/FlavorCard.tsx`

Kalau diisi, teks badge di foto **menggantikan** "Signature" (bukan menambah
badge kedua, supaya dua label di pojok yang sama tidak tumpang tindih). Ikon
ikut berganti: `Star` untuk Signature, `Sparkles` untuk "New". Warna badge tetap
`honey-400` — palet coklat toko tidak berubah.

**4. Section "Menu Baru" di beranda** — `src/components/customer/AppHome.tsx`

Component baru `NewShowcase`, diletakkan DI ANTARA `HeroBanner` dan
`BundleShowcase`. Urutan beranda sekarang:
`sapaan → hero → Menu Baru → Paket Hemat → Populer → Menu`.

- Kartu memakai `FlavorCard` mode `dense` yang SAMA dengan section "Menu" dan
  "Populer", jadi ketiganya dijamin tidak melenceng.
- **Baris mendatar** (`overflow-x-auto` + `snap-x`, kartu `w-36 sm:w-40`),
  bukan grid 3 kolom — enam kartu jadi dua baris dan mendorong "Paket Hemat"
  terlalu jauh ke bawah.
- Padding negatif (`-mx-4 ... px-4`) supaya kartu pertama rata dengan kartu
  section lain, tapi kartu terakhir tetap bisa di-scroll sampai habis.
- **Hati READ-ONLY** (`readOnlySocial`), sama seperti "Populer" — section "Menu"
  tetap jadi satu-satunya tempat like di beranda.
- **TIDAK ada fallback otomatis.** Kalau daftar kosong, section disembunyikan
  sama sekali (bukan menebak dari tanggal dibuat). Menebak sering salah — produk
  lama yang fotonya baru diupload — dan label "New" pada barang yang bukan baru
  itu klaim dagang yang salah.
- `pickByIds()` dapat parameter `max` ketiga supaya batas per section berbeda.

**5. Admin: pemilih "Menu Baru"** — `src/components/admin/SettingsClient.tsx`

`HomePickField` dipakai ulang untuk section kedua, sekarang menerima `max`,
`emptyLabel`, dan `emptyHint`. Perubahan itu perlu karena kotak kosongnya
berbeda: "Populer" kosong = dipilih otomatis, "Menu Baru" kosong = section
disembunyikan. `normalizeFlavorIds()` di `src/lib/utils.ts` juga mendapat
parameter `limit` (default tetap `MAX_HOME_PICKS` supaya pemanggil lama tidak
berubah perilaku).

**6. i18n** — `src/lib/i18n/id.ts` + `en.ts`

`home.newSection` ("Menu Baru" / "New Arrivals"), `home.newBadge` ("New" untuk
kedua bahasa), serta `admin.settings.newPicker` / `newPickerHint` /
`newPickerEmpty` / `newPickerEmptyHint`.

**Verifikasi lokal**

- `tsc --noEmit` bersih · `npm run lint` bersih · `npm run build` sukses
- `scripts/test-pages.mjs` **16/16 lulus**
- headless (Edge, 400×900) dengan `new_flavor_ids = [5, 3]`:
  - top bar: tinggi 64px, logo 36px, nama "Rumakomugi" → link `/`, tombol menu
    dan lonceng tetap ada;
  - urutan section diukur dari posisi pixel: **Menu Baru (top 350) → Pilihan
    Paket Hemat (635) → Populer → Menu**;
  - 2 kartu, ukuran **144×221 keduanya** (seragam), badge "New" muncul,
    **0 tombol like** (hati read-only);
  - admin: login sungguhan lewat `/admin/login`, tab "Beranda" menampilkan
    "Menu Baru", "Maksimal 6 produk", counter "2 dari 6 dipilih", daftar
    terpilih + tombol tambah produk + link reset.
- setelah `new_flavor_ids` dikembalikan ke `[]`: judul "Menu Baru" **tidak ada**
  lagi di HTML (section benar-benar hilang, bukan judul kosong).
- **0 console error.**

Data uji `[5, 3]` **sudah dikembalikan ke `[]`** — produk mana yang ditandai
"New" adalah keputusan Steven, bukan tebakan.

---

## 2026-10-11 — Tab "Pesanan" jadi track order (kode + nomor telepon), account dialihkan

**Scope:** feat+chore: permintaan Steven — "Di order, masih ada account, di order
yang saya mau, kita buat jadi track order aja, jadi mereka masukin code dan nomor
telepon untuk track orderan mereka"

Steven memakai kata "order" untuk hal yang di screenshot-nya adalah tab
**Pesanan** (tab kedua di bottom nav, yang tadinya mengarah ke `/account`). Jadi
permintaannya dibaca sebagai: halaman Pesanan bukan daftar akun / riwayat
pesanan, melainkan **lacak satu pesanan** pakai kode + nomor telepon.

**1. RPC `track_by_code` sekarang wajib dua identitas** — `supabase/migration-42.sql`

Fungsi lama `track_by_code(p_code)` mengembalikan seluruh isi pesanan (status,
item, total, catatan) untuk siapa saja yang tahu kodenya. Kode formatnya pendek
dan mudah diteruskan, jadi itu celah kebocoran data.

- fungsi 1-argumen di-`drop`, diganti `track_by_code(p_code text, p_phone text)`;
- kode **dan** nomor telepon harus cocok, kalau tidak `return null`;
- perbandingan lewat `public.normalize_phone`, jadi "0812-...", "+62 812...",
  dan "62812..." tetap cocok dengan yang tersimpan;
- fallback ke `normalize_phone(o.phone)` untuk order lama yang
  `phone_normalized`-nya kosong;
- plus index `orders_phone_normalized_idx`.

Diverifikasi langsung ke PostgREST dengan order nyata `JS-261008-021`:

| Panggilan | Hasil |
| --- | --- |
| kode + telepon benar | 200, JSON pesanan lengkap |
| kode benar, telepon salah | 200, `null` |
| kode saja (signature lama) | 404 PGRST202 |
| kode huruf kecil + format telepon lain | 200, JSON pesanan lengkap |
| kode ngawur | 200, `null` |

**2. `TrackForm` minta kode + nomor telepon** — `src/components/customer/TrackForm.tsx`

- prop baru `initialPhone`, state `phone`, error jadi
  `"code" | "phone" | "notFound"`;
- kolom telepon (`type="tel"`, `inputMode="tel"`, `autoComplete="tel"`) +
  petunjuk "Pakai nomor yang sama seperti saat memesan.";
- kosongkan kode → pesan "Kode pesanan wajib diisi"; kosongkan telepon →
  "Nomor telepon wajib diisi". Menyorot kolom yang kosong lebih membantu daripada
  langsung bilang "tidak ditemukan";
- `localStorage js_track` sekarang menyimpan `{ code, phone }`.

**3. Tab "Pesanan" dan lonceng diarahkan ke `/track`** — `src/components/customer/MobileBottomNav.tsx`, `src/components/customer/SiteHeader.tsx`

- bottom nav: `{ href: "/account" }` → `{ href: "/track" }`, label
  `t.nav.orders` → `t.nav.track` ("Cek Pesanan"), icon `ClipboardList` tetap;
- lonceng notifikasi top bar: `href` → `/track`, `aria-label` → `t.nav.track`,
  dan **titik oranye di pojok DIHAPUS** — tidak ada tabel notifikasi di database,
  jadi badge "unread" itu murni karangan (gotcha #33).

**4. `/account` mengalihkan ke `/track`** — `src/app/account/page.tsx`

`redirect("/track")` di paling atas selama `ACCOUNT_FEATURE_ENABLED === false`.
Halaman account **tidak dihapus** — kodenya masih utuh, cuma tidak punya pintu
masuk. Nyalakan flag dan halaman itu hidup lagi tanpa perubahan lain.

**5. Halaman sukses ikut membawa nomor telepon** — `src/app/order/success/[code]/SuccessClient.tsx`

Tautan "Cek status pesanan" jadi
`/track?code=...&phone=...` supaya pembeli tidak perlu mengetik ulang. `invoice`
boleh `null` sebelum snapshot termuat (setelah refresh), jadi dipakai
`invoice?.phone ?? ""` — tautan terisi sendiri begitu data masuk.

**6. i18n** — `src/lib/i18n/id.ts` + `en.ts`

Grup `track` dapat `phone`, `phonePlaceholder`, `phoneHint`, `codeRequired`,
`phoneRequired`. `subtitle` lama ("Masukkan kode pesanan saja — tidak perlu
nomor telepon lagi") diganti. `en.ts` adalah sumber tipe `Dict`, jadi kedua
bahasa wajib punya key yang sama persis.

**Verifikasi lokal**

- `tsc --noEmit` bersih · `npm run lint` bersih · `npm run build` sukses
- `scripts/test-pages.mjs` **16/16 lulus**
- headless (Edge, viewport 400×900): kolom `tel` ada; kode benar + telepon salah →
  "Pesanan tidak ditemukan"; kode + telepon benar → status `JS-261008-021`,
  "Menunggu konfirmasi", `1× Choco Matcha`, `Rp 18.000`; kolom kosong → pesan
  khusus tiap kolom; `?code=&phone=` terisi otomatis; beranda tanpa `href="/account"`
  dan lonceng `href="/track"` tanpa titik oranye; `/account` → `307 /track`
  dengan `<h1>Cek Status Pesanan</h1>` dan tanpa field email.
- **0 console error.**

**Scope:** feat+fix: empat permintaan Steven

1. Bundle yang sudah di keranjang **tetap bisa ditekan** untuk mengganti rasa.
2. Kartu di halaman pre-order **belum seimbang** (lebar tidak sama).
3. **Fitur Account di-hide** sementara — "jangan ada fitur account dulu karena
   belum terpakai".
4. **Kolom search di top bar dihapus.**

**1. Bundle bisa diubah (bukan dikunci)**

Sebelumnya kartu bundle di `/order` diberi `disabled` begitu isinya masuk
keranjang, jadi pembeli terkunci. Sekarang:
- `CartProvider` dapat aksi baru `updateBundle(entryId, slots, note)` —
  menulis ulang entry yang **sama**, bukan menambah entry kedua.
- `OrderBundleModal` dapat prop `editingEntry`. Kalau diisi, slot terisi dari
  entry itu (pembeli melihat rasa yang sekarang terpakai) dan tombolnya jadi
  "Simpan perubahan".
- Pengisian slot awal memakai ref `seededFor` — hanya sekali saat modal dibuka,
  supaya perubahan `editingEntry` di tengah jalan tidak menimpa isian yang
  sedang dikerjakan.
- `key` modal sengaja **tidak** memuat `editingEntry.id`: kalau memuat, setiap
  kali entry berubah modal remount dan isian hilang di tengah jalan.
- **Perbaikan stok:** di mode ubah, entry yang sedang diubah **dikecualikan**
  dari `remainingStockByCategory()`. Kalau tidak, slot lama dan slot baru sama-
  sama mengurangi stok sehingga pembeli melihat "habis" padahal tidak.

**2. Kartu /order tidak seimbang**

Bug yang SAMA dengan kartu dense di beranda (gotcha #48): `OrderMenuBrowser`
membungkus kartu dengan `<li className="flex">`, dan pada flex baris
`align-items: stretch` hanya meregangkan sumbu tegak — lebar kartu ikut isi
teks, sehingga kartu berdeskripsi panjang lebih lebar dari yang tanpa
deskripsi. Diperbaiki dengan `w-full` pada `<article>` gaya `storefront`.

**3 & 4. Flag fitur**

`src/lib/featureFlags.ts` (BARU) dengan dua flag:
- `ACCOUNT_FEATURE_ENABLED = false` — menyembunyikan bar "Account" di sheet
  Profil, chip avatar/"Masuk" di top bar (mobile + desktop + menu full-screen),
  dan popup "pakai akun atau tamu?" di tombol "Pesan Sekarang" (sekarang
  langsung ke `/order`). Teks `order.subtitle` juga diubah supaya tidak
  menjanjikan akun.
- `TOPBAR_SEARCH_ENABLED = false` — kolom search top bar disembunyikan.
  `submitSearch` dan dukungan `?q=` di `OrderMenuBrowser` dibiarkan utuh.

Yang SENGAJA tetap ada: halaman `/account` + lonceng notifikasi (dipakai tab
"Pesanan" untuk riwayat & status pre-order — itu fitur pesanan, bukan akun),
dan bar menu Profil selain Account yang masih dikelola dashboard.

**Verifikasi (headless, viewport 390px):** kartu `/order` lebar 174×5, tinggi
291×5, foto 129×5 (sebelumnya tidak sama). Bundle: kartu tidak `disabled`,
setelah masuk keranjang labelnya "Sando 2 — Ketuk untuk ubah rasa" + chip "Di
keranjang", ditekan lagi membuka modal mode ubah dengan counter `2/2` terisi
dan tombol "Simpan perubahan". Beranda: 0 `input[type=search]`, 0 `role=search`,
0 avatar, 0 tombol "Masuk", CTA langsung ke `/order` tanpa popup. Sheet Profil:
4 bar (Hubungi Kami, FAQ, Jam Buka, Syarat & Ketentuan), tanpa Account.
`test-pages` 16/16, tsc + eslint bersih, 0 console error.

---

## 2026-10-10 — Perbaikan kartu 3 kolom: ukuran sama, terjual selalu tampil, tanpa "Lihat Semua", tanpa efek transparan

**Scope:** fix: kartu Populer/Menu kembali sama besar dan seragam

Steven kirim 2 screenshot dengan 5 keluhan:
1. ukuran kartu tidak sama semua,
2. kartu kanan tidak menampilkan jumlah penjualan,
3. "View all" dihapus,
4. spacing di PC jelek,
5. efek kartu jadi transparan kalau di-like dihapus.

**Akar masalah (1) dan (4) — ini yang sebenarnya penting:**

Di section "Populer", tiap kartu dibungkus `<li className="flex">` di dalam
`grid grid-cols-3`. Pada flex **baris**, `align-items: stretch` hanya
meregangkan sumbu **tegak**, bukan lebar — sehingga lebar kartu mengikuti
isi teksnya, bukan lebar sel. Terukur: kartu 109px / 95px / 104px di HP
padahal selnya 113px. Foto `aspect-square` mengikuti lebar itu, jadi
tinggi fotonya berbeda-beda, dan sisa ruang di PC terbaca sebagai celah
yang kegedean.

Perbaikan: `w-full` pada kartu dense. Section "Menu" tidak kena masalah
ini karena kartunya anak grid langsung (otomatis mengisi sel).

Ditambah `shrink-0` pada kontainer foto, karena kartu diregangkan ke
tinggi baris grid dan tanpa itu flexbox memampatkan foto (117/101/112px
padahal semuanya square).

**Verifikasi (angka, bukan perkiraan):** HP 390px → foto 111/111/111,
kartu 189/189/189, isi 77/77/77. PC 1280px → foto 198/198/198, kartu
279/279/279, gap 12px. Kelima kartu Menu juga seragam. `test-pages` 16/16,
0 console error.

**Mengubah:**
- `src/components/customer/FlavorCard.tsx` — `w-full` + `shrink-0` di kartu
  dense; efek `opacity-45 saturate-50` saat di-like **dihapus** ( kelasnya
  sudah tidak ada di mana pun di `components/customer/`); badge "Signature"
  disempitkan ke `text-[9px] px-1.5` supaya kata utuh (sebelumnya
  "Signat...").
- `src/components/customer/AppHome.tsx` — `SectionHead` tidak lagi menerima
  `href`/`linkLabel` (link "Lihat Semua" dihapus); `showSold` tanpa syarat
  supaya "0 terjual" ikut tampil; gap disamakan dengan Menu (`gap-2.5 sm:gap-3`).
- `src/components/customer/MenuBrowser.tsx` — gap disamakan (`gap-2.5 sm:gap-3`).

---

## 2026-10-10 — Beranda: judul besar "Menu", kartu menu jadi 3 kolom + jumlah terjual

**Scope:** feat: judul section menu + kartu menu ringkas

Steven minta dua hal: (1) setelah **Populer** ada **judul besar "Menu"**, lalu di
bawahnya nama kategori ("Sando Sandwich") dan rasa-rasanya; (2) kartu **menu**
diperkecil supaya **3 kartu muat dalam satu baris** dan tampilannya mengikuti
gambar 2 (kartu Populer), **ditambah jumlah terjual**.

**Mengubah:**
- `src/lib/useSoldCounts.ts` — BARU. Hook `useSoldCounts` diekstrak dari
  `AppHome` supaya `MenuBrowser` (section terpisah) memakai angka terjual yang
  sama tanpa memanggil RPC kedua.
- `src/components/customer/FlavorCard.tsx` — prop baru `dense` (kartu ringkas
  3 kolom: foto persegi, nama 1 baris, baris "♥ suka / 🛍 terjual", harga
  `size="sm"` warna `honey-600`) dan `showBadge`. Di mode `dense` hati pindah ke
  pojok kanan atas foto dan jadi `<button>` (bukan pil full-width di bawah),
  mengikuti gambar referensi. Badge "Signature" pakai `min-w-0` + `truncate`
  dan hati pakai `ml-auto` — tanpa itu, produk tanpa badge membuat hati melompat
  ke KIRI dan produk dengan badge hampir mendorong hati keluar kartu.
- `src/components/customer/PriceTag.tsx` — prop `className` baru untuk mewarnai
  angka harga tanpa kehilangan harga coret + badge diskon.
- `src/components/customer/AppHome.tsx` — `PopularCard` (isi 80 baris) diganti
  pemanggilan `FlavorCard dense` dengan `readOnlySocial` + `showBadge={false}`.
  Satu komponen untuk dua section, jadi tidak bisa melenceng.
- `src/components/customer/MenuBrowser.tsx` — grid `grid-cols-3` (class
  `density-flavor-grid` sengaja dibuang karena memaksa 2 kolom di < 640px),
  kartu jadi `dense`, dan `soldCounts` diambil dari hook (prop-nya dihapus).
  Label kategori dibuat `text-base font-extrabold`.
- `src/app/page.tsx` — `<h2>` besar "Menu" di atas `MenuBrowser`; section menu
  diubah `max-w-6xl` → `max-w-2xl` supaya lebarnya sama dengan baris Populer.
- `src/lib/i18n/{id,en}.ts` — `menu.title` "Pilihan Rasa Kami"/"Our flavors" →
  "Menu". Key ini sudah tidak dipakai komponen lain (yang pakai `menu.title`
  punya namespace berbeda: `admin.menu.title`, `order.menu.title`).

**Verifikasi:** tsc + eslint bersih, `npm run build` sukses, `test-pages.mjs`
16/16, screenshot headless viewport 390px: urutan h2 `Populer` → `Menu`,
label kategori "Sando Sandwich", 5 kartu menu dalam grid 3 kolom, 5 tombol
like di Menu dan 0 di Populer, teks "N terjual" tampil, "Our flavors" /
"Pilihan Rasa Kami" / "Kategori" hilang, 0 console error. Klik hati →
`aria-pressed=true`, label "Hapus suka", `like:flavor:1` tersimpan.

**Peringatan — data uji yang bocor ke produksi:** test browser headless yang
dipakai untuk verifikasi ini **menuliskan like sungguhan ke database
produksi** lewat `POST /api/flavor-like`. Tabel `flavor_likes` sekarang berisi
10 baris dan `flavors.likes_count` = 6/0/2/1/1 — semuanya artefak pengujian,
bukan pembeli.

Steven sudah diberi tahu dan **meminta agar dibiarkan** ("biarkan aja dulu,
jangan ada hapus apa-apa") karena angka itu dipakai sebagai testimoni sosial
agar etalase tidak terlihat kosong. Lihat decisions.md **D28**.

---

## 2026-10-10 — Beranda: Bundle naik ke atas Populer, kartu Menu jadi gaya referensi, Populer jadi read-only

**Scope:** feat: susunan ulang beranda sesuai gambar referensi Steven

Steven kirim 4 gambar dan minta: (1) kartu **menu** diubah ke gaya gambar 1,
(2) kartu **Populer** tidak bisa diketuk sama sekali — hanya lihat; yang bisa
di-like adalah kartu **menu**, (3) section **Kategori** dan header
"Menu / Our flavors" dihapus, dan (4) **Bundle** diletakkan di atas Populer.
Urutan akhirnya: sapaan → hero → paket hemat → Populer → menu.

**Mengubah:**
- `src/components/customer/BundleShowcase.tsx` — BARU. Kartu bundle
  diekstrak dari `MenuBrowser` supaya bisa dipakai di dua tempat.
- `src/components/customer/MenuBrowser.tsx` — blok bundle + `BundleCard`
  dihapus; header tingkat-2 tidak lagi ditulis ulang saat hanya ada satu
  kategori (duplikat "Sando Sandwich" muncul dua kali).
- `src/components/customer/AppHome.tsx` — `CategoryRow` dan `PromoBanner`
  DIHAPUS; `BundleShowcase` disisipkan di atas `PopularGrid`; `PopularCard`
  jadi `<div>` biasa tanpa `role=button`/`onClick`/`onDoubleClick`, hatinya
  jadi `<span>`; props `freeShippingMin` & `deadline` dihapus.
- `src/app/page.tsx` — blok header "Our flavors" + tombol "Order these"
  dihapus; bundle diteruskan ke `AppHome`.
- `src/components/customer/FlavorCard.tsx` — foto jadi `aspect-[4/5]`,
  nama `text-xl`, harga `size="xl"`, badge pakai `t.menu.signature`
  ("Signature"), pil like dibesar (full-width, `text-[13px]`), deskripsi
  `line-clamp-3`, dan prop baru `showSold` (default false — kartu menu
  cukup menampilkan "N disuka"; angka terjual sudah tampil di Populer).
- `src/components/customer/PriceTag.tsx` — ukuran harga baru `"xl"`.
- `src/lib/i18n/{id,en}.ts` — `menu.signature`.

**Bug yang ditemukan & diperbaiki sekalian:**
- `FlavorCard` punya state like sendiri (`useState` + `localStorage`), sementara
  kartu Populer memakai store bersama `useFlavorLikes`. Akibatnya menekan hati di
  menu **tidak** membuat kartu Populer ikut pudar. Sekarang `FlavorCard`
  memakai `useFlavorLikes()` juga — satu sumber kebenaran untuk semua kartu.

**Catatan:**
- Banner promo (`PromoBanner`) dihapus dari komposisi beranda, komponennya
  juga ikut hilang. Tapi banner ini memang tidak pernah tampil di produksi
  (`free_shipping_min = 0` dan deadline kosong), jadi tidak ada perubahan
  tampilan yang dilihat pembeli — kalau Steven mau promo lagi, tinggal
  dikembalikan ke `AppHome`.
- Strip jam buka / batas pre-order (`ShopInfo`) tetap ada antara Populer dan
  menu. Steven bilang "di bawahnya menu langsung"; strip ini tipis dan bukan
  section, jadi tidak dihapus tanpa diminta.
- `menu.featured` (label "Favorit") tidak dipakai lagi di kartu; admin masih
  memakai `admin.menu.featured` untuk menandai produk unggulan.

**Verifikasi:**
- Uji browser (Edge headless, viewport HP): urutan "Pilihan Paket Hemat"
  (idx 130) < "Populer" (idx 207); "Kategori"/"Our flavors"/"Pilihan Rasa Kami"
  tidak ada; section Populer berisi 3 `<li>` dengan 0 elemen interaktif dan 0
  tombol like; kartu menu punya badge "Signature" + tombol like; klik hati di
  menu → `aria-pressed` true, label "Hapus suka", `like:flavor:1` tersimpan,
  dan kartu Populer untuk produk yang sama ikut pudar. **0 console error.**
- `tsc --noEmit` dan `eslint --max-warnings=0` bersih.

## 2026-10-10 — Bottom nav jadi 3 tab (Beranda/Pesanan/Profil) + kartu Populer bisa di-like

**Scope:** feat: tab Profil berupa sheet menu dinamis, Favorit & Terlaris dihapus, like jadi interaktif

Steven (10-10) minta: (1) kartu menu seperti referensi + hapus "favorit" dan
"terlaris"; (2) tambah jumlah terjual dan fitur like (ketuk hati atau double
klik); (3) bottom nav jadi 3 tab — Beranda, Pesanan (2 bar: sedang diproses +
riwayat), dan Profil (daftar bar yang kalau ditekan muncul popup; semua bisa
diset dari admin).

**Mengubah:**
- `supabase/migration-41.sql` — baru. Tabel `profile_menu_items` (bar menu
  profil: code, icon, title/body dua bahasa, buttons jsonb, sort_order,
  is_active) + RLS + `public_profile_menu()` + 3 RPC admin. Ter-seed 5 bar dari
  data `store_settings` yang sudah ada.
- `scripts/db-push.mjs` — ikut menyertakan migration-41.
- `src/components/customer/ProfileSheet.tsx` — baru. Sheet (baris-baris menu)
  + popup isi per bar. Status buka/tutup di store modul-level supaya tombol
  tab dan sheet bisa terpisah.
- `src/components/customer/MobileBottomNav.tsx` — 5 tab → 3 tab; "Profil"
  jadi tombol buka sheet, bukan link.
- `src/lib/useFlavorLikes.ts` — baru. Store like bersama (localStorage +
  `/api/flavor-like`), dipakai kartu Populer dan kartu menu sekaligus.
- `src/components/customer/AppHome.tsx` — kartu Populer kini punya tombol
  like + jumlah terjual; `BestSellingList` DIHAPUS; komposisi tidak menerima
  `bestSellingIds`.
- `src/app/favorites/` — DIHAPUS (routing + komponen).
- `src/app/account/AccountClient.tsx` — pesanan dipecah dua bagian
  (`OrderGroup` + helper `isFinished`).
- `src/components/admin/ProfileMenuClient.tsx` + `src/app/admin/(dashboard)/profile-menu/page.tsx`
  — baru. CRUD bar menu profil.
- `src/components/admin/AdminShell.tsx` + `layout.tsx` — item sidebar baru.
- `src/app/admin/actions.ts` — 3 action baru.
- `src/lib/types.ts`, `src/lib/data.ts` — `ProfileMenuItem`,
  `getProfileMenuItems()`. `best_selling_flavor_ids` dihapus dari tipe.
- `src/lib/i18n/id.ts` + `en.ts` — grup `profile`, key `nav.profile`, label
  admin `profileMenu`, dan label pesanan aktif/riwayat.
- `src/components/admin/SettingsClient.tsx` — pemilih "Terlaris" dihapus.

**Catatan penting (untuk Steven):**
- Kolom `store_settings.best_selling_flavor_ids` (dari migration-40) TIDAK
  di-drop, cuma tidak dipakai lagi. Tidak dihapus supaya kalau mau dikembalikan
  tidak perlu migrasi.
- Data yang sudah rusak di `store_settings`: `address = "Vihara Tian En,
  Jl.buffers"`, `hours_id` kosong, `instagram` & `maps_url` kosong,
  `whatsapp = "621234567890"` (placeholder). Migration-41 menyalin nilai-nilai
  itu ke bar "Hubungi Kami" dan "Jam Buka", jadi yang rusak sekarang terlihat
  ke pembeli. Perlu diperbaiki dari Pengaturan > Kontak & Lokasi, lalu
  disalin ulang di Menu Profil (isinya salinan, bukan live).
- Kartu yang sudah di-like jadi PUDAR (opacity 45%), bukan hilang total —
  supaya hati masih bisa ditekan untuk membatalkan.

**Verifikasi:**
- migration-41 diterapkan ke DB produksi; 5 bar ter-seed, `public_profile_menu()`
  menghormati `is_active`.
- Uji browser (Edge headless, viewport HP): bottom nav = 3 tab; kartu Populer
  punya hati + "1 terjual"; klik hati → `aria-pressed` true, label jadi
  "Batalkan suka", kartu opacity 0.45, `like:flavor:1` masuk localStorage;
  double-click kartu juga men Like; sheet Profil menampilkan 5 bar; tap
  "Hubungi Kami" → popup berisi isi + tombol "Chat WhatsApp"; tap "Akun Saya"
  → AuthModal login terbuka; halaman admin `/admin/profile-menu` menampilkan
  5 bar dengan tombol Ubah. **0 console error.**
- `/favorites` sekarang 404. `tsc --noEmit` dan `eslint --max-warnings=0` bersih.

## 2026-10-09 — "Populer" & "Terlaris" bisa dipilih penjual (maks 3) + token honey yang hilang

**Scope:** feat: sorotan beranda dipilih dari dashboard (Admin > Settings > Beranda)

Steven minta: "Populer dan Terlaris buat bisa di set oleh admin penjual dan max
ada 3 aja". Sebelumnya keduanya dihitung otomatis oleh frontend (like + terjual),
dan "Terlaris" kadang kosong karena belum ada penjualan.

**Mengubah:**
- `supabase/migration-40.sql` — baru. Kolom `store_settings.popular_flavor_ids`
  & `.best_selling_flavor_ids` (jsonb, array of flavor id, maks 3, CHECK
  constraint), fungsi `clean_flavor_id_list()` sebagai sanitizer, dan
  `admin_save_settings()` ditulis ulang (salinan dari migration-7 + 2 kolom baru).
- `scripts/db-apply.mjs` + `scripts/db-push.mjs` + `package.json` — skrip baru
  untuk menerapkan SATU file migrasi, dan `db:push` sekarang menyertakan
  migration-40.
- `src/lib/utils.ts` — `MAX_HOME_PICKS` (3) + `normalizeFlavorIds()`.
- `src/lib/types.ts` — dua kolom baru di `StoreSettings`.
- `src/components/admin/SettingsClient.tsx` — tab baru "Beranda" dengan 2
  pemilih produk; tab nav sekarang `lg:flex-wrap` karena 8 tab meluber.
- `src/components/customer/AppHome.tsx` — pakai pilihan penjual kalau ada,
  fallback otomatis kalau kosong; batas turun 6→3 dan 5→3.
- `src/app/page.tsx` + `src/app/admin/(dashboard)/settings/page.tsx` —
  sambungan data.
- `src/lib/i18n/id.ts` + `en.ts` — 13 label baru.
- `src/app/globals.css` — token `honey-50/100/600` yang dipakai tapi belum pernah
  ada (lihat gotcha #38).

**Mengapa:**
Penjual perlu menentukan sendiri apa yang ditonjolkan — bukan algorithmic.
Batas 3 ditegakkan di tiga tempat sekaligus (UI, kode, CHECK constraint DB)
supaya tidak bisa dilanggar dari sisi mana pun. Array kosong berarti "penjual
belum memilih" dan website memakai perilaku lama, jadi tidak ada risiko
halaman kosong setelah deploy.

**Verifikasi:**
- migration diterapkan ke DB produksi, sanitizer diuji 7 kasus (potong 3, duplikat,
  id tidak ada, id berupa string, sampah, bukan array, kosong) — semua benar.
- `admin_save_settings` diuji sungguhan lewat `request.jwt.claims` + rollback:
  `[4,1,4,999999,2]` → `[4,1,2]`, dan `store_name` tidak ikut wiped.
- Uji UI end-to-end (headless Edge): pilih 4 produk (klik ke-4 otomatis disabled
  + tooltip "Maksimal 3 produk sudah tercapai"), simpan, DB terisi 3, beranda
  menampilkan urutan yang sama persis. 0 console error.
- `tsc --noEmit` dan `eslint --max-warnings=0` bersih, `npm run build` sukses,
  `npm run test:pages` 15/15.

## 2026-10-09 — Housekeeping: bersihkan artefak verifikasi, .gitignore untuk `.tmp-*`

**Scope:** chore: hapus file sementara verifikasi + gotcha baru

Deploy UIUX 4 sudah hijau (lihat entry di bawah), tapi working tree masih
memuat artefak verifikasi: `.tmp-verify-u4.mjs`, `.tmp-browser-u4.mjs`, dan
`.tmp-shots/` — yang terakhir berisi profil Edge headless dengan ribuan file
(cache, model optimizer, `Default/`) sehingga `git status` jadi tidak terbaca.

Yang dikerjakan:
- Edge yang masih memegang folder profil ditutup, lalu semua artefak
  dihapus lewat `mavis-trash`,
- `.gitignore` dapat baris `/.tmp-*` supaya verifikasi berikutnya tidak
  mengotori repo lagi,
- `MEMORY/gotchas.md` dapat #34 (profil Edge headless di dalam repo) dan #35
  (cek `git status` sebelum `git add -A`).

Tidak ada perubahan kode aplikasi, jadi tidak ada deploy baru.

## 2026-10-09 — Beranda ganti ke UIUX 4 (tampilan aplikasi), top bar + bottom nav ikut

**Scope:** feat: redesign beranda (UIUX 4), top bar mobile, bottom nav 5 tab, halaman /favorites

Steven berubah pikiran setelah UIUX 1 + UIUX 3 tadi: "ganti UIUX nya menjadi
UIUX 4, pakainya full seperti itu dulu". Referensi: `Gambar/UIUX 4.jfif` —
screen Home sebuah aplikasi coffee shop.

Struktur yang diambil (mobile):
top bar (menu · search · lonceng · avatar) → sapaan → hero banner +
titik carousel → Kategori → Populer → banner promo → Terlaris → bottom nav 5 tab.

### Yang diubah

- `AppHome.tsx` (baru) — semua section beranda dalam satu komponen client:
  `HomeGreeting`, `HeroBanner`, `CategoryRow`, `PopularGrid`, `PromoBanner`,
  `BestSellingList`, dan komposisi `AppHome`. Menggantikan 4 komponen UIUX 1
  yang sekarang **dihapus**: `HomeHero`, `CategoryBand`, `FeaturedStrip`,
  `BestSellers`.
- `SiteHeader.tsx` — mobile sekarang pakai top bar ala desain (hamburger,
  kolom search, lonceng, avatar). Desktop tetap bar logo + nav.
- `MobileBottomNav.tsx` — 3 tab jadi 5: Beranda · Menu · Pesanan · Favorit · Profil.
- `favorites/page.tsx` + `FavoritesClient.tsx` (baru) — halaman favorit.
- `MenuBrowser.tsx` (`OrderMenuBrowser`) — baca `?q=` dari URL untuk pencarian.
- `page.tsx` — beranda dirakit ulang; `getCustomerProfile()` untuk nama sapaan.
- `i18n/{id,en}.ts` — grup `home` ditulis ulang untuk UIUX 4; `nav.orders`,
  `nav.favorites`, `home.favSubtitle` baru.

### Keputusan: jangan mengarang angka promo

Referensi menampilkan "Get 20% OFF / Use Code: COFFEE20". **Kode itu tidak
dikarang** — project ini punya tabel `vouchers` (per customer, dibaca lewat
RPC `list_my_vouchers`, tidak ada RPC publik untuk banner), dan mengarang
diskon di storefront akan membuat pembeli memakai kode yang salah.

`PromoBanner` karena itu hanya menampilkan data nyata dari `store_settings`:
`free_shipping_min` (gratis ongkir) atau `deadline_id/en`. Kalau keduanya
kosong, banner tidak dirender. **Steven cukup isi "minimum gratis ongkir" di
admin → banner langsung muncul** tanpa kode.

Angka "rating bintang 4.5" di referensi juga tidak ada di database, jadi
diganti **jumlah suka (`likes_count`) dengan ikon hati** — angka nyata, tidak
menyamakan diri sebagai rating.

### Keputusan: "Terlaris" disembunyikan kalau belum ada penjualan

Versi pertama jatuh ke `allFlavors.slice(0,5)` dan menampilkan lima baris
"0 terjual" — tidak berguna dan menyesatkan. Sekarang section hanya dirender
kalau minimal satu rasa punya `soldCount > 0`. Section ini otomatis muncul
sendiri setelah ada penjualan pertama, tanpa perlu ubah kode.

### Catatan teknis

- `setState` di dalam `useEffect` **ditolak ESLint** (`react-hooks/set-state-in-effect`).
  Sapaan berbasis jam dan daftar favorit sudah dipindah ke
  `useSyncExternalStore` — pola yang sama seperti gotcha #23. Snapshot
  `localStorage` di-cache di modul level supaya referensinya stabil,
  kalau tidak `useSyncExternalStore` loop tak terbatas.
- `Star` dan `soldCounts` di `PopularGrid` sudah tidak dipakai setelah angka
  pindah ke hati — ikut dihapus biar ESLint `--max-warnings=0` tetap hijau.

### Verifikasi

- `npx tsc --noEmit` — bersih
- `npx eslint src --max-warnings=0` — bersih
- `npm run build` — sukses
- `npm run test:pages` — 15 lulus / 0 gagal
- Screenshot headless (CDP) 390px & 1440px: beranda, `/favorites`,
  `/order?q=matcha` → **0 console error**. Pencarian "matcha" benar-benar
  menyaring jadi 1 produk.

---

## 2026-10-09 — Redesign tampilan beranda (UIUX 1) + halaman pre-order (UIUX 3)

**Scope:** feat: redesign UI/UX beranda & halaman pre-order

Steven minta UIUX dibuat "seperti UIUX 1" untuk tampilan beranda, dan untuk halaman
pre-order beli/pesan "boleh seperti UIUX 3" — **tapi warna tetap coklat**, yang
diambil hanya cara tampilannya (layout), bukan palet referensinya.

Referensi: `Gambar/UIUX 1.jfif` (landing page bakery: hero split + baris produk +
kartu favorit) dan `Gambar/UIUX 3.jfif` (halaman produk: strip kategori + toolbar
filter/urut + grid kartu dengan tombol add-to-cart).

### Yang diubah

**Komponen baru (beranda):**
- `HomeHero.tsx` — hero 3 panel ala UIUX 1: badge lingkaran + preview di kiri,
  foto produk (carousel + titik indikator) di tengah, judul + CTA di kanan.
  Slide pertama selalu `hero_image_url` supaya panel tengah tidak pernah kosong.
- `CategoryBand.tsx` — baris kategori: teks + tombol | foto produk | teks + tombol.
- `FeaturedStrip.tsx` — 4 produk unggulan bernomor, ikut layout baris produk UIUX 1.
- `BestSellers.tsx` — 3 kartu favorit + titik carousel (hanya muncul > 3 rasa).

**Halaman pre-order (UIUX 3):**
- `MenuBrowser.tsx` (`OrderMenuBrowser`) — bagian kategori diubah dari
  "seksi per kategori" jadi: strip kategori (dapat di-scroll di HP) + toolbar
  (filter stok habis / jumlah produk / urutan) + satu grid produk.
- `FlavorCard.tsx` — dapat prop `storefront`: gaya etalase (hati pojok kanan atas,
  harga di atas, tombol full-width di bawah). `StorefrontAction` terpisah supaya
  `useCart()` tidak ikut terpasang di kartu lihat-saja.

**Lain-lain:**
- `ShopInfo.tsx` — dapat `variant`: `overlay` (default, seperti lama) dan
  `static` untuk diletakkan di bawah hero baru.
- `page.tsx` — hero lama diganti `HomeHero`; `HeroCarousel` tidak lagi dipakai
  di beranda. Hitung `heroSlides` + `featuredFlavors`.
- `i18n/id.ts` + `i18n/en.ts` — grup baru `home` dan `storefront`.

### Catatan penting

- **Harga etalase ditumpuk, bukan disejajikan dengan tombol.** Versi pertama
  menaruh harga kiri + tombol kanan dalam satu baris; di grid 4 kolom angka
  terpotong jadi "Rp 1..." — pola yang sama sudah pernah dilaporkan sebelumnya
  (`MEMORY/gotchas.md`). Sekarang harga di atas, tombol full-width di bawahnya.
- **`shownFlavors` harus dihitung SESUDAH `remainingByCategory`.** Versi pertama
  menaruhnya sebelum → ReferenceError (TDZ) saat render.
- **Komponen baru yang memanggil `useI18n()` wajib `"use client"`.**
  `useI18n` itu client hook; tanpa direktif itu halaman beranda balas 500.

### Verifikasi

- `npx tsc --noEmit` — bersih
- `npx eslint src --max-warnings=0` — bersih
- `npm run build` — sukses
- `npm run test:pages` — 15 lulus / 0 gagal
- Screenshot headless Edge (CDP): beranda & `/order` step "menu" di 1440px dan 390px.
  Cek overflow horizontal via `documentElement.scrollWidth` di 390px → 390 (aman).

### Deploy ke produksi

Commit `1bc6add` → push `main` → Vercel build otomatis (`japanese-sando-86eukdvxa-ooraa64`),
live di https://japanese-sando.vercel.app.

Verifikasi produksi (`scripts/wait-for-live.js` + cek langsung):

- Tanda unik build baru ketemu: "Rasa Paling Dicari", "Kategori Kami", "Fresh & Homemade".
- 10 route publik + admin: **10 lulus / 0 gagal**. `/account` dan `/admin`
  balas 307 → tujuan redirect-nya juga dicek dan balas 200.
- `scripts/test-pages.mjs` dengan `APP_URL=https://japanese-sando.vercel.app`:
  **15 lulus / 0 gagal** (login admin beneran, semua halaman dashboard 200).
- Browser sungguhan (CDP): 0 console error di beranda & `/order` HP.

**Dua jebakan waktu verifikasi produksi (baru, sudah masuk `gotchas.md` #30):**

1. `__NEXT_ERROR` itu **bukan** tanda error. Shell redirect Next.js selalu
   `<html id="__next_error__">`. Kalau dipakai sebagai regex, `/account` yang
   sehat akan dilaporkan gagal.
2. `"This page could not be found"` juga ada di **bundel JS** semua halaman.
   Regex error harus dijalankan atas HTML yang sudah dibuang `<script>`/`<style>`,
   kalau tidak 9 dari 10 halaman palsu dianggap error.

Warning konsol `using deprecated parameters for the initialization function`
muncul juga di `/track` (halaman yang tidak disentuh) → noise library, bukan
dari perubahan ini.

---

## 2026-10-08 — Koreksi item 1: yang disembunyikan di HP adalah footer, bukan nav bawah

**Scope:** fix: footer HP, restore: nav bawah mobile

Steven mengoreksi hasil kerja item 1. Entri sebelumnya salah baca permintaannya:
yang dihapus dari HP adalah **nav bawah**, padahal yang Steven maksud adalah
**blok informasi toko di bawah halaman** (footer TAUTAN CEPAT + HUBUNGI KAMI).

Kata-katanya: "bukan nav bawah yang beranda, pesanan saya itu yang hilang; yang
saya mau itu bawahnya yang tentang informasi toko, saya tidak mau di HP pakai
konsep itu, itu cukup di PC, untuk HP nanti ada di bagian profile, nanti ada
contact us."

### Yang diubah

- `MobileBottomNav` dibuat ulang: Beranda / Pesanan Saya / Akun, `md:hidden`,
  disembunyikan di `/admin`, `/login`, `/register`, `/account`, `/order`.
  Nav bawah kembali tampil di HP seperti semula.
- `BottomNav.tsx` (versi laptop-only dari entri sebelumnya) dihapus. Dua file
  untuk satu navigasi akan bikin bingung; nama komponen balik jadi `MobileBottomNav`.
- `SiteFooter` dapat `hidden md:block`. Di HP footer tidak dirender sama sekali;
  di laptop tampil utuh seperti biasa.
- `md:pb-20` pada baris copyright footer dihapus lagi. Padding itu dibuat
  karena nav bawah fixed ada di desktop; sekarang nav itu tidak ada, jadi
  padding cuma menyisakan ruang kosong.
- `src/app/layout.tsx` import + render balik ke `MobileBottomNav`.

### Efek samping yang ditemukan & diperbaiki: spacer bawah hilang

Footer tadinya **ikut memberi padding bawah** di akhir halaman HP. Kalau footer
dihilangkan, halaman HP berubah, jadi elemen terakhirnya nempel ke nav bawah
yang `fixed`. Diukur dengan `scripts/check-nav-overlap.js`:

| Halaman | Jarak konten terakhir ke nav, sebelum | sesudah |
| --- | --- | --- |
| `/` | 29px | 97px |
| `/track` | 314px | 314px |
| `/contact` | **6px** (hampir ketimpa) | 74px |

Perbaikan: `MobileBottomNav` sekarang merender `<div aria-hidden
className="h-[68px] md:hidden" />` tepat sebelum `<nav>`. Karena komponen ini
sudah tahu pathname, spasi hanya muncul di halaman yang nav-nya benar-benar
tampil — di `/order`, `/account`, `/admin`, `/login`, `/register` nav-nya
sembunyi, jadi spacer ikut hilang dan halaman tidak nambah sia-sia. Di laptop
`md:hidden` bikin nol efek.

### Yang TIDAK berubah

- Kontak tetap tidak ada di nav bawah maupun footer (item 2 tetap berlaku).
- Di HP, kontak ada di `/account`: bar "Kontak" membuka popup, blok "Hubungi
  Kami" lengkap ada di bawah form profil.
- Nav bawah tetap disembunyikan di `/order` (hasil item 6: sticky bar
  keranjang tidak boleh ketimpa).

### Verifikasi

`scripts/check-nav-contact.js` ditambah `FOOTER_PROBE` + 11 assertion, sekarang
**11/11 lulus**:

- Footer tidak ada di HP (390x844)
- Nav bawah ada di HP, top=785 dari 844px, 3 item: Beranda / Pesanan Saya / Akun
- Footer ada di laptop, tinggi 303px
- Nav bawah tidak muncul di laptop
- "Kontak" tidak ada di nav bawah, footer, maupun header
- Popup "Pesan Sekarang" (item 3) masih jalan
- Nav bawah tidak muncul di `/order`
- Sticky bar keranjang tidak terpotong
- Copyright footer penuh sampai bawah di desktop (876px dari 900px)

typecheck 0 error, lint 0 error 0 warning. Screenshot `nav-hp-beranda.png`
dibaca manual: nav bawah terlihat, footer tidak ada.

Verifikasi tambahan:

- `scripts/check-nav-overlap.js` (baru) — scroll ke bawah di viewport 390x844,
  cari elemen teks paling bawah, bandingkan dengan atas nav. Semua halaman
  punya jarak >= 16px.
- `scripts/wait-for-live.js` (baru) — tunggu deploy baru, tandanya dikirim dari
  command line (`node scripts/wait-for-live.js '<substring>'`), jadi tidak bisa
  basi diam-diam. `watch-deploy.js` yang lama salah: tandanya sudah true di
  deploy sebelumnya, jadi dia melaporkan "LIVE" dalam 0,1 menit sebelum deploy
  baru mendarat.
- `scripts/verify-live-item1.js` (baru) — cek HTML produksi dengan cache-buster,
  **19/19 lulus**: footer + nav bawah + isi TAUTAN CEPAT / HUBUNGI KAMI di
  beranda, dan `/order` + `/account` benar-benar tanpa nav maupun spacer.

Catatan: assertion "footer tidak punya link /contact" itu **salah**. Footer
sengaja tetap punya 2 link `/contact` di dalam blok HUBUNGI KAMI (FAQ + Kontak,
`SiteFooter.tsx:102,111`). Itu memang bagian dari blok info toko yang Steven
minta tetap ada di PC. Yang hilang dari footer hanya entri "Kontak" di daftar
TAUTAN CEPAT.

---

## 2026-10-08 — Item 7/8, 9, 10 dokumen "Perbaikan Ruma Komugi 2" + fix StrictMode

**Scope:** feat: admin pickup & delivery, fix: hydration, fix: dev cart reset, fix: sales table

Sambungan dari entri sebelumnya. Steven menjawab 4 pertanyaan (nav bawah, harga
coret, total bayar, menu zona) — jawaban dan dampaknya dicatat di bawah.

### Keputusan Steven

1. **Nav bawah tampil di laptop saja** — sudah sesuai, tidak diubah lagi.
2. **Harga coret bundle diisi sendiri dari menu admin.** Tidak ada kode baru
   yang perlu ditulis: `MenuClient.tsx` sudah punya field `b-compare-price`
   + validasi. Yang belum ada cuma angka di database (`compare_price` NULL).
3. **Item 9 dilewati** — tidak dijawab. Digarisbawahi & diselidiki sendiri
   (lihat di bawah).
4. **Menu admin baru + tabel baru untuk titik toko.** Dikoreksi: tabel
   terpisah TIDAK dibuat, alasannya di bawah.

### Item 9 — "Total bayar masih tidak pas" + "jaraknya masih jauh bgt"

Steven tidak menjawab pertanyaannya, jadi dicek langsung ke data.

**Temuan: angkanya di database BENAR.** Semua 6 order punya
`subtotal + delivery_fee == total_price` (selisih 0). Jadi ini bukan salah
hitung — ini masalah tampilan di tabel transaksi (`SalesClient.tsx`):

- Panel detail yang terbuka hanya menampilkan **"Subtotal"** (dan Ongkir
  kalau > 0) — **tidak pernah menampilkan baris Total**. Di kolom TOTAL yang
  jauh di kanan terlihat "Rp 18.000", jadi yang terbaca hanya "Subtotal
  Rp 18.000" → itulah yang terasa "tidak pas".
- Template kolom `lg:grid-cols-[120px_140px_minmax(0,1fr)_minmax(0,1fr)_120px_...]`
  memberi PELANGGAN **dan** ITEM lebar `1fr` masing-masing. Di layar lebar
  teks ITEM yang pendek ("Cookies & Cream ×1") menyisakan ruang kosong
  raksasa sebelum kolom TOTAL — persis keluhan "jaraknya masih jauh bgt".

**Perbaikan:**
- Baris **Total** penutup ditambahkan di panel detail (border atas tebal).
- Template kolom jadi
  `[130px_140px_minmax(0,1fr)_minmax(0,220px)_110px_minmax(150px,auto)]`
  + `gap-4` → `gap-3`. ITEM dikunci maksimal 220px, sisa ruang ke PELANGGAN.

### Item 10 — Catatan Pengambilan & Pengiriman

**Keputusan desain: TIDAK membuat tabel baru.**

Steven memilih opsi "tabel baru untuk titik toko" — tapi setelah dicek,
`delivery_zones` **sudah punya** kolom `kind` ('delivery' | 'pickup') dari
`migration-32.sql`, lengkap dengan 2 titik pickup di-seed. Tabel terpisah
hanya akan menduplikasi data dan membuat sisi pembeli harus baca dua sumber.
Jadi tabel yang sama diperluas.

**Dua lubang yang ditemukan (dan keduanya nyata):**

1. `admin_upsert_zone` **tidak pernah membaca/menulis kolom `kind`** →
   admin tidak bisa membuat titik toko dari UI; zona baru selalu 'delivery'.
2. `list_active_zones` **tidak mengembalikan `kind`**, padahal
   `src/app/order/page.tsx` → `OrderFlow` memfilter lokasi ambil dengan
   `z.kind === "pickup"`. Akibatnya **pemilih "Lokasi pengambilan" tidak
   pernah muncul untuk pembeli sungguhan.** Ini diverifikasi lewat RPC, bukan
   dugaan.

**`supabase/migration-39.sql`** (sudah apply ke DB produksi):
- Tambah kolom `note_id` / `note_en` (catatan jam ambil per titik).
- `list_active_zones` — expose `kind` + catatan (dipakai pembeli, anon).
- `admin_list_zones` — expose `kind` + catatan.
- `admin_upsert_zone` — **sekarang menyimpan `kind` + catatan**; untuk
  `kind='pickup'` fee dipaksa 0 dan `requires_address` dipaksa false.
- Backfill catatan untuk 2 titik pickup lama.
- Sanity check `do $$ ... $$` yang gagal kalau ada `kind` di luar
  delivery/pickup atau titik pickup dengan fee ≠ 0.
- Semua RPC `security definer` → grant `anon/authenticated/service_role`
  diulang karena `drop function` menghapus ACL.

**Sisi admin:**
- Route baru `src/app/admin/(dashboard)/pickup-delivery/page.tsx` +
  `PickupDeliveryTabs.tsx` — 2 tab: **Ambil di Toko** / **Pengantaran**.
- Menu sidebar baru "Ambil & Kirim" (ikon `Store`).
- Blok zona **dilepas dari `/admin/settings`**.
- `DeliveryZonesClient` dapat prop `kindFilter`; form dapat field
  **Jenis** + 2 textarea **Catatan untuk pembeli (ID/EN)**. Ongkir &
  "titik tetap" disembunyikan untuk titik ambil (nonsense untuk konteks itu).

**Sisi pembeli:**
- `src/app/order/page.tsx` sekarang meneruskan `kind` + catatan (ini yang
  menghidupkan kembali pemilih lokasi pengambilan).
- `OrderFlow` menampilkan catatan di tiap kartu titik ambil.

### Fix tambahan — StrictMode menghapus keranjang saat refresh

**Bug yang paling mengganggu Steven dan tidak terlihat dari kode.**

`OrderFlow` punya effect unmount yang mengosongkan keranjang:

```ts
useEffect(() => () => {
  sessionStorage.removeItem("js_order_step");
  resetRef.current();
}, []);
```

Di `next dev`, React StrictMode (default `true` untuk app router sejak
Next.js 13.5.1 — dikonfirmasi dari `node_modules/next/dist/docs/01-app/
03-api-reference/05-config/01-next-config-js/reactStrictMode.md`)
menjalankan **mount → unmount → mount** saat halaman dibuka. Cleanup itu
jadi ikut jalan **tepat setelah halaman dimuat**, jadi:

- `sessionStorage.js_order_step` terhapus → langkah yang tersimpan hilang,
- `reset()` jalan → **keranjang kosong**.

Efeknya: setiap kali Steven refresh di tengah pesanan, halaman balik ke
"Data Kamu" dan keranjang kosong. Ini sekaligus jadi alasan test E2E
sebelumnya selalu gagal menyuntik `localStorage`.

**Perbaikan:** `reallyMountedRef` di-set lewat `setTimeout(0)`; cleanup yang
datang sebelum timeout itu dianggap probe StrictMode dan dilewati.

### Perbaikan lain — cara menyimpan langkah (hydration-safe)

Menyimpan `js_order_step` lewat `useEffect([step])` ternyata SALAH: effect itu
menimpa nilai tersimpan dengan `steps[0]` **sebelum** React sempat
membacanya, sehingga restore selalu gagal.

Sekarang:
- Penyimpanan pindah ke `goTo()` (satu-satunya pemanggil `setStep`).
- Pembacaan pakai `useSyncExternalStore` (`getServerSnapshot` = `steps[0]`,
  `getSnapshot` = langkah tersimpan) — pola yang sama dipakai `CartProvider`.
  Server & render hydration sama-sama `steps[0]` (tidak mismatch), dan
  React restore sendiri setelah hydration.

### Verifikasi

| Cek | Hasil |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 error, 0 warning |
| `scripts/test-pages.mjs` | **15/15** (+ route `/admin/pickup-delivery`) |
| `scripts/check-step-restore.js` (baru) | 4/4 — refresh tengah pesanan |
| `scripts/check-pickup-delivery.js` (baru) | 16/16 — admin 2 tab + sisi pembeli |
| `scripts/check-nav-contact.js` | 9/9 |
| `scripts/test-bundle-stock-ui.js` | stok 10 → 8, bundle terkunci |
| `scripts/check-zones.js` (baru) | `admin_upsert_zone` sudah menyimpan `kind` |

### Catatan untuk sesi berikutnya

- **`store_settings.pickup_note_id` = "Ruma Sushi & UVERS\n"** — catatan
  pickup global LAMA, isinya cuma daftar nama toko. Sekarang tumpang tindih
  dengan catatan per-titik yang baru. Sudah dikonfirmasi ke Steven supaya
  dia bersihkan atau isi ulang di /admin/settings.
- Login admin di browser CDP **harus klik tombol submit**, bukan
  `form.requestSubmit()` — server action React tidak jalan kalau di-dispatch
  manual. Lihat `scripts/check-pickup-delivery.js`.
- Assertion `mustContain` di `test-pages.mjs` akan gagal kalau mengandung
  `&`, karena di HTML ter-escape jadi `&amp;`.

---

## 2026-10-08 — Dokumen "Perbaikan Ruma Komugi 2": item 1–6 selesai, + fix hydration

**Scope:** fix: ui mobile, fix: desktop nav, fix: hydration, feat: popup kontak & popup tamu

Sumber: dokumen Word `Perbaikan Ruma Komugi 2'.docx` (11 poin). Sesi ini
menyelesaikan item 1, 2, 3, 4, 5, 6 (dan item 11 yang sudah selesai di sesi
sebelumnya). Item 7/8, 9, 10 menunggu keputusan Steven.

### Item 1 — Navigasi bawah hanya di laptop, hilang di HP

Steven: "Pada bagian hp saya tidak ada mau bagian bawah itu, karena info
dibawah nanti ada di bagian akun, tapi untuk laptop tetap harus ada."

- `MobileBottomNav.tsx` → **rename jadi `BottomNav.tsx`** (`git mv` manual).
  Nama lama jadi menyesatkan karena sekarang tampil di desktop.
  Kelas `md:hidden` → `hidden md:block`, list jadi `max-w-6xl px-6`.
- Disembunyikan juga di `/order` (semua `/order*`): alur pemesanan punya
  `CartStickyBar` sendiri yang `sticky bottom-0 z-30`, sedangkan nav situs
  `fixed bottom-0 z-40` — kalau keduanya tampil, bar keranjang ketimpa
  (persis item 6).

### Item 2 — "Kontak" hilang dari navigasi, pindah ke Akun sebagai popup

- Dihapus dari `SiteFooter` (TAUTAN CEPAT) dan `SiteHeader` (nav desktop +
  drawer HP). Isinya sekarang: Menu / Cara Pesan / Pre-order / Cek Pesanan.
- `ContactSection.tsx` dipecah: `ContactDetails` (daftar WA/IG/TikTok/alamat/
  jam, presentasional) dipisah dari `ContactSection` supaya bisa dipakai ulang.
- **Bar baru `ContactMenuRow.tsx`** (client) — bar "Kontak" di `/account` yang
  membuka `Modal` berisi `ContactDetails`. Isi popup dikirim sebagai
  `children` dari server component, jadi blok kontak tetap SSR.
- `HelpMenuGroup` di `app/account/page.tsx` dapat prop `popupRow?: ReactNode`
  untuk merender bar non-link.
- Halaman `/contact` **tidak dihapus** — masih hidup & bisa diakses lewat
  link FAQ di footer dan bar "Cerita Kami"/"Alamat"/"Jam" di Akun.

### Item 3 — Popup kecil saat tekan "Pesan Sekarang"

- `OrderNowLink.tsx`: `<Link href="/order">` → `<button>` + `Modal` berisi dua
  pilihan "Pakai akun" (`openAuthModal("login")`) dan "Pesan sebagai tamu"
  (`router.push("/order")`).
- Kalau pembeli **sudah login**, popup dilewati dan langsung ke `/order`.
- i18n baru `order.guestPrompt.*` di `id.ts` + `en.ts`.

### Item 4 — Bug stok bundle (stok 10, pilih bundle, non-bundle masih 10)

**Akar masalah:** `MenuBrowser` menghitung sisa stok hanya dari `quantities`,
diabaikan `cart.bundles`. `create_order` sendiri mengurangi `categories.stock`
satu pcs per **slot** bundle, jadi UI melenceng.

- **File baru `src/lib/cart-stock.ts`** — `remainingStockByCategory(categories,
  quantities, bundles, extraSlots)` mengurangi 3 sumber: item biasa, slot
  bundle yang sudah di keranjang, slot bundle yang sedang dipilih di modal.
- `OrderBundleModal` + `MenuBrowser` sama-sama pakai helper itu, jadi angka
  "Tersedia N" di modal dan di kartu tidak mungkin berbeda.
- `MenuBrowser` juga nggak lagi `flatMap().find()` di dalam loop.

### Item 5 — Satu bundle hanya boleh sekali di keranjang

- Kartu bundle di `MenuBrowser`: `disabled={inCart > 0}` + chip `Check`
  "Di keranjang" + styling terkunci.

### Item 6 — Sticky bar keranjang ketimpa nav bawah

Disebabkan oleh z-index (nav `z-40` fixed di atas `CartStickyBar` `z-30`
sticky.
- Tertutup oleh item 1 — nav bawah tidak lagi muncul di HP maupun di
  `/order`. `SiteFooter` dapat `md:pb-20` supaya copyright tidak ketimpa nav di
  desktop.

### Fix tambahan — hydration mismatch di `/order`

**Bug produksi nyata, ditemukan kebetulan saat bikin test item 4.**

`OrderFlow` dulu restore step dari `sessionStorage` **di dalam `useState`
initializer**:

```ts
const [step, setStep] = useState<Step>(() => {
  if (typeof window !== "undefined") {
    const saved = sessionStorage.getItem("js_order_step");
    if (saved && steps.includes(saved)) return saved;
  }
  return steps[0];
});
```

Server selalu render `steps[0]`; klien me-restore step tersimpan. Kalau
pembeli **refresh di tengah pesanan** (`js_order_step` = `"menu"`), keduanya
beda → `Hydration failed because the server rendered text didn't match the
client` → React buang seluruh tree & render ulang.

Perbaikan: initializer selalu `steps[0]` (identik dengan server), restore
dipindah ke `useEffect` yang dijaga `restoredStepRef`. Effect-nya **harus
ditempatkan sebelum** effect penyimpan step, kalau tidak ia menimpa
`sessionStorage` dengan langkah pertama sebelum sempat dibaca.

### Verifikasi

| Cek | Hasil |
| --- | --- |
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 error, 0 warning |
| `npm run build` | exit 0, 20 route |
| `scripts/test-pages.mjs` | 14/14 lulus |
| `scripts/test-bundle-stock-ui.js` (baru, E2E) | stok 10 → 8 ✅, kartu bundle terkunci ✅ |
| `scripts/check-nav-contact.js` (baru) | 9/9 lulus |
| `scripts/dump-console.js` (baru) | console bersih, hydration error hilang |
| Route `/`, `/order`, `/contact`, `/track`, `/login`, `/register` | semua 200 |

### Catatan penting untuk sesi berikutnya

- **Test E2E jangan pakai suntik localStorage.** `OrderFlow` mereset keranjang
  di effect unmount (`resetRef.current()`), jadi seed selalu hilang sebelum
  komponen membacanya — sudah dicoba 3 cara dan gagal. Klik UI-nya saja
  (`aria-label="+1 <nama>"` untuk stepper, teks "Tambah ke keranjang" untuk
  tombol awal, "Konfirmasi" untuk footer modal bundle).
- `/order` membuka di **step 01 "Data Kamu"**, bukan daftar rasa. Set
  `sessionStorage.js_order_step = "menu"` lewat
  `Page.addScriptToEvaluateOnNewDocument` untuk langsung ke langkah menu.
- Kartu rasa di `FlavorCard` **tidak** punya tombol `+1` sebelum item masuk
  keranjang — saat `qty === 0` yang dirender tombol "Tambah ke keranjang".
- `check-nav-contact.js` + `dump-console.js` bisa dipakai ulang kapan pun
  (butuh dev server jalan; default `APP_URL=http://localhost:3099`).

---

## 2026-10-08 — Fix kartu menu: deskripsi kembali + baris terjual/disukai rapi

**Scope:** fix: ui mobile, fix: hydration

### 1. Deskripsi rasa hilang di HP

**Akar masalah BUKAN data.** `globals.css` (blok `@media (max-width: 639px)`)
memang sengaja menyembunyikan deskripsi:

```css
.density-flavor-grid > article .flavor-desc { display: none !important; }
```

Selector itu HANYA kena di beranda (`MenuBrowser` membungkus kartu sebagai
`<article>` langsung anak `.density-flavor-grid`). Di `/order` strukturnya
`<li><FlavorCard/></li>` jadi deskripsi sudah tampil di sana — makanya Steven
hanya melihatnya hilang di beranda.

Dicek dulu lewat `scripts/check-flavor-text.js`: 4 dari 5 rasa punya deskripsi
nyata di database. Jadi masalahnya murni CSS.

- `globals.css` — `display: none` diganti `display: block`, font diperkecil
  ke `0.65rem`. Batas 2 baris tetap pakai `line-clamp-2` yang sudah ada di
  `FlavorCard`, jadi kartu tidak jadi terlalu tinggi.

### 2. Baris "terjual" + "disukai" kepotong ("0 terj...", "1 disu...")

Sebelumnya `FlavorCard` menaruh angka terjual/disukai dan tombol "Suka" dalam
satu baris `justify-between`, dan tiap angka diberi `truncate`. Di grid 2 kolom
HP lebarnya cuma ~156px, jadi teks terpotong.

- `FlavorCard.tsx` — baris social jadi `flex-col`: satu baris penuh untuk
  tombol/counter suka, satu baris penuh untuk jumlah terjual. Semua
  `truncate` dihapus.
- **"disukai" sekarang pakai logo hati (Love)** — ikon `Heart` di counter
  suka, jadi jelas itu dislike/suka dan bukan cuma angka.
- Tombol suka tetap jadi pemicu (tappable) dan menampilkan jumlahnya:
  "♡ 2 disuka". Di `/order` (`readOnlySocial`) tombol tidak dirender, hanya
  angkanya — sesuai aturan lama.

### 3. Hydration mismatch di HeroCarousel (tambahan, ditemukan saat verifikasi)

Dev server menandai "1 Issue" yang tidak ada hubungannya dengan kartu menu.
Ternyata `HeroCarousel` membaca `window.matchMedia()` **saat render**:

```tsx
const isMobile = typeof window !== "undefined" && window.matchMedia(...).matches;
```

Server selalu me-render gambar hero versi desktop, client di HP me-render versi
mobile -> React membuang atribut `src`/`srcSet` dan hero bisa berkedip.

- `HeroCarousel.tsx` — `isMobile` jadi `useState(false)` (nilainya sama dengan
  hasil render server), lalu dikoreksi ke kondisi asli lewat `useEffect` +
  listener `matchMedia`. `key={slidesKey}` yang sudah ada tetap dipakai untuk
  me-remount carousel saat daftar gambarnya berganti.

### Catatan data (bukan kode)

Rasa **Cookies & Cream** punya `desc_id = "Test"` dan `desc_en` kosong.
Setelah deskripsi dikembalikan, tulisan "Test" ikut tampil di kartu. Perlu
diisi copy yang sebenarnya lewat Admin > Menu & Stok.

### Verifikasi

- `npm run typecheck` / `lint` / `build` -> exit 0
- `scripts/test-pages.mjs` -> 14 lulus, 0 gagal
- `scripts/check-card-layout.js` (baru, baca geometri DOM asli di viewport
  390px): semua 5 kartu rasa `deskripsi.visible = true`, social
  `flex-direction: column`, tiap baris `clientWidth === scrollWidth`, dan
  daftar elemen kepotong `terpotong: []` -> tidak ada teks yang terpotong.
- Screenshot via `scripts/shoot.js` (baru): kartu sudah tampil deskripsi +
  "♡ N disuka" / "N terjual" tanpa kepotong.
- Log dev server: `GET / 200` tanpa hydration warning lagi, badge "1 Issue"
  hilang.

### Skrip baru

`shoot.js` (screenshot via Chrome DevTools Protocol), `check-card-layout.js`
(ukur overflow teks nyata di DOM), `check-hydration.js` (bandingkan atribut
`src`/`srcSet` server vs client), `check-flavor-text.js` (cek isi kolom bebas
di database).

Gotcha CDP: WAJIB `--disable-extensions` + `--remote-allow-origins=*`, dan
pilih target `type === "page"` yang bukan `chrome-extension://`. Tanpa itu
WebTools nyambung ke background page extension dan `Page.captureScreenshot`
timeout tanpa pernah menghasilkan gambar.

---

## 2026-10-08 — Migration-38: buang RPC mati + verifikasi halaman admin dengan login asli

**Scope:** chore: cleanup, feat: test admin, docs:

### Drop RPC yang terbukti tidak kepakai (migration-38, sudah diterapkan)

Sebelum drop, tiap fungsi dicek pakai `scripts/check-fn-usage.js` (skrip baru):
mencari penyebut nama fungsi di body `pg_proc.prosrc` + dependensi `pg_depend`.
Hasilnya **0 pemanggil di DB, 0 objek dependen, 0 pemanggil dari `src/`**:

| Fungsi | Kenapa mati |
|---|---|
| `customer_upsert_own_profile(text,text,text)` | Versi sebelum ada `p_date_of_birth`. App selalu pakai yang 4-argumen (`src/app/account/actions.ts`). |
| `admin_set_stock(integer,text)` | Sisa model stok global → tulis `store_settings.total_stock`, kolom yang **tidak dibaca siapa pun**. |
| `admin_set_stock(bigint,integer,text)` | Sisa model stok per-flavor → tulis `flavors.stock`, juga tidak dibaca siapa pun. |

Semua pakai `drop function if exists` jadi idempoten. Kalau ternyata ada yang
memanggil, PostgreSQL akan menolak DROP-nya — bukan diam-diam merusak.

Efek: fungsi schema public **69 → 66**, dan sekarang **tidak ada overload
sama sekali** (`scripts/verify-overloads.js`). Yang dipakai aplikasi
(`customer_upsert_own_profile` 4-arg + `admin_set_category_stock`) utuh.

### Kode mati lain

- `src/lib/utils.ts` — `remainingStock()` dan `isSoldOut()` dihapus. Keduanya
  tidak di-import siapa pun, dan keduanya mengasumsikan stok di level flavor,
  padahal model sekarang `categories.stok`. Menjadikannya jebakan.
- `scripts/verify-all-rpcs.js` — bug `ReferenceError: grantee is not defined`
  (baris 51 hilang `g.`) sudah dibetulkan.
- File untracked dari sesi 6 Okt yang sudah tidak berlaku dihapus:
  `function-actual.sql`, `sql-fix.md`, `scripts/check-qris-charges.js`,
  `scripts/test-public-invoice.js`.

### Test admin beneran jalan (14/14 lulus)

Kredensial admin ditaruh di `.env.local` (`ADMIN_EMAIL` + `ADMIN_PASSWORD`),
sesuai yang sudah diharapkan `scripts/test-pages.mjs`. Login sungguhan
lewat Supabase Auth, cookie session dipakai buka 6 halaman dashboard.

**2 kegagalan awal BUKAN bug aplikasi — test-nya yang sudah basi:**
- `/` dicek harus memuat "Japanese Sando". Merek sudah ganti jadi **Rumakomugi**.
- `/admin/settings` dicek harus memuat "Nomor WhatsApp" + "Rekening". Halaman
  settings sekarang **bertab** (`SettingsClient` punya state `tab`, default
  `identity`), jadi HTML server hanya berisi tab yang aktif. Kontak & rekening
  ada di tab lain.

`scripts/test-pages.mjs` sudah diperbaiki + ditambah cakupan
`/admin/sales`, `/admin/vouchers`, `/admin/customers`.

### Skrip baru (semua read-only kecuali apply-migration)

`check-fn-usage.js`, `dump-fn.js`, `describe-table.js`, `verify-overloads.js`,
`check-data-health.js`, `inspect-admin-pages.mjs`, `run-qris-expire.js`.
Plus `apply-migration.js` — Terapkan SATU file migration (kasih path-nya),
supaya tidak perlu `npm run db:push` yang menjalankan schema + semua migration.

### ⚠️ Temuan yang perlu keputusan Steven: Midtrans sudah LIVE di produksi

Entry 2026-10-05 menyebut Midtrans "DORMANT, menunggu credentials" — itu
**sudah tidak akurat**. Dari `npx vercel env ls`:

- `MIDTRANS_SERVER_KEY` → **ada di Production** (dan Development + Preview).
- `MIDTRANS_IS_PRODUCTION` → ada di Production, **nilainya Hidden** (belum
  bisa dipastikan `true` atau tidak).
- `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` → **tidak ada** di Vercel sama sekali.

Karena `/order/page.tsx` mengirim `midtransReady={Boolean(process.env.MIDTRANS_SERVER_KEY)}`,
opsi **"QRIS via Midtrans" sekarang tampil untuk pembeli sungguhan**.

Yang diketahui aman: `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` memang **tidak dibaca
kode mana pun** (sisa dari implementasi Snap API lama; sekarang pakai QRIS
Core API `/v2/charge` yang cukup server key). Jadi tidak ada masalah dari
klien key yang hilang.

Yang **belum terverifikasi**: apakah `MIDTRANS_IS_PRODUCTION` di Vercel bernilai
`"true"`. Kalau bukan, `getBaseUrl()` mengembalikan `api.sandbox.midtrans.com`
-> pembeli Production melihat QR, "membayar" lewat sandbox, uang asli tidak
masuk. Perlu dicek langsung di dashboard Vercel.

### Verifikasi

- `npm run typecheck` / `lint` / `build` -> exit 0
- `scripts/test-pages.mjs` -> **14 lulus, 0 gagal** (login admin sungguhan)
- Smoke test 21 route: publik 200, `/account` + 7 route admin 307 ke login
  (benar), `/api/flavor-like` 405 (POST-only), route tak ada -> 404
- DB setelah migration-38: data utuh (6 order, stok 10, 5 flavor, 1 profil),
  `cron.job` tetap 1 (`qris-expire`, active), `expire_stale_qris_orders()`
  dipanggil langsung -> 0 restock (aman, tidak ada order gantung)

---

## 2026-10-08 — Audit menyeluruh: 58 error lint -> 0, route cron 500 -> 200

**Scope:** chore: lint, refactor: dead code, fix: api route, docs:

### Temuan utama: `npm run lint` SEBELUMNYA GAGAL (58 error)

Workflow lama di `gotchas.md` #10 cuma jalankan `npx eslint src`, jadi error
di luar `src/` tidak pernah terlihat. `npm run lint` (yang jalan semua file)
menghasilkan **58 error**:

- **54 error** `@typescript-eslint/no-require-imports` di `scripts/*.js`.
  Semua skrip utilitas Node sengaja CommonJS (`require("pg")`) supaya bisa
  `node scripts/foo.js` tanpa flag tambahan. Bukan bug.
- **4 error** `react-hooks/set-state-in-effect` di `src/` — ini **bug
  sungguhan** (rules React Compiler baru di `eslint-config-next` 16).

### 4 bug setState-di-effect diperbaiki

1. `ReviewModal.tsx` — `useEffect(() => setOpen(initialOpen), [initialOpen])`.
   **Dead code**: `TrackForm` hanya me-mount modal saat mau dibuka lalu
   `onClose` -> unmount, jadi `initialOpen` selalu `true` selama komponen
   hidup. Effect dihapus (perilaku identik).
2. `EnhancedMapPicker.tsx` — `setResults([])` saat query kosong dihapus.
   Kedua tempat baca `results` sudah `query.trim() ? results : nearby`, jadi
   state-nya memang tidak pernah dirender saat query kosong.
3. `EnhancedMapPicker.tsx` — `setNearby([])` saat query terisi, alasan sama.
4. `InlineMapPicker.tsx` — DI sini `results` dibaca tanpa guard, jadi tidak
   bisa sekadar dihapus. Diganti turunan saat render:
   `const visibleResults = query.trim() ? results : []`. Perilaku dropdown
   (hilang saat input dikosongkan) tetap sama.

### 13 warning dead-code dibersihkan

- `MenuBrowser.tsx` — prop `remainingStock` dihapus dari `MenuBrowser` &
  `OrderMenuBrowser` (sudah dihitung sendiri dari `categories.stock`, lihat
  entry 2026-10-07), plus `openCategoryId`/`activeCategory` yang tidak pernah
  di-set sehingga `activeCategory` selalu `null`.
- `OrderFlow.tsx` — `remainingStock={null}` dihapus dari pemanggilan;
  `useEffect` unmount keranjang sekarang pakai pola `resetRef` (pola yang
  sama sudah dipakai `clearIdentityRef` di file itu) alih-alih menambah
  `reset` ke dependencies.
- `SalesClient.tsx` + `admin/(dashboard)/sales/page.tsx` — prop `flavors`
  tidak pernah dipakai; ikut dihapus `getCategoriesAction()` dari page
  (menghemat 1 query DB per buka `/admin/sales`). Filter per-rasa tetap
  bekerja lewat query param `?flavor=<id>` yang dijawab di DB.
- `admin/actions.ts` — **`setStockAction` dihapus (dead + misleading)**.
  Fungsi ini manggil `admin_set_stock` 2-argumen yang menulis ke
  `store_settings.total_stock`, padahal stok yang dibaca `create_order` dan
  ditampilkan ke pembeli ada di `categories.stock`. UI sudah benar memakai
  `setCategoryStockAction` -> `admin_set_category_stock`.
- `MapModal.tsx` + `AddressPicker.tsx` — prop `initialLabel` dihapus
  ( EnhancedMapPicker tidak pernah menerimanya).
- Import mati: `formatIDR` (FlavorCard), `MapPin` (EnhancedMapPicker),
  `SettingsIcon` (SettingsClient), `EnhancedMapPicker` (MapModal, sudah
  dimuat via `next/dynamic`).
- `account/actions.ts` — `_oauthCodes` dihapus (sisa D26).
- `eslint.config.mjs` — `scripts/**` masuk `globalIgnores`.

### Fix route: `/api/cron/qris-expire` balas 500

Route balas `500 missing_supabase_service_env` kalau
`SUPABASE_SERVICE_ROLE_KEY` tidak ada. Sekarang balas **200** dengan
`{ ok: true, ran: false, reason, note }` — karena penjadwal yang sesungguhnya
adalah job pg_cron di dalam DB (tidak butuh env aplikasi sama sekali), jadi
status 500 menyesatkan.

### Bug di skrip verifikasi

`scripts/verify-all-rpcs.js` baris 51: `console.log(\`${grantee}: ...\`)` —
hilang `g.`, causing `ReferenceError: grantee is not defined` setiap kali
dipakai. Sudah dibetulkan.

### Skrip read-only baru (aman dipakai kapan saja)

`scripts/verify-overloads.js` (deteksi RPC overloading), `scripts/dump-fn.js`
(source function live dari DB), `scripts/describe-table.js` (kolom tabel),
`scripts/check-data-health.js` (ringkasan data inti). Semuanya query
read-only dan gagal gracefully per-baris.

### PENTING: `npm test` TIDAK aman dijalankan

Script yang di-chain `npm test` calling `resetAll()` / `delete from public.orders`
dan men-set `total_stock = 100` — itu **menghapus order produksi**. Pakai
skrip read-only di atas untuk cek kesehatan.

### Verifikasi

- `npm run typecheck` -> exit 0
- `npm run lint` -> exit 0 (0 error, 0 warning)
- `npm run build` -> exit 0, 20 route
- Smoke test 21 route di dev server `:3099`: semua publik 200,
  `/account` + 7 route `/admin/*` -> 307 ke login (benar), `/api/flavor-like`
  405 (POST-only), `/api/midtrans/webhook` 200 (health check), route 404 -> 404.
  Tidak ada error/warning di log dev server.
- DB (read-only): `pg_cron` 1.6.4 terpasang, `cron.job` berisi **tepat 1**
  job `qris-expire` `* * * * *` active. `bundles.compare_price` ada.
  `create_order` potong 3 dari `categories.stock` untuk 1 item + 2 slot
  bundle (dicek transaksi rollback — data produksi utuh).
- Data health: 1 admin aktif, 1 kategori (stok 10), 5 flavor aktif semua
  ada gambar & harga, 1 bundle aktif, 6 order semua punya kode,
  30 RPC `admin_*`, 1 customer profile (phone terisi), 0 order QRIS gantung.

### Catatan (bukan bug, perlu keputusan Steven)

- **RPC overloading.** `customer_upsert_own_profile` punya 2 versi: 3-argumen
  (lama, tanpa `p_date_of_birth`) dan 4-argumen (dipakai app). Versi 3-argumen
  sudah mati tapi belum di-drop. `admin_set_stock` juga 2 versi — itu memang
  disengaja (global vs per-flavor) dan aman karena dibedakan jumlah argumen.
- **Halaman admin belum bisa diuji end-to-end** — `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` tidak ada di `.env.local`, jadi hanya yang bisa dipastikan
  adalah guard 307 + semua route admin compile.

---

## 2026-10-08 — Fix menIMAL: deploy Vercel diam-diam pakai commit lama

### Gejala
Steven melapor 6 masalah yang screenshot-nya masih versi lama: harga masih di
atas foto, kartu masih "Selalu tersedia", WA masih ada di hero, `/contact` 404.

### Akar masalah: BUKAN kode
Log build Vercel (`vercel inspect --logs`) menunjukkan:

```
Cloning github.com/ooraa63/Japanese-Sando (Branch: main, Commit: b94cba3)
```

Deployment 10:14 build commit **b94cba3** (commit Mapbox), padahal
`5039600` sudah ada di GitHub (`git ls-remote` mengonfirmasi). Artinya
GitHub integration Vercel tidak ter-trigger / memakai ref basi. Route list
di build tersebut masih memuat `/admin/announcements` — bukti jelas versi lama.

`/contact` di domain utama balas 404, dan HTML beranda masih punya
`grid-cols-3` di MobileBottomNav + chip WA/alamat di hero.

Workaround: deploy langsung dengan `npx vercel --prod` (upload dari lokal,
melewati git integration).

### Perbaikan UI yang memang baru diminta (commit f7fea73)
- **OrderFlow**: hapus komponen `StockBadge` + pemanggilannya. Badge global
  "Sisa N pcs untuk semua rasa" dihapus — Steven minta sisa stok hanya di tiap
  kartu rasa, bukan satu angka total di header.
- **MenuBrowser**: kartu Flavor di `/order` dapat `showSocial` + `soldCount`,
  jadi counter terjual & jumlah like tampil juga di HP (sebelumnya cuma
  beranda). `soldCounts` diberi default `{}` biar type-safe.

### Cron QRIS: Vercel Cron -> pg_cron
Ternyata plan Vercel Hobby **membatasi cron jadi 2x sehari**, jadi jadwal
`* * * * *` tidak akan pernah dipicu — order QRIS unpaid tetap bisa menggantung
berjam-jam meski deploy sukses.

- `vercel.json` DIHAPUS.
- **migration-37**: `create extension pg_cron`, unschedule job lama, lalu
  `cron.schedule('qris-expire', '* * * * *', 'select public.expire_stale_qris_orders();')`.
  Idempoten: file ini boleh di-run ulang tanpa bikin job ganda (terverifikasi —
  tetap 1 job).
- Route `/api/cron/qris-expire` tetap ada, hanya untuk pemicu manual.
- **Konsekuensi penting**: `SUPABASE_SERVICE_ROLE_KEY` dan `CRON_SECRET`
  tidak lagi WAJIB di Vercel. Cron jalan di dalam database.

### Catatan teknis pg_cron
`cron.schedule()` **tidak boleh** dipanggil di dalam blok `DO` — PostgreSQL
gagal parse (`syntax error at or near "cron"`). Harus statement biasa di level
atas. Percobaan pertama dengan `DO $schedule$ ... $schedule$` gagal karena itu.

### Verifikasi
- `npm run typecheck` + `npm run build` bersih; `/admin/announcements` hilang,
  `/contact` & `/api/cron/qris-expire` ada.
- DB: `pg_cron` terpasang, `cron.job` berisi `qris-expire` `* * * * *` active.
- DB: `categories.stock_enabled = true`, `stock = 11` (Sando Sandwich) —
  jadi data stok sudah benar, murni masalah build lama.

### Gotcha baru
- `git push` ke GitHub BISA sukses sementara Vercel tetap build commit lama.
  Sebelum debugging kode saat site "tidak berubah", cek dulu:
  `npx vercel inspect <deployment-url> --logs | Select-String "Commit:"`.

---
## 2026-10-07 — 13 perbaikan dari review Word "Perbaikan Ruma Komugi"

Steven kirim Word berisi 13 feedback + screenshot. Semuanya dikerjakan dalam satu
commit (`5039600`) plus 3 migration SQL (34/35/36).

### Hapus pengumuman (item 1)
Hapus total: `AnnouncementPopup`, `AnnouncementBar`, halaman
`/admin/announcements`, `AnnouncementsClient`, item sidebar `Megaphone`, 3
server action (`getAnnouncementsAction`/`saveAnnouncementAction`/
`deleteAnnouncementAction`), field `announcement_id`/`announcement_en` di
SettingsClient + `StoreSettings`, dan semua key i18n. Tabel DB `announcements`
dibiarkan (data lama aman, cuma gak ada UI-nya).

### Kontak pindah ke /contact (item 2, 3, 4, 5)
- `ShopInfo` (hero): chip WA/IG/alamat dihapus. Sisa jam buka + batas pre-order
  + 2 shortcut (`/contact#faq`, `/contact`).
- `SiteFooter`: kolom "Hubungi kami" jadi link ke `/contact#faq` & `/contact`.
  Nomor/IG/alamat pindah ke sana. WA & IG tetap sebagai link teks di baris
  copyright.
- Halaman baru `src/app/contact/page.tsx`: section Kontak (WA, IG, jam buka,
  batas pre-order, alamat + link peta), FAQ accordion 6 Q&A hardcoded bilingual,
  Brand Story (dari `store_settings.description_*`), CTA WhatsApp.
- `MobileBottomNav`: 3 -> 4 item, tambah `Headphones` = Kontak.
- `SiteHeader`: link Kontak desktop & mobile -> `/contact` (sebelumnya `/#contact`).
- `/account`: blok baru "Butuh bantuan?" berisi 3 baris menu (FAQ / Kontak /
  Cerita kami) ala Pizza Hut, plus `ContactSection` yang sudah ada tetap.

Key i18n baru: `contactPage.*` + `account.contact.helpTitle`.

### Bundle: harga coret (item 7)
Tiga migration baru:
- **34** - `bundles.compare_price integer` + RPC `expire_stale_qris_orders()`.
- **35** - `public_menu()` dibuat ulang, kirim `compare_price` untuk bundle di
  dalam kategori DAN bundle standalone.
- **36** - `admin_save_bundle()` terima/simpan `compare_price` (invalid kalau
  `<= price` -> disimpan NULL; key yang tidak dikirim pertahankan nilai lama
  supaya toggle cepat admin aman), `admin_list_bundles()` kirim `compare_price`.

Komponen baru `src/components/customer/PriceTag.tsx`: badge diskon (`-25%`) +
harga asal dicoret + harga jual. Dipakai di kartu bundle (beranda & `/order`),
`OrderBundleModal`, dan `FlavorCard`. `MenuClient` dapat input "Harga coret"
opsional dengan validasi.

### Harga & stok (item 8, 10)
- `FlavorCard`: chip harga dihapus dari atas foto -> `PriceTag` di bawah foto,
  ukuran `lg`. Badge diskon tetap di foto. Sisa tinggi kartu tetap balance
  karena stepper masih `mt-auto`.
- **Akar masalah "Selalu tersedia"**: `OrderFlow` mengirim
  `remainingStock={null}` ke `OrderMenuBrowser`, padahal stok itu PER KATEGORI
  (`categories.stock`, dipakai `create_order`). Sekarang `MenuBrowser` menghitung
  sendiri dari `c.stock_enabled` / `c.stock` dan mengurangi isian keranjang,
  jadi kartu menampilkan sisa pcs sebenarnya dan otomatis sold-out.

### QRIS: unpaid tidak masuk antrian produksi (item 6)
- `vercel.json` (baru) - cron `* * * * *` -> `/api/cron/qris-expire`.
- `src/app/api/cron/qris-expire/route.ts` (baru) - proteksi `CRON_SECRET`,
  panggil RPC pakai `SUPABASE_SERVICE_ROLE_KEY`.
- RPC `expire_stale_qris_orders()`: `FOR UPDATE SKIP LOCKED` + pagar
  `stock_restored=false` (aman cron paralel & idempoten). Restock
  **per-kategori** (`categories.stock`) pakai `sum(order_items.quantity)` -
  persis kebalikan dari `create_order`.
- `qris_status='expired'` + `status='cancelled'` -> `admin_list_orders` tetap
  menyembunyikannya dari dashboard.
- `QrisPaymentModal`: panel "Tunggu pembayaran" menjelaskan menutup modal bukan
  membatalkan pesanan; auto-close 2s -> 4s.

### Bug & layout (item 9, 11, 12, 13)
- **Bug keranjang**: `CartStickyBar` `sticky bottom-0` menimpa kartu Flavor
  terakhir (terlihat di screenshot). Section menu step 2 diberi `pb-28`.
- **SalesClient**: kolom "TRANSFER BANK" terpotong - kolom terakhir cuma 100px.
  Sekarang `minmax(150px,auto)` + `whitespace-nowrap`; `minmax(0,1fr)` untuk
  kolom customer/items supaya tidak robek; spacing baris & panel detail dirapikan.
- Beranda: `py-16 lg:py-24` -> `py-12 lg:py-16` di 3 section, CTA `py-14` ->
  `py-10`, `mt-8` -> `mt-6`; footer `mt-20` -> `mt-14`, `py-14` -> `py-12`.

### Fix bonus: db:push idempoten
`migration-25` gagal di-re-run dengan `42P13 cannot change return type of
existing function` karena `list_active_zones()` / `admin_list_zones()` sudah
di-recreate `migration-32` (kolom `kind`) dan `create or replace` tidak boleh
ganti return type. Ditambah `drop function if exists` sebelum keduanya.

### Env yang perlu ditambahkan di Vercel
`SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` (cron Route Handler butuh keduanya).

---
## 2026-10-07 — Migration-30: restore customer_profiles.date_of_birth + fix trigger order

**Bug:** Steven (steven07.zgy@gmail.com) register + login tapi profile gak
terbentuk. UI di `/account` nampilin "Lengkapi profil" card → error "gagal
menyimpan". Semua error kelihatan sebagai "generic" di UI.

Investigasi via DATABASE_URL + `pg`:

1. **Tabel `customer_profiles` di production GAK PUNYA kolom `date_of_birth`.**
   - Schema: `user_id, full_name, phone, instagram, created_at, updated_at, phone_normalized`.
   - Padahal `migration-16.sql` membuat kolom `date_of_birth date check (...)` dan
     semua RPC `customer_upsert_own_profile`, `customer_bootstrap_from_metadata`
     INSERT ke kolom itu → **raise `column "date_of_birth" does not exist`
     (SQLSTATE 42703)**.
   - Kemungkinan: kolom di-drop manual tanpa nyanggun SQL DROP, atau basis
     SQL yang dipakai restore cuma dari `schema.sql` lama (snapshot sebelum
     migration-16 — schema.sql gak menyebut customer_profiles sama sekali).

2. **Trigger `trg_customer_profiles_guard_phone_unique` punya bug fire-order**
   - Comment migration-23: *"Normalisasi selalu di-set oleh trigger sebelumnya"*.
   - Tapi Postgres BEFORE triggers fire alphabetical. 'guard' < 'set' →
     guard duluan dengan `phone_normalized` masih NULL → raise `invalid_phone`.
   - Sebelumnya gak ke-expose karena (1) sudah block duluan dengan error
     kolom date_of_birth.

3. **Customer lama & baru kena dampak:**
   - Signup dengan Confirm email OFF: `customer_upsert_own_profile` selalu fail
     di kolom date_of_birth → `signOut` + return `generic`. User bingung.
   - Signup dengan Confirm email ON: `signUp.session null` → return
     `requiresVerification`, profile gak dibuat. Setelah verifikasi + login,
     bootstrap best-effort gagal juga → no profile. `/account` redirect loop
     (sudah di-fix e02ac68 → CompleteProfileCard), submit CompleteProfileCard
     juga gagal.

**Fix `supabase/migration-30.sql`:**

1. `ALTER TABLE customer_profiles ADD COLUMN IF NOT EXISTS date_of_birth date CHECK (... <= current_date)`
2. Backfill `date_of_birth` dari `auth.users.raw_user_meta_data->>'date_of_birth'`
   untuk row existing (kalau format ISO valid).
4. `CREATE OR REPLACE FUNCTION customer_profiles_guard_phone_unique()` —
   self-sufficient: hitung `phone_normalized := normalize_phone(phone)` --
   sendiri kalau belum di-set, jadi gak bergantung fire-order trigger lain.

`scripts/db-push.mjs` di-update agar `migration-30.sql` terdaftar.

**Verifikasi langsung via DB:**

- `ALTER TABLE` sukses, kolom `date_of_birth (date)` muncul di info_schema.
- `CREATE OR REPLACE FUNCTION` sukses, trigger `customer_profiles_guard_phone_unique`
  prosrc mengandung baris `new.phone_normalized := public.normalize_phone(new.phone)`.
- Manual `INSERT INTO customer_profiles` dengan data Steven →
  `phone_normalized` auto-set ke `6289614128890`, row tersimpan.

Setelah ini user Steven bisa login → `/account` langsung render profile
normal karena customer_profiles row sudah ada.

---

## 2026-10-07 — Fix /account blank karena redirect loop (post-OAuth-hapus)

**Bug:** Setelah commit `da8b090` (hapus Google OAuth) + migration-29
(`customer_bootstrap_from_metadata` jadi strict require phone), user yang
login pertama kali tapi `customer_profiles` row tidak dibuat akan loop:

```
/account → (getCustomerProfile() = null) → redirect /login?next=/account
/login  → (user masih login)         → redirect /account
/account → ...                       → LOOP (ERR_TOO_MANY_REDIRECTS, blank)
```

`MEMORY/CHANGELOG.md` lama (entry 94) sebenarnya sudah pernah memfix ini dengan
`CompleteProfileCard.tsx` + `customer_profile_needs_completion()` — tapi file
component dihapus saat Google OAuth dihapus.

**Fix:**

1. **Restore `src/components/customer/CompleteProfileCard.tsx`** dengan
   teks yang sudah disesuaikan (gak sebut Google lagi, tapi "akun kamu sudah
   aktif, data identitas belum lengkap" — relevan untuk edge case signup dengan
   Confirm email ON + metadata tidak lengkap).
3. **Refactor `src/app/account/page.tsx`:**
   - Cek `supabase.auth.getUser()` lebih dulu. Kalau tidak ada user →
     `redirect("/login?next=/account")`.
   - Kalau ada user tapi profile null → coba `customer_bootstrap_from_metadata`
     best-effort, lalu re-fetch profile.
   - Kalau masih null → render `CompleteProfileCard` (form "Lengkapi profil"
     yang submit via `updateCustomerProfileAction`). BUKAN redirect.
   - Kalau bootstrap berhasil → render halaman /account normal.
4. Extract helper `renderAccount()` supaya dua branch (profile ada vs
   bootstrap baru jadi ada) gak duplicate JSX.

**Mengapa perlu:** meskipun flow saat ini `/register → /account` idealnya
selalu bikin profile (Confirm email OFF + `customer_upsert_own_profile`
sync), kalau Confirm email ON atau RPC gagal, login jalan → bootstrap
best-effort jalan di `signInCustomerAction` — kalau itu gagal, tanpa fix
ini user stuck.

**File diubah:**

- `src/components/customer/CompleteProfileCard.tsx` — dibuat ulang.
- `src/app/account/page.tsx` — logika redirect diganti, render fallback
  saat profile null + user login.

---

## 2026-10-07 — Hapus Google OAuth total

**Mengubah (commit `da8b090`):**

1. **Google OAuth dihapus total.** Site pakai single signup/login flow:
     - `/register` → nama + phone + email + dob + IG + password (semua wajib)
     - `/login` → email + password
   - Alasan: Google OAuth di flow Steven = orphan account (auth.users row dibuat tanpa password, customer_profiles row dengan phone NULL). Setiap email & phone hanya boleh didaftarkan sekali (migration-22/23), jadi OAuth user gak fit di flow itu.

2. **File dihapus:**
   - `src/lib/googleAuth.ts` (GIS client-side helper)
   - `src/components/customer/CompleteProfileCard.tsx` (workaround OAuth — "Lengkapi profil kamu" form)

3. **File diubah:**
   - `src/app/login/CustomerAuthForm.tsx` — hapus tombol "Lanjut dengan Google", `GoogleGlyph` component, `oauthWithGoogle` function. Ganti dengan komentar menjelaskan kenapa gak ada OAuth.
   - `src/app/account/actions.ts` — hapus `signInWithOAuthAction` & `signInWithGoogleIdTokenAction`. Kode error `oauth_unavailable`/`oauth_failed` dipertahankan untuk kompat mundur di `humanize()`.
   - `src/app/account/page.tsx` — revert: kalau profile null → redirect ke `/login?next=/account` (gak ada branch CompleteProfileCard lagi).
   - `src/lib/i18n/{id,en}.ts` — hapus `withGoogle`, `withGithub`, `withApple`, `withFacebook`, `orWith`, `oauthUnavailable`.
   - `.env.example` — hapus section Google OAuth, fix `NEXT_PUBLIC_SUPABASE_ANON_KEY` → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nama baru).
   - `src/components/customer/OrderFlow.tsx` — ganti komentar referensi Google OAuth jadi "signup via /register".
   - `scripts/db-push.mjs` — include migration-29.

4. **DB migration baru:**
   - `supabase/migration-29.sql` — revert migration-27:
     - `customer_profiles.phone` jadi NOT NULL lagi
     - `customer_bootstrap_from_metadata()` strict: raise `invalid_phone` kalau phone kosong
     - DROP RPC `customer_profile_needs_completion()`
     - Pre-step: `delete from customer_profiles where phone is null` (cleanup baris orphan dari testing OAuth).

**Verifikasi flow:**
- `npx tsc --noEmit` → **0 errors**
- `npx next build` → **19 routes compile**
- Dev server smoke test: `/`, `/register`, `/login`, `/order` 200; `/account` 307 → `/login?next=/account`.

**Action manual yang perlu Steven:**
- `npm run db:push` (apply migration-29 ke Supabase DB)

---

## 2026-10-07 — Skip identity step (logged-in) + hapus Top laris + QRIS hidden

1. **Pre-order skip identity step untuk user login** (commit `4fe5c47`):
   - `OrderFlow.tsx` — `STEPS` jadi `FULL_STEPS=[identity, menu, payment, review]` & `LOGGED_IN_STEPS=[menu, payment, review]`. Step list dipilih via `stepsFor(profileComplete)`.
   - `isProfileComplete(p)` = `!!(p?.user_id && p.full_name && p.phone)` — kalau ada field kosong (mis. OAuth user belum lengkapi phone), tetap lewat identity dulu.
   - sessionStorage restore: filter supaya saved step yang tidak applicable (mis. "identity" setelah login) di-drop, fallback ke `steps[0]`.
   - Tombol "Edit" di review row name/phone: redirect ke `/account` kalau login, ke step identity kalau guest.
   - Stepper UI (mobile pill + progress bar + desktop numbered circles) pakai `steps.length` yang dinamis (3 atau 4).

2. **Hapus FeaturedShowcase** (commit `4fe5c47`):
   - `page.tsx` — hapus import & featuredFlavors computation & render block.
   - File `FeaturedShowcase.tsx` di-trash.
   - User: "Top laris dihapus aja itu tidak terlalu butuh".

3. **QRIS unpaid disembunyikan dari antrian seller** (commit `4fe5c47`):
   - `migration-28.sql`:
     - `admin_list_orders`: filter `payment_method != 'qris_midtrans' OR qris_status = 'paid'`.
     - `admin_dashboard_stats`: `pending_orders` & `total_orders` exclude QRIS unpaid.
     - Index `orders_payment_qris_status_idx` untuk performa.
   - Aturan flow:
     - Transfer → order masuk dashboard → seller manual accept/reject (sudah ada).
     - QRIS Midtrans → order dibuat `pending` + `qris_status='pending'` → invisible di seller → Midtrans webhook → `set_order_qris_status('paid')` → status auto `accepted` → seller lihat di dashboard.
     - QRIS expired/failed/cancelled → status auto `rejected` (sudah ada di migration-16).

**Verifikasi flow:**
- `npx tsc --noEmit` → **0 errors**.
- `npx next build` → **19 routes compile**.
- Dev server smoke test (`localhost:3099`): `/`, `/order`, `/admin`, `/admin/orders` semua 200.

**Migrasi DB baru:** `supabase/migration-28.sql` (admin_list_orders & admin_dashboard_stats filter + index).

---

## 2026-10-07 — Cleanup pass: mojibake + font-size mobile-only + OAuth complete-profile

**Mengubah:**

1. **Fix karakter rusak (mojibake UTF-8)**:
     - `DashboardClient.tsx:241` — `Â·` → `·`, `Ã—` → `×`.
     - `OrderFlow.tsx:76, 1081-1082, 1634, 1783` — `Ã¢â‚¬â€` → `—`, `�` → `·`.
   - Sumber: file di-edit di editor yang salah encoding (Windows-1252 / Latin-1) sebelumnya. Sekarang sudah bersih — `grep -P 'Ã|â€|Â'` di seluruh `src/` return 0.

2. **Simplify font-size: mobile-only** (commit `dfc022d`):
   - Hapus `FontSizeToggle` & `FontSizeProvider` (toggle 2 state: normal / compact).
   - `globals.css` `@media (max-width: 639px)` sekarang selalu pakai mode compact (font-size 14px, kartu flavor 2 kolom, dsb.). Selector `html[data-density="compact"]` dihapus.
   - User: "fitur ini dihapus, semua pakai yang kecil aja (di hp)".
   - `SiteHeader.tsx` dihapus import + 2 instance FontSizeToggle.

3. **/account blank state fix** (commit `dfc022d`):
   - Sebelumnya: user login Google → `customer_bootstrap_from_metadata` raise `invalid_phone` (Google gak kirim phone) → customer_profiles row tidak dibuat → /account `getCustomerProfile()` return null → redirect ke /login.
   - `migration-27.sql`: `customer_profiles.phone` jadi nullable, bootstrap lebih toleran (skip validasi phone, tetap insert dengan phone NULL), RPC helper `customer_profile_needs_completion()` untuk deteksi.
   - `src/components/customer/CompleteProfileCard.tsx` (baru): form "Lengkapi profil" yang muncul di /account kalau user login tapi profile.phone NULL. Auto-fill nama dari Google `user_metadata.full_name`/`name`. Submit → `customer_upsert_own_profile` → profile lengkap.
   - `src/app/account/page.tsx`: kalau `getCustomerProfile()` null tapi `supabase.auth.getUser()` ada user → render CompleteProfileCard, bukan redirect.

4. **Misc cleanup**:
   - `FlavorCard.tsx`: hapus `replace("{n}", "")` yang sia-sia di soldCount/likesCount (template sudah tidak punya placeholder).
   - `SettingsClient.tsx`: `placeholder="Japanese Bake &amp; Pastry"` → `"Japanese Bake & Pastry"` (HTML-encoded ampersand di JSX).
   - `OrderFlow.tsx`: auto-fill email dari `profile.email` di samping name/phone/IG.
   - `account/actions.ts`: hapus duplicate `CustomerActionResult` interface.

**Verifikasi flow:**
- Build `next build` lulus — 19 routes compile.
- Dev server `next dev -p 3099`: `/`, `/order`, `/login`, `/track`, `/register`, `/admin/*`, `/account` (307 → /login, benar) semua return 200.

**Migrasi DB baru:** `supabase/migration-27.sql` (phone nullable + bootstrap toleran + helper RPC).

---

## 2026-10-06 — 7 fitur baru diminta user

**Mengubah:**

1. **#7 QRIS Download** (sudah selesai):
   - `QrisPaymentModal.tsx`: tambah tombol `<Download>` + `downloadQr()` dengan `<a download>` anchor.
   - `i18n`: tambah `download` & `downloaded` strings.

2. **#4 Cart step persistence + reset on leave**:
   - `OrderFlow.tsx`: state `step` di-persist ke `sessionStorage` (bukan localStorage). Pakai sessionStorage biar gak ke-carry antar-tab. Refresh di step "Pilih rasa" tetap di sana. Saat user leave page (component unmount), `cart.reset()` + hapus session key.
   - Karena pakai sessionStorage (gak persist), privacy aman — gak ada identitas yg nyangkut.

3. **#5 Mobile bottom menu bar**:
   - `src/components/customer/MobileBottomNav.tsx` (baru): Home / Order / Account, hidden di md+, hidden di route admin/login/register/account/order/success/order/track (jadi gak ganggu flow order).
   - Di-import di `src/app/layout.tsx`.

4. **#1 Halaman Mutasi Penjual** (sales ledger):
   - `supabase/migration-20.sql`: RPC `admin_list_mutasi(p_from_date, p_to_date, p_flavor_id, p_search, p_limit, p_offset)`. Filter per-rasa via EXISTS di order_items. Revenue dihitung dari status `accepted | ready | delivered`. Output `{summary, transactions, total}`.
   - `src/app/admin/(dashboard)/sales/page.tsx`: baca query string `?from=&to=&flavor=&q=`, panggil action, pass ke client.
   - `src/components/admin/SalesClient.tsx`: 4 summary cards (revenue / today / orders / pcs), top 5 rasa, filter bar (tanggal + rasa + search + reset), tabel transaksi dgn expand per item, CSV export.
   - `AdminShell.tsx`: icon `TrendingUp` + entry `sales: dicts.admin.nav.sales`.
   - `src/lib/types.ts`: `SalesSummary` & `SalesTransaction` interfaces.
   - `src/app/admin/actions.ts`: `getMutasiAction(params)`.

6. **#6 Review/Comment system**:
   - `supabase/migration-21.sql`: tabel `order_reviews (id, order_id FK UNIQUE, customer_name, rating 1-5, comment, is_visible, created_at)`. RPC `submit_review`, `list_reviews`, `has_review`.
   - `src/app/review-actions.ts`: `submitReviewAction`, `hasReviewAction`, `listReviewsAction`.
   - `src/components/customer/ReviewModal.tsx`: pop-up dgn star rating + textarea, success screen.
   - `src/components/customer/ReviewsSection.tsx`: server component, tampilkan avg rating + 6 review terbaru.
   - `src/components/customer/TrackForm.tsx`: jika status `delivered` & `has_review=false`, auto-open modal (dan tombol "Tulis ulasan" eksplisit).
   - `src/app/page.tsx`: tambah section reviews antara "Cara Pesan" dan CTA.

2. **#2 Dedup customer_profiles** (DB):
   - `supabase/migration-22.sql`: tambah kolom `phone_normalized`, backfill dari `normalize_phone(phone)`, HAPUS baris duplicate (keep oldest by created_at), UNIQUE index pada `phone_normalized` (WHERE not null). Trigger auto-populate phone_normalized saat INSERT/UPDATE.

3. **#3 Signup validation** (1 email + 1 phone):
   - `supabase/migration-23.sql`: RPC `is_phone_available(p_phone, p_exclude_user_id)` (security definer, stable). Trigger `customer_profiles_guard_phone_unique` tolak baris yang penalti phone_normalized bentrok dengan user berbeda.
   - `src/app/account/actions.ts`: pre-check `is_phone_available` sebelum signup. Kalau false → return `phone_taken`. Map error `phone_already_registered` ke `phone_taken`.
   - `i18n`: tambah `auth.errors.phoneTaken` di id & en.

**Mengapa:** User request original 7 sekaligus.

**Tidak diubah:**
- `auth.users.email` sudah UNIQUE di DB level. Supabase Auth akan reject signup kedua → "already registered" → di-handle `email_taken` (sudah ada).
- `orders.customer_email` & `customer_phone` tidak di-dedup — satu customer bisa memesan berkali-kali (ini by design).

---

## 2026-10-05 — Hapus QRIS Statis (sekarang cuma Transfer Bank + QRIS Midtrans)

**Mengubah:**

- `src/components/customer/OrderFlow.tsx`:
  - Hapus `ChoiceCard` untuk `qris_static` dari payment options.
  - Hapus `<option value="QRIS">QRIS</option>` dari transfer-method dropdown.
  - Hapus block static-QR (`<QrImage src={settings.qris_image_url} />` + heading).
  - Hapus helper `QrImage` + import `QrCode` dari lucide-react.
  - Update PaymentMethod cast type: `"transfer" | "qris_static" | "qris_midtrans"` → `"transfer" | "qris_midtrans"`.
  - Update review-row display: hapus branch `qris_static`.
  - Update fallback `bank_accounts.length === 0`: hapus `&& !settings.qris_enabled` (gak relevan lagi).
  - Update komentar dari "// Cabang transfer / qris_static" jadi "// Cabang transfer".
- `src/lib/types.ts`:
  - `PaymentMethod` = `"transfer" | "qris_midtrans"` (hapus `qris_static`).
  - StoreSettings masih punya `qris_enabled` & `qris_image_url` (DB compat — kolom gak di-drop).
- `src/lib/i18n/{id,en}.ts`:
  - Hapus `payment.qris`, `payment.qrisStatic`, `payment.qrisStaticDesc` (dead strings).
  - Hapus `admin.settings.qrisEnabled`, `admin.settings.qrisImage`, `admin.settings.uploadQris`.
  - Keep `payment.qrisUnavailable` (masih dipakai sebagai fallback kalau `bank_accounts` kosong).
- `src/components/admin/SettingsClient.tsx`:
  - Hapus section "QRIS" (toggle + image field) — admin gak perlu enable static QR lagi.
  - Hapus helper `QrisField` + import `QrCode`.
  - `qris_enabled` & `qris_image_url` tetap ada di form Draft (initial values) supaya nilai di DB gak ke-overwrite saat save.

**Mengapa:**

User minta: "QRIS statis hapus aja, next ga pakai statis". Alasan: QRIS Statis admin-upload manual confirm-nya ribet (admin harus cek WA manual tiap order), dan sekarang sudah ada QRIS Dinamis via Midtrans yang auto-confirm. Statis jadi gak perlu.

**Tidak diubah (DB compat):**

- Kolom `store_settings.qris_enabled` & `store_settings.qris_image_url` masih ada di schema (gak di-drop via migration). Kalau nanti mau dimatiin total, butuh migration baru.
- Migration-18 masih allow `payment_method='qris_static'` di constraint. Old orders dengan value itu masih valid di DB; cuma gak ada cara bikin baru dari UI.
- Kolom `orders.qris_*` (transaction_id, status, qr_url, expires_at) tetap — itu untuk Midtrans.

**Verifikasi:**

- `npx tsc --noEmit` — zero errors
- `npx eslint src` — zero errors / warnings
- `npx next build` — sukses, semua route ter-generate
- `/order` payment step sekarang cuma muncul 2 opsi: **Transfer Bank** + (kalau env Midtrans ada) **QRIS via Midtrans**.

---

## 2026-10-05 — Midtrans QRIS Dinamis (DORMANT, menunggu credentials)

> **Update 23:46** — Steven input Sandbox credentials (Server + Client Key) ke
> `.env.local`. `isMidtransConfigured()` sekarang return `true` di local.
> Production Vercel masih dormant (env belum di-set di Vercel dashboard).
> Kedua key sudah masuk chat history; akan di-regenerate sebelum go-live.

**Scope:** feat: payment qris midtrans (code-ready, env belum di-set)

**Scope:** feat: payment qris midtrans (code-ready, env belum di-set)

**Status:** Code sudah committed ke `main`, tapi **belum aktif di production** karena:

- `MIDTRANS_SERVER_KEY` belum di-set di `.env.local` maupun Vercel
- `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` belum di-set
- `MIDTRANS_IS_PRODUCTION` default `false` (sandbox), belum relevan

**Efek:** `isMidtransConfigured()` return false → `midtransReady` prop di `OrderFlow` = false → opsi **"QRIS via Midtrans"** otomatis tersembunyi dari payment step. Customer cuma melihat **Transfer Bank** + **QRIS Statis**. Tidak ada HTTP call ke Midtrans API. Webhook route `/api/midtrans/webhook` ada tapi idle.

**Mengubah (sudah di-commit):**

- `supabase/migration-18.sql` — kolom `orders.qris_*` + RPC `set_order_qris_charge`, `set_order_qris_status`, `public_order_qris_status`.
- `src/lib/midtrans/server.ts` — `chargeQris`, `getOrderStatus`, `mapMidtransStatus`, `verifyWebhookSignatureAsync`, `isMidtransConfigured`.
- `src/app/account/qris-actions.ts` — `createQrisOrderAction`, `checkQrisStatusAction`.
- `src/app/api/midtrans/webhook/route.ts` — POST handler verify signature + update status.
- `src/components/customer/QrisPaymentModal.tsx` — QR display + countdown + polling 5s.
- `src/lib/types.ts` — tambah `QrisInfo` type.
- `src/lib/i18n/{id,en}.ts` — string QRIS Midtrans (id/en).
- `src/components/customer/OrderFlow.tsx` — radio QRIS Midtrans + QR modal + polling.
- `src/app/order/success/[code]/SuccessClient.tsx` + `src/app/order/track/[code]/TrackClient.tsx` — tampilkan status QRIS.
- `.env.example` — 3 vars Midtrans: `MIDTRANS_SERVER_KEY`, `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`.
- `docs/MIDTRANS.md` — setup guide lengkap (sudah di-commit).
- `MEMORY/decisions.md` — Tambah D12 (Midtrans QRIS integration).

**Mengapa dormant:** Steven (developer) ingin pakai akun Midtrans-nya sendiri untuk development & testing, tapi aktivasi menunggu keputusan klien. Akun Midtrans yang sudah terdaftar = akun developer (sandbox). Klien nanti akan swap credentials saat production.

**Cara aktivasi (3 langkah manual di dashboard):**

1. **Login ke** https://dashboard.midtrans.com → pastikan environment = **Sandbox** dulu.
3. **Settings → AccessKeys** → copy:
   - `MIDTRANS_SERVER_KEY` (prefix `SB-Mid-server-...`)
   - `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY` (prefix `SB-Mid-client-...`)
4. **Settings → Configuration → Payment** → set **Payment Notification URL**:
   ```
   https://<domain>/api/midtrans/webhook
   ```
5. **Set env di project:**
   - `.env.local`: paste 2 keys di atas, `MIDTRANS_IS_PRODUCTION=false`
   - Vercel → Project Settings → Environment Variables → paste Production env yang sama (saat go-live set `MIDTRANS_IS_PRODUCTION=true`)
6. **Test end-to-end** via https://simulator.sandbox.midtrans.com sebelum flip production.

Setelah env di-set → Vercel auto-redeploy → opsi QRIS Midtrans otomatis muncul di payment step.

---

## 2026-10-05 — Akun buyer: DOB wajib, verifikasi email, skip identitas kalau login

**Mengubah:**

- `supabase/migration-16.sql`
  - `customer_profiles` tambah kolom `date_of_birth date` (nullable, ≤ today, untuk promo ulang tahun).
  - `customer_upsert_own_profile` tambah parameter `p_date_of_birth date default null`.
  - `customer_profile` return `date_of_birth` di JSON.
  - RPC baru `customer_bootstrap_from_metadata()` — membuat `customer_profiles` row dari `auth.users.raw_user_meta_data` untuk flow "Confirm email ON" (signup → verifikasi → login → bootstrap).
- `src/lib/types.ts` — `CustomerProfile.date_of_birth: string | null`.
- `src/app/account/actions.ts`:
  - `signUpCustomerAction` — validasi DOB (ISO date, usia min 13), simpan semua field ke `options.data` (Supabase user_metadata), detect `signUp.session`:
      - ada (Confirm email OFF) → langsung `customer_upsert_own_profile`
      - null (Confirm email ON) → return `{ok: true, requiresVerification: true}` (UI tampilkan banner "cek inbox")
  - `signInCustomerAction` — detect error "Email not confirmed" → return `email_not_verified`. Setelah login sukses, best-effort call `customer_bootstrap_from_metadata` kalau profil belum ada.
  - `updateCustomerProfileAction` — sekarang menerima `dateOfBirth`.
- `src/app/login/CustomerAuthForm.tsx`:
  - Tambah field **date_of_birth** di mode register (icon `Cake`, max=today).
  - State `verifyBannerShown` + banner matcha "Cek kotak masuk" saat signup butuh verifikasi (auto-dismiss 30 detik).
  - Handle error code baru: `email_not_verified`, `invalid_date_of_birth`.
- `src/app/account/AccountClient.tsx` — field **Tanggal lahir** di form profil (`type=date`, max=today, defaultValue dari `profile.date_of_birth`).
- `src/components/customer/OrderFlow.tsx`:
  - Step awal: `useState<Step>(profile ? "menu" : "identity")` — buyer login langsung ke "Choose flavors", tidak perlu step identitas.
  - **Hapus banner "Value bundles — N bundle available"** di step identitas (per request user).
- `src/lib/i18n/{id,en}.ts`:
  - Subtitle `/order` jadi "Optional account. Takes about a minute." (id: "Boleh pakai akun, boleh juga tidak. Cuma butuh satu menit.").
  - `customerAuth.register`: tambah `dateOfBirth`, `dateOfBirthHint`, `verifyEmailTitle`, `verifyEmailDesc`, error `invalidDateOfBirth`.
  - `customerAuth.login.errors`: tambah `emailNotVerified`.
  - `account.profile`: tambah `dateOfBirth`.
- `src/components/customer/OrderFlow.tsx` — hapus import `Gift` (sudah tidak dipakai setelah banner dihapus).

**Mengapa:**

1. **DOB wajib di signup**: Promo ulang tahun butuh tanggal lahir. Validasi usia min 13 (mengikuti eCommerce umum). Hanya tahun lahir yang dipakai di email marketing, sesuai UX best-practice.
2. **Verifikasi email**: User minta "verifikasinya harus dari email". Implementasi: `signUp` + simpan field ke `user_metadata`; RPC `customer_bootstrap_from_metadata` membuat profil dari metadata setelah user verifikasi + login. Login detect "Email not confirmed" dari Supabase Auth.
3. **Skip identitas kalau login**: Identitas sudah ke-isi otomatis dari profil, jadi step "Your details" cuma guest-flow. Mengurangi 1 klik untuk buyer yang sudah punya akun.
4. **Hapus banner Value bundles**: Visual noise di step identitas — info bundle cukup ditampilkan di step "Choose flavors" saja.

**Verifikasi:**
- `npx tsc --noEmit` — zero errors
- `npx eslint src` — zero errors / warnings
- `npx next build` — sukses

**Catatan penting:**

- Supabase project **harus** aktifkan "Confirm email" di dashboard
  (Authentication → Providers → Email → Enable Confirm email = ON).
  Sebelumnya di `MEMORY/gotchas.md` #13 kami nyaran OFF — sekarang
  dibalik. Lihat juga `MEMORY/gotchas.md` #13 update.
- Admin signup juga akan kena edurmend verifikasi (karena pakai pola
  signUp yang sama). Setelah admin signup, admin perlu cek email untuk
  link verifikasi. Tidak ada perubahan kode admin create_side_action yang
  signifikan — sesi null cuma membuat admin harus login ulang setelah
  verifikasi, bukan masalah besar.
- Flow signup: form submit → Supabase kirim email → UI banner matcha
  "Cek kotak masuk" → user klik link → user kembali ke /login → login
  sukses → bootstrap profile → redirect ke tujuan.
- Setelah `npm run db:push` jalan, kolom `date_of_birth` akan dibuat.
  Untuk data lama (kalau pernah ada customer_profiles baris sebelum
  update ini), DOB akan NULL — UI tampilkan input kosong, user bisa
  update manual di /account.

---
## 2026-10-05 — Akun buyer (login/register/guest) + auto-fill identitas

**Scope:** feat: akun buyer, feat: halaman /account

**Mengubah:**

- `supabase/migration-16.sql` *(file baru)* — Tabel `customer_profiles` (link ke `auth.users`), kolom `orders.user_id` (nullable, FK ke `auth.users`), index di phone+user_id. RLS: customer hanya bisa SELECT/UPDATE profil sendiri + order miliknya sendiri. RPC baru: `customer_upsert_own_profile(p_full_name, p_phone, p_instagram)`, `customer_orders()`, `customer_profile()`. Update `create_order` jadi terima `p_user_id` dan isi `orders.user_id` dari `coalesce(auth.uid(), p_user_id)` — tampering dari client tidak berguna.
- `src/lib/types.ts` — Tambah `CustomerProfile` + `CustomerOrderSummary`.
- `src/lib/data.ts` — `getCustomerProfile()` (cached) + `getCustomerOrders()` (cached).
- `src/app/account/actions.ts` *(file baru)* — Server actions: `signUpCustomerAction`, `signInCustomerAction`, `signOutCustomerAction`, `updateCustomerProfileAction`. Validasi input manual sebelum panggil Supabase; signup flow dua-langkah (auth.signUp + RPC upsert profile) dengan rollback signOut kalau profil gagal.
- `src/components/customer/CustomerAuthProvider.tsx` *(file baru)* — Context React + `useCustomerAuth()` hook. Pakai pola yang sama dengan `CartProvider`/`FontSizeProvider` (SSR-safe). Reaktif ke `supabase.auth.onAuthStateChange`. Support `initialProfile` dari server agar render pertama tidak flicker.
- `src/app/layout.tsx` — Pasang `<CustomerAuthProvider>` di dalam CartProvider. Ambil `initialProfile` via `getCustomerProfile()` di root layout.
- `src/components/customer/SiteHeader.tsx` — Tombol "Masuk" (guest) vs "Akun saya / nama depan" (logged in) di header desktop + mobile drawer. Pakai `useCustomerAuth()` untuk reaktif.
- `src/components/customer/OrderFlow.tsx` — Auto-fill nama/telepon/IG dari `useCustomerAuth().profile` saat mount (hanya kalau field masih kosong; ref `autoFilledFromRef` mencegah overwrite). Banner salam "Hai, X" di step identity. Kirim `p_user_id` ke RPC `create_order`.
- `src/app/login/page.tsx` *(file baru)* + `src/app/register/page.tsx` *(file baru)* — Halaman auth. Server component yang redirect ke `/account` kalau user sudah punya sesi. Pakai `CustomerAuthForm` shared.
- `src/app/login/CustomerAuthForm.tsx` *(file baru)* — Form login & register. Dipakai kedua halaman. Mode detection dari prop `mode: "login" | "register"`. Handle error dari server action. Akses i18n union via helper `errorFor(code)` untuk hindari narrowing.
- `src/app/account/page.tsx` *(file baru)* + `src/app/account/AccountClient.tsx` *(file baru)* — Halaman `/account`. Server-side: redirect ke `/login?next=/account` kalau belum login, ambil profil + orders via RPC. Client: form edit identitas + daftar pesanan (link ke `/track?code=...` untuk lihat detail).
- `src/lib/i18n/{id,en}.ts` — Tambah `customerAuth.{login,register}` (form strings, placeholders, errors) + `customerAuth.{loginCta, accountChip}` (header) + `account.{title, subtitle, signOut, newOrder, profile, orders, toast, statuses}`.
- `MEMORY/decisions.md` — Tambah D9 (akun buyer pakai Supabase Auth) + D10 (auto-fill policy) + D11 (guest checkout tetap).

**Mengapa:**

1. **Akun buyer**: User minta "login juga jadi ada akun atau login as guest". Supabase Auth sudah dipakai admin, jadi reuse pola yang sama. Guest checkout tetap bisa (orders.user_id nullable), jadi tidak ada friction untuk user yang cuma sekali pesan.
2. **p_user_id dari auth.uid() di backend, bukan client**: Supabase Auth disebut dengan anon public key; parameter `p_user_id` di create_order diambil dari `auth.uid()` di dalam RPC (security definer). Client boleh kirim apa saja — yang dipakai server tetap session Supabase.

**Verifikasi:**

- `npx tsc --noEmit` — zero errors
- `npx eslint src` — zero errors / warnings
- `npx next build` — sukses, route baru: `/login`, `/register`, `/account`

**Catatan penting:**

- Supabase project **harus** sudah non-aktifkan "Confirm email" di dashboard
  Supabase (Authentication → Providers → Email), supaya signup tidak butuh
  verifikasi email (buyer bisa langsung order). Pola sama dengan admin
  (lihat ADMIN-ACCOUNT.md).
- Migration belum dijalankan ke production database. Setelah deploy, jalankan
  `npm run db:push` (atau SQL editor Supabase) untuk apply migration-16.
- Customer auth Supabase Auth digunakan terpisah dari admin auth — admin
  punya tabel `admins`, customer punya `customer_profiles`. RLS + RPC
  memisahkan akses dengan tegas.
- Auto-fill identitas di OrderFlow **tidak** overwrite kalau user sudah
  sempat edit field. Ref `autoFilledFromRef` menandai sudah auto-fill untuk
  akun yang sedang login, supaya perubahan manual user dihormati.

---
## 2026-10-05 — Bundle di halaman pre-order + toggle font-size mobile

**Scope:** feat: akun buyer, feat: halaman /account, fix: bundle deploy

**Mengubah:**

- `supabase/migration-16.sql` *(file baru)* — Tabel `customer_profiles` (link ke `auth.users`), kolom `orders.user_id` (nullable, FK ke `auth.users`), index di phone+user_id. RLS: customer hanya bisa SELECT/UPDATE profil sendiri + order miliknya sendiri. RPC baru: `customer_upsert_own_profile(p_text, p_phone, p_instagram)`, `customer_orders()`, `customer_profile()`. Update `create_order` jadi terima `p_user_id` dan isi `orders.user_id` dari `coalesce(auth.uid(), p_user_id)` — jadi tampering dari client tidak berguna.
- `src/lib/types.ts` — Tambah `CustomerProfile` + `CustomerOrderSummary`.
- `src/lib/data.ts` — `getCustomerProfile()` (cached) + `getCustomerOrders()` (cached).
- `src/app/account/actions.ts` *(file baru)* — Server actions: `signUpCustomerAction`, `signInCustomerAction`, `signOutCustomerAction`, `updateCustomerProfileAction`. Validasi input manual sebelum panggil Supabase; signup flow dua-langkah (auth.signUp + RPC upsert profile) dengan rollback signOut kalau profil gagal.
- `src/components/customer/CustomerAuthProvider.tsx` *(file baru)* — Context React + `useCustomerAuth()` hook. Pakai pola yang sama dengan `CartProvider`/`FontSizeProvider` (SSR-safe). Reaktif ke `supabase.auth.onAuthStateChange`. Support `initialProfile` dari server agar render pertama tidak flicker.
- `src/app/layout.tsx` — Pasang `<CustomerAuthProvider>` di dalam CartProvider (jadi nested). Ambil `initialProfile` via `getCustomerProfile()` di root layout.
- `src/components/customer/SiteHeader.tsx` — Tombol "Masuk" (guest) vs "Akun saya / nama depan" (logged in) di header desktop + mobile drawer. Pakai `useCustomerAuth()` untuk reaktif.
- `src/components/customer/OrderFlow.tsx` — Auto-fill nama/telepon/IG dari `useCustomerAuth().profile` saat mount (hanya kalau field masih kosong; ref `autoFilledFromRef` mencegah overwrite). Banner salam "Hai, X" di step identity. Kirim `p_user_id` ke RPC `create_order`.
- `src/app/login/page.tsx` *(file baru)* + `src/app/register/page.tsx` *(file baru)* — Halaman auth. Server component yang redirect ke `/account` kalau user sudah punya sesi. Pakai `CustomerAuthForm` shared.
- `src/app/login/CustomerAuthForm.tsx` *(file baru)* — Form login & register. Dipakai kedua halaman. Mode detection dari prop `mode: "login" | "register"`. Handle error dari server action. Akses i18n union via helper `errorFor(code)` untuk hindari narrowing.
- `src/app/account/page.tsx` *(file baru)* + `src/app/account/AccountClient.tsx` *(file baru)* — Halaman `/account`. Server-side: redirect ke `/login?next=/account` kalau belum login, ambil profil + orders via RPC. Client: form edit identitas + daftar pesanan (link ke `/track?code=...` untuk lihat detail).
- `src/lib/i18n/{id,en}.ts` — Tambah `customerAuth.{login,register}` (form strings, placeholders, errors) + `customerAuth.{loginCta, accountChip}` (header) + `account.{title, subtitle, signOut, newOrder, profile, orders, toast, statuses}`.
- `MEMORY/decisions.md` — Tambah D9 (akun buyer pakai Supabase Auth) + D10 (auto-fill policy) + D11 (guest checkout tetap).

**Mengapa:**

1. **Akun buyer**: User minta "login juga jadi ada akun atau login as guest". Supabase Auth sudah dipakai admin, jadi reuse pola yang sama. Guest checkout tetap bisa (orders.user_id nullable), jadi tidak ada friction untuk user yang cuma sekali pesan.
2. **Migration-16 tidak rollback-able dalam test**: Setelah migrate, RPC `customer_*` jadi tersedia; kalau rollback env error, halaman `/account` masih jalan karena `getCustomerProfile()`/`getCustomerOrders()` return null/[] kalau RPC tidak ada (lihat pola try/catch).

**Verifikasi:**

- `npx tsc --noEmit` — zero errors
- `npx eslint src` — zero errors / warnings
- `npx next build` — sukses, route baru: `/login`, `/register`, `/account`

**Catatan penting:**

- Supabase project **harus** sudah non-aktifkan "Confirm email" di dashboard
  Supabase (Authentication → Providers → Email), supaya signup tidak butuh
  verifikasi email (buyer bisa langsung order). Pola sama dengan admin
  (lihat ADMIN-ACCOUNT.md).
- Migration belum dijalankan ke production database. Setelah deploy, jalankan
  `npm run db:push` (atau SQL editor Supabase) untuk apply migration-16.
- Customer auth Supabase Auth digunakan terpisah dari admin auth — admin
  punya tabel `admins`, customer punya `customer_profiles`. RLS + RPC
  memisahkan akses dengan tegas.
- Auto-fill identitas di OrderFlow **tidak** overwrite kalau user sudah
  sempat edit field. Ref `autoFilledFromRef` menandai sudah auto-fill untuk
  akun yang sedang login, supaya perubahan manual user dihormati.

---

**Scope:** feat: bundle di pre-order, feat: density toggle mobile, fix: stale `.next` cache

**Mengubah:**

- `src/lib/types.ts` — Tambah `CartBundleEntry` (entry bundle di cart) dan `InvoiceBundleEntry` (untuk snapshot invoice publik). Extend `CartStore` + `InvoiceSnapshot` dengan field `bundles`.
- `src/lib/data.ts` — `getPublicMenu()` sekarang merge bundle dari `categories[].bundles` (per-kategori) + top-level `bundles` (berdiri sendiri) lalu dedupe by id. Buang field `bundles` per-kategori dari output supaya tidak ambigu.
- `src/components/customer/CartProvider.tsx` — Tambah `bundles: CartBundleEntry[]` ke store (persistent di localStorage), method `addBundle(bundle, slots)` dan `removeBundle(entryId)`. `totalItems` menjumlahkan item satuan + slot bundle.
- `src/components/customer/OrderBundleModal.tsx` *(file baru)* — Modal pilih `{required_qty}` slot rasa. Filter flavor sesuai `bundle.category_id` (kalau terkait kategori). Validasi "semua slot harus terisi" sebelum konfirmasi. Pakai `key={bundle.id}` dari parent untuk reset state.
- `src/components/customer/MenuBrowser.tsx` — `OrderMenuBrowser` sekarang menerima prop `bundles` dan render section "Paket hemat" di atas daftar kategori. Tiap bundle card: klik → buka `OrderBundleModal`. Badge qty saat bundle sudah masuk keranjang. Tambah class hook `density-bundle-grid` / `density-category-list` / `density-flavor-grid`.
- `src/components/customer/OrderFlow.tsx` — Terima prop `bundles`. Hitung `bundleGroups`, `subtotal` (items + bundles), dan `stockContribution` (per-kategori, termasuk slot bundle). `validateMenu` menggunakan `stockContribution`. Kirim `p_bundles` ke RPC `create_order`. Review step render bundle entries. Invoice snapshot berisi `bundles[]`. **Import `Gift` dari lucide-react** untuk banner info di step identity. Section step "menu" untuk bundle sudah dibuat lebih mencolok (heading besar, icon dalam lingkaran, anchor `#bundle-section`).
- `src/components/customer/CartDrawer.tsx` — Tampilkan bundle entries dengan daftar slot + tombol hapus per-entry. Subtotal menghitung item + bundle.
- `src/app/order/page.tsx` — Teruskan `bundles` dari `getPublicMenu()` ke `OrderFlow`.
- `src/lib/i18n/{id,en}.ts` — Tambah string bundle: `bundleAddToCart`, `bundleInCart`, `bundlePickFlavors`, `bundlePickFromCategory`, `bundleSection`, `bundleAnyCategory`, `bundleSlotN`, `bundleSlotEmpty`. Tambah `fontSize`, `fontSizeNormal`, `fontSizeCompact`, `fontSizeToggleLabel` di `common`.
- `src/app/order/success/[code]/SuccessClient.tsx` — Render bundle entries di `InvoiceSummary` (layar) dan `InvoiceDocument` (cetak). Helper `FragmentTable` untuk render `<tr>` rata dalam `<tbody>` tanpa nested element.
- `src/components/ui/FontSizeProvider.tsx` *(file baru)* — Context + external store (`useSyncExternalStore`) + localStorage key `js_density_v1`. 2 mode: `"normal"` (default) dan `"compact"`. Terapkan ke `<html data-density="…">`.
- `src/components/ui/FontSizeToggle.tsx` *(file baru)* — Tombol pill 2-state "A / −", aria-pressed.
- `src/app/layout.tsx` — Pasang `<FontSizeProvider>` di dalam `<I18nProvider>`.
- `src/components/customer/SiteHeader.tsx` — Pasang `<FontSizeToggle />` di header (mobile + desktop), di samping `<LanguageToggle />`. Di mobile menu drawer juga ada toggle + label.
- `src/app/globals.css` — Aturan `@media (max-width: 639px)` untuk `html[data-density="compact"]`: font body 14px, kartu flavor 2 kolom, bundle 2 kolom, kategori 2 kolom, padding lebih rapat, sembunyikan deskripsi + social row di flavor card.
- `src/components/customer/FlavorCard.tsx` — Tambah class hook `flavor-photo`, `flavor-desc`, `flavor-social`.

**Mengapa:**

1. **Bundle:** Bundle sudah dibuat di admin dan tampil di homepage sebagai lihat-saja, tapi tidak ada di halaman `/order` (pre-order). Kode `OrderFlow.tsx` punya komentar "Bundle menyusul di iterasi berikut." Backend RPC `create_order` sudah support `p_bundles` (lihat `migration-12.sql`), tinggal frontend. User konfirmasi: "Ya dia jadi kyk kita jualan juga, ada tampil dan bisa di pilih dan nanti misal bundlenya 2 rasa bs pilih 2 rasa, tpi nnti stoknya dia ngikut yang di menu".
2. **Font-size toggle:** User minta perkecil font di HP supaya dalam 1 baris bisa muat 2/3 kartu. Scope: semua halaman customer (mobile only). Toggle 2 level: normal/kecil.

**Verifikasi:**

- `npx tsc --noEmit` — zero errors
- `npx eslint src` — zero errors / warnings
- `npx next build` — sukses, semua route ter-generate
- HTML output test via debug page (`/debug-menu-browser`, sudah dihapus) — bundle section render sempurna: heading "Paket hemat", gift icon, card "Sando 2" Rp 35.000, "Pilih 2 rasa untuk paket ini"
- Cache: sempat ada error TS karena Next.js cache `.next/dev/types` menyimpan referensi ke debug page yang dihapus. Fix: hapus folder `.next/` lalu re-typecheck.

**Catatan penting:**

- Saat user bilang "blm ada", kemungkinan: (a) user stuck di step "identity" (form belum lengkap, tombol Lanjut disabled); (b) cache browser lama; (c) tidak scroll di step "menu". Safeguard yang ditambahkan: banner info bundle di step "identity" supaya user tahu ada bundle sebelum klik Lanjut.
- `getPublicMenu()` top-level `bundles` hanya return bundle dengan `category_id IS NULL` (lihat `public_menu()` di `migration-15.sql`). Bundle terkait kategori dikembalikan di `categories[].bundles`. Frontend sekarang merge keduanya.

---
