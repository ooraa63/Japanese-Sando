# Deploy ke Vercel

Panduan ini untuk project Japanese Sando. Semua perintah dijalankan dari
folder project:

```
cd "D:\Minimax\Japanese Sando"
```

---

## Langkah 1 — Login Vercel (sekali saja)

Login membuka browser, jadi harus kamu yang jalankan:

```bash
vercel login
```

Pilih metode **Continue with GitHub** (paling gampang karena repo-nya
sudah ada di GitHub).

Cek berhasil/tidaknya:

```bash
vercel whoami
```

Kalau muncul namamu, sudah login.

---

## Langkah 2 — Hubungkan ke GitHub

```bash
vercel link
```

Vercel akan menanyakan beberapa hal:

| Pertanyaan | Jawaban |
| --- | --- |
| `Set up and deploy?` | **Y** |
| `Which scope?` | pilih akun pribadimu |
| `Link to existing project?` | **N** (buat project baru) |
| `What's your project's name?` | `japanese-sando` |
| `In which directory is your code located?` | `.` (Enter saja) |

Setelah itu Vercel otomatis upload kode ke GitHub repository
`ooraa63/Japanese-Sando` dan menyambungkan branch `main`.

---

## Langkah 3 — Isi Environment Variables

Vercel sudah membaca `.env.local`? **Tidak** — file itu tidak ikut
upload demi keamanan. Kamu harus isi manual di dashboard.

Buka: **Vercel Dashboard → project `japanese-sando` → Settings →
Environment Variables**

Tambahkan **3 variabel ini**:

| Nama | Nilai |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xuavxcfnkqcszdacpwpo.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_LGcToBvAjehOHI3gmzTjjA_3-8J28JL` |
| `NEXT_PUBLIC_SITE_URL` | `https://japanese-sando.vercel.app` |

> **`DATABASE_URL` TIDAK perlu diisi di Vercel.** Variabel itu hanya
> dipakai oleh `npm run db:push` di komputermu sendiri.

Centang **Production**, **Preview**, dan **Development** untuk ketiganya.

---

## Langkah 4 — Deploy pertama

Kembali ke terminal:

```bash
vercel --prod
```

Tunggu sampai selesai. Vercel memberi alamat seperti:

```
https://japanese-sando.vercel.app
```

---

## Setelah itu — cara deploy berikutnya

Setiap kali kode di computer berubah:

```bash
git add -A
git commit -m "pesan perubahan"
git push
```

Vercel noticing push ke `main` dan **otomatis deploy ulang** dalam
beberapa menit. Tidak perlu jalankan `vercel --prod` lagi.

---

## Cek hasil deploy

| Halaman | Alamat |
| --- | --- |
| Website pembeli | `https://japanese-sando.vercel.app` |
| Dashboard penjual | `https://japanese-sando.vercel.app/admin` |

Kalau halaman terbuka tapi jawabannya "Supabase belum diatur", berarti
Environment Variables belum terisi — ulangi Langkah 3 lalu deploy ulang.

---

## Domain sendiri (opsional)

1. Vercel Dashboard → project → **Settings → Domains**
2. Ketik domain yang kamu punya, misal `japanesesando.co.id`
3. Vercel memberi catatan cara mengatur DNS
4. Buka **Settings → Environment Variables**, ubah `NEXT_PUBLIC_SITE_URL`
   jadi domain barumu, lalu deploy ulang

---

## Kalau ada masalah

**Lihat log build:**
```bash
vercel logs
```

**Deploy ulang dari nol:**
```bash
vercel --prod --force
```

**Hapus proyek Vercel:**
```bash
vercel remove japanese-sando
```
