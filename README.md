# Japanese Sando — Website Pre-order

Website untuk **menerima pre-order sando sandwich**. Dua website dalam satu
project Next.js:

| Bagian | Alamat | Untuk siapa |
| --- | --- | --- |
| **Website pembeli** | `/` | Pelanggan — tanpa login |
| **Dashboard penjual** | `/admin` | Kamu (pemilik toko) — perlu login |

---

## Fitur

### Sisi pembeli (tanpa akun, tanpa password)

- **Landing page** dengan foto menu (`Gambar/Foto Awal.jpeg`) sebagai hero
- Tombol **"Pesan Sekarang"** → masuk ke alur pre-order
- Alur 4 langkah: **isi nama + nomor telepon → pilih rasa & jumlah → pilih
  pembayaran → konfirmasi**
- Pembayaran **transfer** (upload bukti transfer) atau **COD** (bayar di tempat)
- Keranjang tersimpan di browser, jadi tidak hilang saat halaman di-refresh
- Nomor pesanan otomatis (contoh: `JS-260930-001`)
- Halaman **cek pesanan** pakai kode pesanan + nomor telepon
- Link WhatsApp (`wa.me`) ke penjual dari halaman sukses
- **Dua bahasa**: Indonesia / Inggris (tombol ID/EN)
- Stok live — kalau habis, otomatis tidak bisa dipilih

### Sisi penjual (`/admin`)

- Dashboard: pesanan menunggu, sedang disiapkan, siap diambil, pendapatan
  hari ini & bulan ini, produk terlaris, peringatan stok menipis
- **Terima / tolak** pesanan, tandai **siap diambil**, tandai **selesai**
- Lihat **bukti transfer** (bucket privat, hanya admin yang bisa buka)
- Tombol **WhatsApp pembeli** dengan ringkasan pesanan otomatis
- **Tambah / ubah / hapus rasa** kapan saja (langsung tampil di website)
- Kelola **stok** (cepat + / − atau isi manual)
- **Catatan internal** per pesanan
- Filter pesanan, pencarian, ekspor CSV
- **Pengaturan toko**: nama, nomor WhatsApp, alamat, jam buka, batas
  pre-order, rekening bank / e-wallet, QRIS, ongkir, minimal pesanan,
  tombol buka/tutup pre-order
- Dua bahasa

### Alur status pesanan

```
Pre-order masuk ──▶ stok langsung berkurang
   │
   ├──terima──▶ Diterima ──siap──▶ Siap diambil ──selesai──▶ Selesai
   │              (stok tetap berkurang)
   └──tolak───▶ Ditolak  (stok kembali ke rak)
```

Tidak ada tombol "Batalkan" dari sisi penjual — untuk membatalkan cukup
pakai **Tolak**, yang sama-sama mengembalikan stok.

### Cara kerja stok

Stok dikurangi **saat pembeli mengirim pre-order**, bukan saat Anda
menerima. Ini supaya produk tidak terjual habis padahal pesanan sudah
masuk. Kalau pesanan ternyata ditolak, stok otomatis bertambah lagi.

| Kejadian | Efek ke stok |
| --- | --- |
| Pembeli pre-order | **−N** (langsung, tidak tunggu approval) |
| Anda terima | tidak berubah |
| Anda tandai siap / selesai | tidak berubah (barang sudah dibuat) |
| Anda **tolak** | **+N** kembali ke rak |
| Anda kembalikan ke Menunggu | −N lagi (stok dipesan ulang) |

Produk dengan "Batasi stok" mati tidak terpengaruh.

---

## Menjalankan di komputer sendiri

```bash
npm install
npm run db:push     # sekali saja: membuat tabel + mengisi 5 rasa awal
npm run dev         # buka http://localhost:3000
```

### Membuat akun penjual pertama

1. Buka `http://localhost:3000/admin/login`
2. Klik **"Belum punya akun? Buat dulu"**
3. Isi nama, email, dan password (minimal 8 karakter)

Akun pertama yang mendaftar otomatis menjadi admin. Setelah itu menu
pembuatan akun hilang.

> **Penting — Supabase Dashboard:** buka **Authentication → Sign In / Providers**
> lalu matikan **Confirm email**. Kalau tidak dimatikan, Supabase akan
> mengirim email konfirmasi dan akun tidak bisa langsung dipakai.

