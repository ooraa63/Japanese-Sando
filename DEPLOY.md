# Deploy ke Vercel (lewat Browser / Dashboard)

Cara ini **tidak perlu install apa pun** dan **tidak perlu buka terminal**.
Semua dilakukan lewat browser di [vercel.com](https://vercel.com).

>Butuh ~5 menit.

---

## Langkah 1 — Daftar / masuk ke Vercel

1. Buka **https://vercel.com**
2. Klik **Sign Up** (kalau belum punya akun) atau **Log In**
3. Pilih **Continue with GitHub** → masuk dengan akun GitHub kamu
4. Vercel minta izin akses repository. Pilih **All repositories** supaya
   project ini bisa dibaca.

---

## Langkah 2 — Import repository

1. Di dashboard Vercel, klik tab **Projects** (atau **Overview**)
2. Klik tombol **Add New…** → **Project**
3. Cari repository **`Japanese-Sando`** di kotak pencarian
   - Kalau tidak muncul, klik **Adjust GitHub App Permissions** dan
     beri akses ke repo itu
4. Klik **Import** di sebelah kanan repo-nya

---

## Langkah 3 — Isi Environment Variables

Vercel langsung memperlihatkan form konfigurasi. Pastikan bagian
**Environment Variables** sudah diisi **sebelum** klik Deploy.

Tambahkan 3 variabel ini (klik "Add Environment Variable" tiga kali):

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xuavxcfnkqcszdacpwpo.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_LGcToBvAjehOHI3gmzTjjA_3-8J28JL` |
| `NEXT_PUBLIC_SITE_URL` | `https://japanese-sando.vercel.app` |

> **Jangan isi `DATABASE_URL`.** Variabel itu hanya dipakai oleh
> `npm run db:push` di komputermu, tidak perlu ada di Vercel.

Biarkan sisanya apa adanya:

- **Framework Preset** — `Next.js` (otomatis terdeteksi)
- **Root Directory** — `/`
- **Build Command** — `npm run build`
- **Output Directory** — `.next` (otomatis)
- **Install Command** — `npm install`

---

## Langkah 4 — Deploy

1. Klik tombol **Deploy**
2. Tunggu ±1–2 menit sampai muncul tulisan **"Congratulations!"
3. Klik tombol **Continue to Dashboard**
4. Buka **Deployments** → klik domain di bagian atas, biasanya:
   `https://japanese-sando-xxxx.vercel.app`
5. Klik **"Visit"** untuk membuka website

---

## Langkah 5 — Cek semuanya jalan

| Yang dicek | Alamat |
| --- | --- |
| Website pembeli | domain yang kamu dapat tadi |
| Menu & tombol pre-order | klik "Pesan Sekarang" |
| Dashboard penjual | domain tadi + `/admin` |
| Login penjual | `sando.pemilik.2026@gmail.com` / `SandoPemilik2026` |

Kalau halaman terbuka tapi muncul tulisan **"Supabase belum mengatur"**
atau form pre-order kosong, berarti Environment Variables belum
terpasang. Buka **Settings → Environment Variables**, periksa 3 variabel
di atas, lalu **Deployments** → titik tiga → **Redeploy**.

---

## Deploy berikutnya ( otomatis )

Setiap kali kode berubah di GitHub:

```bash
git add -A
git commit -m "pesan perubahan"
git push
```

Vercel melihat perubahan di branch `main` dan **otomatis deploy ulang**
dalam 1–2 menit. Tidak perlu buka Vercel lagi.

Untuk melihat progresnya, buka tab **Deployments** di dashboard.

---

## Domain sendiri (opsional)

Kalau sudah punya domain, misal `japanesesando.co.id`:

1. **Settings → Domains**
2. Ketik domain kamu → **Add**
3. Vercel menampilkan catatan pengatur DNS (A record / CNAME)
4. Masuk ke tempat domain kamu bought, ikuti catatan itu
5. Setelah domain aktif, **Settings → Environment Variables**, ubah
   `NEXT_PUBLIC_SITE_URL` jadi domain barumu
6. **Deployments → Redeploy**

---

## Kalau ada masalah

**Build gagal (halaman merah "Build Failed"):**
Buka **Deployments** → klik deployment yang gagal → tab **Logs**.
Biasanya penyebabnya nama environment variable salah ketik.

**Halaman 500 saat dibuka:**
Buka **Settings → Environment Variables**, pastikan tidak ada spasi
tambahan di awal/akhir nilai.

**Mau deploy ulang dengan kode yang sama:**
**Deployments** → titik tiga (⋯) di deployment → **Redeploy**.
