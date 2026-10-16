# START-HERE.md — dokumen handoff untuk AI session berikutnya

> **Kalau kamu AI yang baru membuka repo ini: baca file ini sampai habis
> SEBELUM menyentuh kode apa pun.** File ini menjawab "ini project apa, di mana
> Everything lives, dan apa yang TIDAK boleh saya lakukan".
>
> Setelah ini, baca lagi `MEMORY/gotchas.md` (133 jebakan yang sudah pernah
> ditemukan orang sebelumnya) dan `MEMORY/decisions.md` (keputusan yang tidak
> boleh dibatalkan tanpa diskusi dengan Steven).

---

## 1. Apa ini

**Japanese Sando / Rumakomugi** — website toko sando (sandwich Jepang) dan
kopi dan roti di Bandung, dengan sistem **pre-order (PO)**: pembeli memilih tanggal
ambil, lalu memilih rasa, memilih pengambilan atau pengantaran, lalu konfirmasi.

- Bukan toko daring biasa seperti tokopedia. Stok per batch tanggal, bukan stok gudang.
- Halaman publik (pembeli) + `/admin` (dashboard pengelola toko).
- Ada batch PO harian/mingguan yang membatasi tanggal ambil dan daftar rasa
  yang boleh dipesan.

**Pemilik:** Steven. **Bahasa kerja:** Bahasa Indonesia — untuk respons, komentar
kode, dan dokumentasi. Jangan tulis jawaban ke Steven dalam Bahasa Inggris.

---

## 2. Urutan baca kalau kamu AI baru

| Urutan | File | Isi |
|---|---|---|
| 1 | `MEMORY/START-HERE.md` (file ini) | project, infra, aturan kerja |
| 2 | `MEMORY/README.md` | struktur folder memori + konvensi penulisan |
| 3 | `MEMORY/gotchas.md` | 133 jebakan yang sudah pernah menimpa orang |
| 4 | `MEMORY/decisions.md` | 50 keputusan teknis + alasannya |
| 5 | `MEMORY/CHANGELOG.md` | riwayat perubahan (entry paling atas = terbaru) |

Kalau hanya mau tahu "apa yang terakhir dikerjakan", `CHANGELOG.md` sudah cukup.

---

## 3. Stack (versi PENTING — janganberriesa)

| Lapisan | Versi | Catatan |
|---|---|---|
| Next.js | **16.3.7** | **BUKAN** Next.js yang biasa dipakai model. Ada breaking changes. `AGENTS.md` mewajibkan baca `node_modules/next/dist/docs/` dulu sebelum menulis kode Next.js. |
| React | 19.2.8 | |
| Tailwind CSS | **v4** | v4 pakai CSS-first config (`@theme`), bukan `tailwind.config.js` |
| TypeScript | 5 | `strict` |
| Supabase | `@supabase/supabase-js` 2.117 + `@supabase/ssr` 0.12 | PostgreSQL murni, bukan Firebase |
| `pg` | 8.23 | hanya untuk skrip di `scripts/`, bukan untuk runtime app |
| zod | 4 | validasi input di server action |
| lucide-react | 1.49 | ikon |
| Node | v24.19.0 | npm 11.17 |

---

## 4. Infrastruktur — di mana semuanya

### GitHub (source of truth untuk kode)

| | |
|---|---|
| Repo | `https://github.com/ooraa63/Japanese-Sando.git` |
| Branch kerja | `main` — tidak ada branch lain, tidak ada PR flow |
| Clone | `git clone https://github.com/ooraa63/Japanese-Sando.git` |

Push ke `main` = produksi berubah (lihat §5).

### Supabase (database)

| | |
|---|---|
| Project ref | `xuavxcfnkqcszdacpwpo` |
| Host DB | ada di `.env.local` pada `DATABASE_URL` |
| Storage publik | `https://xuavxcfnkqcszdacpwpo.supabase.co/storage/v1/object/public/flav…` |
| Dashboard | `https://supabase.com/dashboard/project/xuavxcfnkqcszdacpwpo` |

**Semua secret ada di `.env.local` (gitignored). JANGAN PERNAH ditampilkan,
dicatat ke dokumen, atau di-commit.** Nama variabel yang dipakai:

```
DATABASE_URL          # koneksi postgres langsung (dipakai skrip scripts/*.mjs)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

App **tidak pernah** menyentuh tabel langsung dari client. Semua lewat **RPC**
(`public_menu`, `create_order`, `admin_*`, dll) supaya RLS + validasi jalan
selalu. Ini pilihan arsitektur, bukan sekadar gaya — lihat `decisions.md`.

### Vercel (hosting)

| | |
|---|---|
| URL produksi | `https://japanese-sando.vercel.app` |
| Project name | `japanese-sando` |
| Project ID | `prj_RWsvynarD6uExhsngRg41kGKZ3vg` |
| Org ID | `team_D4EkGBbBttw3kFmDngI2JRxi` |
| Link lokal | `.vercel/project.json` (sudah ter-link, dipakai `vercel` CLI) |

