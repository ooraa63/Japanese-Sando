# CHANGELOG

Log kronologis perubahan project. Entry terbaru di atas.

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
