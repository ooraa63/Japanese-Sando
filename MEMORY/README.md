# MEMORY — Project Memory untuk AI Session

Folder ini adalah **memori jangka panjang** untuk project ini. Setiap
AI session yang membuka repo ini WAJIB membaca folder ini dulu sebelum
melakukan perubahan apa pun.

## Isi folder

| File | Fungsi |
|---|---|
| **`START-HERE.md`** | **Pintu masuk. Dokument handoff: project ini apa, stack + versi, di mana GitHub / Supabase / Vercel, alur kerja wajib, aturan berinteraksi dengan Steven. Kalau kamu AI baru, ini yang pertama harus dibaca.** |
| `README.md` (file ini) | Rangkuman project, arsitektur, dan cara kerja. |
| `CHANGELOG.md` | Log kronologis setiap update / perubahan. Tambahkan entri baru di atas. |
| `decisions.md` | Keputusan teknis yang sudah diambil (arsitektur, library, pola) beserta alasannya. |
| `gotchas.md` | Hal-hal yang sering bikin AI session bingung / salah. Baca dulu sebelum nyentuh kode. |

## Cara pakai untuk AI session baru

1. **Baca `START-HERE.md` dulu** — project, infrastruktur, aturan kerja.
2. **Baca `README.md`** — pahami struktur folder dan stack.
3. **Baca `CHANGELOG.md`** — lihat update terakhir supaya tidak mengulang kerja.
4. **Baca `gotchas.md`** — hindari jebakan yang sudah pernah ditemukan.
5. **Baca `decisions.md`** (kalau ada perubahan arsitektur) — pahami kenapa keputusan itu diambil.
6. Setelah selesai kerja, **tambah entri baru di `CHANGELOG.md`** di bagian paling atas.

## Konvensi penulisan CHANGELOG.md

```
## YYYY-MM-DD — Judul singkat

**Scope:** (mis. "fix: bundle", "feat: pre-order flow", "docs:")

**Mengubah:**
- file1.tsx — apa yang berubah
- file2.ts — apa yang berubah

**Mengapa:**
- latar belakang / masalah yang diselesaikan

**Verifikasi:**
- tsc, eslint, build, atau test apa yang dijalankan
```

Jaga agar entri singkat dan to the point. Detail kode tetap di commit / PR.