---

## Pengaturan environment

Buat file `.env.local` (sudah ada, tapi jangan di-commit):

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=https://<kode-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...

# hanya untuk `npm run db:push`
DATABASE_URL=postgresql://postgres.<kode-project>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

### Cara mencari `DATABASE_URL`

Supabase Dashboard → **Project Settings → Database → Connection string** →
pilih **Session pooler**. Salin yang başakan `aws-0-...pooler.supabase.com`
dengan user `postgres.<kode-project>`.

**Penting:** password-nya harus di-*encode* untuk URL. Karakter yang sering
membikin gagal:

| Karakter | Jadi |
| --- | --- |
| `/` | `%2F` |
| `+` | `%2B` |
| `@` | `%40` |
| `#` | `%23` |

Kalau `DATABASE_URL` tidak bisa dipakai, tidak apa-apa — skemanya bisa
dijalankan manual di **SQL Editor** Supabase: salin seluruh isi
`supabase/schema.sql`, tempel, klik **Run**. (Kalau begitu, jalankan juga
baris terakhir `NOTIFY pgrst, 'reload schema';` supaya RPC terbaca.)

---

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `npm run dev` | Jalankan website untuk pengembangan |
| `npm run build` | Build versi produksi |
| `npm start` | Jalankan hasil build |
| `npm run lint` | Cek kode |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm run db:push` | Terapkan `supabase/schema.sql` (aman diulang) |
| `npm run db:cleanup` | Hapus semua pesanan uji, reset stok ke 20 |
| `npm run test:order` | Uji alur pesanan lewat API (21 pemeriksaan) |
| `npm run test:db` | Uji RLS, hak akses admin, dan logika stok (35 pemeriksaan) |

---

## Struktur folder

```
├── Gambar/Foto Awal.jpeg     # foto menu (dipakai sebagai hero)
├── public/foto-awal.jpeg    # salinannya untuk website
├── supabase/schema.sql      # seluruh definisi database (idempotent)
├── scripts/                 # migrasi & skrip pengujian
└── src/
    ├── proxy.ts             # penyegaran session + pengaman /admin
    ├── app/
    │   ├── page.tsx         # landing page pembeli
    │   ├── order/           # alur pre-order + halaman sukses
    │   ├── track/           # cek status pesanan
    │   └── admin/           # login + dashboard penjual
    ├── components/
    │   ├── customer/        # komponen sisi pembeli
    │   ├── admin/           # komponen sisi penjual
    │   └── ui/              # komponen umum
    └── lib/
        ├── i18n/            # kamus ID & EN
        ├── supabase/        # klien Supabase (browser & server)
        ├── data.ts          # pembacaan data sisi server
        ├── types.ts         # tipe TypeScript
        └── utils.ts         # format rupiah, tanggal, link wa.me
```

---

## Cara kerja keamanan

- **Harga selalu diambil dari server.** Nilai harga yang dikirim browser
  diabaikan; total dihitung ulang di database.
- **Stok dikunci saat pesanan dibuat** (`SELECT ... FOR UPDATE`), jadi dua
  pembeli yang memesan bersamaan tidak akan membuat stok minus.
- **Stok dilepas otomatis** kalau pesanan ditolak atau dibatalkan.
- Pembeli tidak bisa menulis langsung ke tabel `orders` — harus lewat fungsi
  `create_order()` yang melakukan validasi dan penguncian stok.
- Data pesanan **tidak bisa dibaca** oleh publik (Row Level Security), kecuali
  lewat `track_order()` yang memerlukan kode pesanan **dan** nomor telepon.
- Semua fungsi admin memeriksa `is_admin()` di dalam database, jadi tidak
  bisa dipanggil oleh sembarang orang.
- Bukti transfer disimpan di bucket **privat**; hanya admin yang bisa
  membuka lewat tautan bertanda tangan sementara.

---

## Bila deploy nanti (Vercel)

1. Push kode ke GitHub
2. Import repository di Vercel (framework Next.js terdeteksi otomatis)
3. Tambahkan semua variabel dari `.env.local` di **Settings → Environment
   Variables** (untuk semua branch)
4. Deploy

`DATABASE_URL` tidak wajib diisi di Vercel karena hanya dipakai oleh
`npm run db:push` di komputermu.