Deploy = **push ke `main`** (Vercel GitHub integration). Tidak ada langkah
`vercel deploy` manual di alur normal.

Environment variables ada di sisi Vercel, bukan di repo. Kalau butuh menambah
env var baru: jangan commit nilainya — catat **nama variabelnya saja** di sini.

---

## 5. Alur kerja WAJIB (urutannya penting)

```
1. Ubah kode
2. npm run typecheck && npx eslint <file-yang-berubah>
3. npm run build                    ← WAJIB. build produksi, bukan dev
4. next start -p 3100 + ukur/shot   ← verifikasi di build yang sama
5. Kalau ada perubahan DB:
     node scripts/db-apply.mjs supabase/migration-NN.sql   ← SEBELUM deploy
6. git add -A && git commit -F <file-commit>
7. git push origin main             ← ini memicu deploy Vercel
8. node scripts/wait-for-deploy-*.mjs   ← tunggu sampai marker benar-benar live
9. Update MEMORY/CHANGELOG.md + gotchas.md (kalau ada jebakan baru)
```

**Kenapa migration sebelum deploy:** kalau urutannya dibalik, ada jendela di mana
kode baru sudah live tapi DB belum mendukung — pembeli nyata yang menanggung.
Lihat `decisions.md` D48.

**Kenapa verifikasi deploy tidak bisa pakai HTTP 200:** beranda selalu 200 baik
di build lama maupun baru. Yang dicari adalah **marker yang hanya ada di build
baru** (lihat §8).

### Commit message

Tulis ke file lalu pakai `-F`. **Jangan** menempelkan teks panjang langsung di
`git commit -m` dari PowerShell — PowerShell merusak tanda kutip.

```powershell
git commit -F "C:\Users\ASUS\AppData\Local\Temp\commit.txt"
```

---

## 6. Aturan kerja dengan Steven

| Aturan | Detail |
|---|---|
| **Bahasa** | Semua respons, komentar kode, dan dokumen dalam Bahasa Indonesia. |
| **Izin** | **Jangan push / deploy tanpa izin eksplisit Steven.** Dia sering-testing dulu di lokal. |
| **Database** | Semua query **read-only** kecuali Steven mengizinkan. Untuk uji, selalu `BEGIN … ROLLBACK`, dan bungkus tiap error yang diharapkan dengan `SAVEPOINT`. |
| **Heredoc** | **Dilarang** memakai heredoc PowerShell (`@'…'@`). |\`grave accent\` di dalam argumen native juga merusak. Untuk JS panjang: tulis ke file, lalu `[System.IO.File]::ReadAllText`. |
| **`Remove-Item`** | **Dilarang** (blocked oleh safety policy). Hapus file dengan `rm -- "<path>"` — itu diteruskan ke `mavis-trash`. |
| **scan teks** | Setelah menulis/menempel file JS/TS/SQL/MD, **wajib** jalankan `node scripts/scan-teks.mjs <file>`. Tool `write`/`edit` sering menyisipkan karakter CJK/Cyrillic/Arab. Ini bukan teori — terjadi beberapa kali. |
| **EOL** | Project campur CRLF dan LF. `edit` tool hanya cocok persis. Pakai `scripts/_patch.mjs` untuk multi-baris. |
| **Admin access** | `/admin` butuh login. Tidak ada akses browser tanpa kredensial Steven. Jangan memaksa. |

---

## 7. Peta kode — fitur ada di mana

```
src/app/                      route Next.js (App Router)
  page.tsx                    BERANDA. Server Component; bungkus QuickAddProvider + SiteHeader
  order/                      alur PO 5 langkah (tanggal → data → rasa → bayar → konfirmasi)
  admin/(dashboard)/          dashboard: menu, orders, po, reviews, settings,
                              pickup-delivery, sales, customers, announcements, faq…
  layout.tsx                  root: SettingsProvider + CartProvider + WhatsAppFab

src/components/customer/      komponen pembeli
  OrderFlow.tsx               (~2.600 bar) INTI alur PO. Semua langkah + validasi
  OrderBundleModal.tsx        pilih isi paket (3 mode: PILIHAN / TERKUNCI / BIASA)
  CartProvider.tsx            store keranjang (zustand + localStorage "js_cart_v1")
  CartHeaderButton.tsx        ikon troli kecil di header (cart per halaman)
  CartSheet.tsx / CartDock.tsx / CartRail  tiga tampilan keranjang
  WhatsAppFab.tsx             SATU-SATUNYA tombol WhatsApp, pojok kanan bawah
  SiteHeader.tsx              header (props opsional `cartButton`)
  MenuBrowser.tsx             daftar menu + kartu paket

