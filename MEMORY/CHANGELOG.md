# CHANGELOG

Log kronologis perubahan project. Entry terbaru di atas.

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
