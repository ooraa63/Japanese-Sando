# Cara membuat akun penjual (admin)

Akun **tidak** bisa dibuat dari halaman login website. Semua akun dibuat dari
dashboard Supabase, lalu otomatis/diaktivasi jadi pemilik toko.

---

## 1. Buat user di Supabase

1. Buka **https://supabase.com/dashboard**
2. Pilih project kamu
3. Menu **Authentication** → **Users**
4. Klik tombol **Add user** → **Create new user**
5. Isi:

| Field | Isi |
| --- | --- |
| **Email** | email kamu, misal `pemilik@example.com` |
| **Password** | password pilihanmu (minimal 8 karakter) |
| **Auto Confirm User** | **centang** ✅ |

> **WAJIB** centang **Auto Confirm User**. Kalau tidak, user belum
> terverifikasi sehingga login akan ditolak.

6. Klik **Create user**

---

## 2. Akun pertama otomatis jadi admin

Tabel `admins` terisi otomatis oleh trigger database. Jadi setelah user
pertama dibuat di langkah 1, langsung bisa login ke
`https://japanese-sando.vercel.app/admin`.

Tidak perlu apa-apa lagi. ✅

---

## 3. Akun tambahan (staff / pemilik kedua)

Kalau butuh akun lain, buat dulu lewat **Add user** di langkah 1 seperti
biasanya. Lalu buka **SQL Editor** di sidebar dashboard Supabase, dan
jalankan:

```sql
insert into public.admins (user_id, email, full_name, role)
select
  id,
  email,
  coalesce(raw_user_meta_data ->> 'full_name', '') as full_name,
  'staff'
from auth.users
where email = 'email-kedua@example.com'
on conflict (user_id)
do update set is_active = true;
```

Ganti emailnya dengan email akun yang baru dibuat. Ganti juga `'staff'`
dengan `'owner'` bila akun itu pemilik toko.

---

## Kalau lupa email dan tidak tahu apakah sudah jadi admin

Jalankan ini di SQL Editor:

```sql
select a.email, a.role, a.is_active, u.email_confirmed_at
from public.admins a
join auth.users u on u.id = a.user_id
order by a.created_at;
```

Kalau email Anda tidak muncul di daftar, itu berarti belum terdaftar
sebagai admin — ulangi langkah 3.

---

## Kalau ingin mencabut akses

```sql
update public.admins
set is_active = false
where email = 'email-yang-diakses@example.com';
```

Lalu di website **Settings → Environment Variables** jangan lupa cek
`vercel` — tidak perlu, ini murni database.

---

## Ringkasan

| Langkah | Di mana |
| --- | --- |
| Buat user | Supabase → Authentication → Users → Add user |
| Jadi admin (pertama) | Otomatis |
| Jadi admin (ke-2+) | Jalankan SQL `insert into public.admins` |
| Masuk dashboard | `https://japanese-sando.vercel.app/admin` |
