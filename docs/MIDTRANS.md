# Setup Midtrans QRIS Dinamis

Dokumen ini menjelaskan cara mengaktifkan metode pembayaran **QRIS via
Midtrans** (dynamic QR) di Japanese Sando. Fitur ini opsional — kalau
tidak di-setup, metode "QRIS via Midtrans" tidak muncul di halaman
payment (hanya "Transfer Bank" + "QRIS Statis" yang tampil).

---

## 1. Daftar akun Midtrans

1. Buka https://account.midtrans.com/register
2. Pilih akun **Sandbox** dulu untuk testing (nanti saat siap production,
   daftar akun Production di https://account.midtrans.com dengan data bisnis
   lengkap)
4. Setelah login, pergi ke **Settings → AccessKeys**
5. Anda akan lihat 2 keys:
   - **Server Key** — rahasia, hanya dipakai di server (`MIDTRANS_SERVER_KEY`)
   - **Client Key** — publik, dipakai di frontend (`NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`)
6. Untuk sandbox: key di-prefix `SB-Mid-...`. Untuk production: `Mid-...`.

---

## 2. Konfigurasi `.env.local`

Tambahkan 3 baris berikut (jangan commit `.env.local` ke GitHub):

```bash
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxxxxxxxx
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxxxxxxxx
MIDTRANS_IS_PRODUCTION=false
```

- `MIDTRANS_IS_PRODUCTION=false` → pakai sandbox API (`api.sandbox.midtrans.com`).
  Set `true` setelah Anda dapat Production Switch Secret.
- `MIDTRANS_SERVER_KEY` tanpa prefix `NEXT_PUBLIC_` — pastikan tidak ter-expose
  ke browser.

---

## 3. Konfigurasi webhook URL di dashboard Midtrans

1. Login ke https://account.midtrans.com → pilih environment (Sandbox/Production)
2. **Settings → Configuration → Payment**
3. Isi **Payment Notification URL** dengan:
   ```
   https://<domain-anda>/api/midtrans/webhook
   ```
   - Sandbox: `https://account.midtrans.com/login#/settings/sandbox`
   - Production: `https://account.midtrans.com/login#/settings/general`
4. **Save**

Webhook ini menerima POST dari Midtrans saat status transaksi berubah:
settlement → paid, expire → expired, deny → failed, dll.

---

## 4. Apply migration ke production DB

Pastikan kolom QRIS sudah dibuat di tabel `orders`:

```bash
cd "D:\Minimax\Japanese Sando"
npm run db:push
```

Atau paste `supabase/migration-18.sql` ke SQL Editor di Supabase Dashboard.
Setelah sukses, tabel `orders` punya kolom `qris_transaction_id`, `qris_status`,
`qris_qr_url`, `qris_expires_at`, `qris_paid_at`.

---

## 5. Test end-to-end (sandbox)

1. Buka `/order` di website Anda (pastikan `MIDTRANS_IS_PRODUCTION=false`).
2. Pilih menu → buka step payment.
3. Pilih **"QRIS via Midtrans (dynamic)"** — opsi ini hanya muncul kalau
   `MIDTRANS_SERVER_KEY` sudah di-set.
4. Klik **Bayar dengan QRIS**.
5. Modal QR muncul dengan:
   - QR image (di-generate via Midtrans sandbox)
   - Countdown expiry (biasanya 30 menit)
   - Order code & total
6. Buka aplikasi e-wallet Anda (GoPay, OVO, Dana, ShopeePay, ...)
7. Scan QR → aplikasi akan menampilkan nominal sesuai total order
8. Klik bayar → Midtrans mengirim webhook ke `/api/midtrans/webhook`
9. Status berubah dari `pending` → `paid`
10. Modal redirect ke `/order/success/[code]`

**Atau test tanpa e-wallet asli**: Midtrans Sandbox Simulator
https://simulator.sandbox.midtrans.com — bisa simulate status
settlement/expire/cancel.

---

## 6. Mapping status Midtrans ke internal

