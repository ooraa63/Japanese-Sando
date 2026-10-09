# MEMORY — Project Memory untuk AI Session

Folder ini adalah **memori jangka panjang** untuk project ini. Setiap
AI session yang membuka repo ini WAJIB membaca folder ini dulu sebelum
melakukan perubahan apa pun.

## Isi folder

| File | Fungsi |
|---|---|
| `README.md` (file ini) | Rangkuman project, arsitektur, dan cara kerja. |
| `CHANGELOG.md` | Log kronologis setiap update / perubahan. Tambahkan entri baru di atas. |
| `decisions.md` | Keputusan teknis yang sudah diambil (arsitektur, library, pola) beserta alasannya. |
| `gotchas.md` | Hal-hal yang sering bikin AI session bingung / salah. Baca dulu sebelum nyentuh kode. |

## Cara pakai untuk AI session baru

1. **Baca `README.md` dulu** — pahami apa project ini, struktur folder, dan stack.
2. **Baca `CHANGELOG.md`** — lihat update terakhir supaya tidak mengulang kerja.
3. **Baca `gotchas.md`** — hindari jebakan yang sudah pernah ditemukan.
4. **Baca `decisions.md`** (kalau ada perubahan arsitektur) — pahami kenapa keputusan itu diambil.
5. Setelah selesai kerja, **tambah entri baru di `CHANGELOG.md`** di bagian paling atas.

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