src/components/admin/         komponen dashboard

src/lib/
  data.ts                     semua pembacaan data server (RPC)
  types.ts                    tipe TypeScript
  i18n/ (id.ts, en.ts)        terjemahan —WAJIB tambah dua bahasa

supabase/migration-NN.sql     skema DB, hipótese runs sequential (sekarang: 60)
scripts/                      skrip utilitas + harness uji (lihat §8)
MEMORY/                       memori project
```

### Tiga mode paket (penting, sering ditanya Steven)

Ditentukan oleh **isi tabel**, bukan oleh boolean:

| Mode | Kenali dari | Arti |
|---|---|---|
| PILIHAN | ada baris di `bundle_slots` | tiap pilihan punya daftar rasa sendiri (paket sando + kue, mis.) |
| TERKUNCI | tidak ada slot + `bundles.is_fixed` | isi ditetapkan penjual |
| BIASA | tidak ada slot + bukan `is_fixed` | daftar rasa rata |

---

## 8. Skrip verifikasi (JANGAN percaya deploy tanpa ini)

| Skrip | Untuk apa |
|---|---|
| `scripts/ukur.mjs` | Baca `getBoundingClientRect()` lewat DevTools Protocol. **Satu-satunya cara jujur memverifikasi posisi elemen `fixed`/`sticky`** — screenshot penuh tidak bisa (lihat gotcha #131). |
| `scripts/shot-cdp.mjs` | Screenshot build produksi di viewport tertentu. Pakai `captureBeyondViewport`, jadi elemen fixed tampak melayang — jangan dipakai menilai posisi. |
| `scripts/scan-teks.mjs` | Deteksi karakter asing yang disisipkan tool tulis. Jalankan setelah setiap tulis file. |
| `scripts/_patch.mjs` | Patch multi-baris tanpa merusak EOL asli. Setiap pola harus cocok **persis satu kali**. |
| `scripts/wait-for-deploy-<tanggal>.mjs` | Tunggu build live. **Buat skrip baru per batch** — marker batch lama sudah live, jadi skrip lama akan langsung bilang "SIUP" padahal build ini belum naik (gotcha #118). |
| `scripts/test-migration-NN.mjs` | Harness migration. Buat yang **sadar kondisi** (sudah terpasang vs belum) supaya bisa dijalankan sebelum DAN sesudah apply. |
| `scripts/cek-*.mjs` | Survei read-only (zona pengiriman, constraint, bundle per batch, create_order terpasang). |

### Cara memvalidasi marker deploy

```powershell
# WAJIB: ke build lokal dulu. Kalau marker tidak ditemukan di sini,
# marker itu salah pilih — bukan berarti produksi belum naik.
npm run build
npx next start -p 3100
$env:JS_DEPLOY_URL="http://localhost:3100"; node scripts/wait-for-deploy-2026-10-16.mjs
# baru arahkan ke produksi
node scripts/wait-for-deploy-2026-10-16.mjs
```

---

## 9. Status produksi per 17-10-2026

- Migration terpasang sampai **migration-60** (zona pengiriman — constraint
  daftar tetap sudah dihapus).
- Deploy terakhir: commit `9337398` "Tujuh perbaikan dari screenshot Steven".
- Zona pengiriman aktif: `antar`, `uvers`, `vihara` (delivery); `pickup-rumah`
  (Rumah Sushi), `pickup-uvers` (UVERS) — keduanya `kind='pickup'`.
- **Batch tes** masih aktif sampai **17-10-2026** dan menerima pesanan nyata di
  `/order`. Kalau lewat tanggal itu batchnya menutup sendiri; tidak perlu
  tindakan manual.
- Ada paket uji "Uji Pilihan" dan "Sando COmbo 2" (huruf O besar — salah ketik
  di data admin Steven) untuk menguji mode paket.

Untuk cek data terbaru, jalankan skrip `cek-*` — jangan hardcode angka di sini,
pasti akan basi.

---

## 10. Kalau ada yang belum jelas

`MEMORY/gotchas.md` sekarang berisi **133 jebakan**. Yang paling sering menimpa
AI baru:

1. **Tool tulis menyisipkan karakter asing** → selalu `scan-teks.mjs`.
2. **Kelas Tailwind dari template literal tidak jadi CSS** → tulis literal.
3. **`position: sticky` tenggelam di balik header `sticky`** → cek gotcha #132.
4. **Marker deploy lama sudah live** → buat skrip marker baru tiap batch.
5. **Produksi selalu HTTP 200** → jangan pakai itu sebagai bukti deploy.
6. **Halaman `/admin` butuh login** → tidak bisa diuji lewat browser tanpa
   kredensial Steven.

Lebih dari itu, baca `gotchas.md` langsung.