| Midtrans transaction_status | Internal `qris_status` | Order status change |
|---|---|---|
| `pending` | `pending` | — |
| `capture` / `settlement` | `paid` | `pending` → `accepted` |
| `expire` | `expired` | `pending` → `rejected` |
| `cancel` | `cancelled` | `pending` → `rejected` |
| `deny` | `failed` | `pending` → `rejected` |
| `refund` | `refunded` | — |

Mapping dilakukan di `set_order_qris_status` RPC + `mapMidtransStatus()`
helper di `src/lib/midtrans/server.ts`.

---

## 7. Production rollout checklist

- [ ] Daftar akun Production di https://account.midtrans.com (bukan sandbox)
- [ ] Lengkapi verifikasi bisnis (KTP, NPWP, dsb.) — Midtrans akan review
- [ ] Setelah approved, dapat Production Server Key + Client Key
- [ ] Set `MIDTRANS_IS_PRODUCTION=true` di `.env.local`
- [ ] Ganti Payment Notification URL ke URL production
- [ ] Test live dengan nominal kecil (Rp 100) lalu refund

---

## 8. Arsitektur kode

```
┌─────────────────┐    FormData(payload)   ┌──────────────────────┐
│ OrderFlow.tsx   │ ────────────────────► │ qris-actions.ts       │
│ (handleSubmit   │                       │ createQrisOrderAction │
│  branch)        │                       └──────────┬────────────┘
└─────────────────┘                                  │
                                                    │ RPC create_order (payment_method='qris_midtrans')
                                                    │ Midtrans /v2/charge
                                                    │ RPC set_order_qris_charge
                                                    ▼
┌─────────────────┐  polling 5s +   ┌──────────────────────────┐
│ QrisPaymentModal├◄──────────────  │   Supabase orders        │
│ (countdown +    │                 │   qris_status column     │
│  QR display)    │ ──────────────► │   qris_transaction_id    │
└─────────────────┘   redirect      │   qris_qr_url            │
                     to success     └─────────────┬────────────┘
                                                    │
                                                    │ POST notification
                                                    ▼
                                          ┌─────────────────────┐
                                          │ Midtrans → webhook   │
                                          └─────────┬───────────┘
                                                    │ Verify   ▼
                              ┌──────────────────────────────────┐
                              │ /api/midtrans/webhook (Next.js) │
                              └──────────┬───────────────────────┘
                                         │ RPC set_order_qris_status
                                         ▼
                              orders.qris_status='paid' (auto)
```

---

## 9. Troubleshooting

- **Webhook Midtrans tidak sampai?**
  1. Cek URL di dashboard Midtrans — pastikan pakai HTTPS production
  2. Cek response di dashboard Midtrans (Settings → Logs)
  3. Cek logs Vercel — search "POST /api/midtrans/webhook"
  4. Pastikan signature verification PASS (env key harus sama dengan
     dashboard)

- **Modal QR tidak muncul setelah pilih QRIS Midtrans?**
  1. Cek console browser — kalau ada error `midtrans_not_configured`,
     berarti `MIDTRANS_SERVER_KEY` belum di-deploy
  2. Cek console — error `midtrans_charge_failed` biasanya sandbox key salah
  3. Cek Vercel env — pastikan key di-set di production env juga

- **Pembayaran sukses di Midtrans tapi status masih pending di website?**
  Frontend polling 5s + auto-check ke Midtrans. Kalau setelah 30 detik
  masih pending, kemungkinan webhook gagal. Cek #1 di atas.

- **User close tab setelah bayar?**
  Saat user buka `/track?code=...`, `public_invoice` akan return
  `qris_status` yang sudah ter-update oleh webhook. Tracking tetap jalan.

---

## 10. Limit & quota Midtrans

- **Sandbox**: unlimited, gratis
- **Production**:
  - Biaya transaksi: ~0.7% dari nilai (cek halaman pricing Midtrans)
  - Settlement: H+1 ke rekening bank yang didaftarkan
  - Quota harian: tidak ada batas keras, tapi ada soft limit yang dapat
    dilihat di dashboard