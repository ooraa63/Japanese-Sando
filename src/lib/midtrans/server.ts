import "server-only";

/**
 * Server-only client untuk Midtrans Core API.
 *
 * Mendukung 2 mode:
 *   - sandbox  : api.sandbox.midtrans.com + key ber-prefix `SB-Mid-server-...`
 *   - production: api.midtrans.com + key ber-prefix `Mid-server-...`
 *
 * Env yang dibaca:
 *   - MIDTRANS_SERVER_KEY (wajib untuk mode production / sandbox real)
 *   - MIDTRANS_IS_PRODUCTION ("true" → production, default sandbox)
 *
 * QRIS flow:
 *   1. `chargeQris({ orderCode, grossAmount })` → Midtrans /v2/charge
 *      dengan payment_type=qris. Response mengandung transaction_id dan
 *      satu action "generate-qr-code" (URL gambar QR).
 *   2. Frontend tampilkan QR dari URL tersebut.
 *   3. Midtrans mengirim POST ke webhook kita saat status berubah
 *      (settlement → paid, expire, cancel, deny).
 *   4. Frontend poll `getOrderStatus(orderCode)` sebagai backup kalau
 *      webhook telat / terlewat.
 *
 * Setup: lihat `docs/MIDTRANS.md` untuk cara daftar akun & ambil keys.
 */

const SANDBOX_BASE = "https://api.sandbox.midtrans.com";
const PROD_BASE = "https://api.midtrans.com";

export type QrisStatus =
  | "pending"
  | "paid"
  | "expired"
  | "failed"
  | "refunded"
  | "cancelled";

export interface ChargeQrisInput {
  /** Order code yang sudah ter-formatted, dipakai sebagai Midtrans order_id. */
  orderCode: string;
  /** Total bayar dalam Rupiah, tanpa koma. */
  grossAmount: number;
  /** Metadata tambahan — mis. { customer_email, customer_phone }. */
  customer?: {
    email?: string | null;
    phone?: string | null;
    name?: string | null;
  };
  /** Custom expiry dalam menit. Midtrans default 30 menit untuk QRIS. */
  expiryMinutes?: number;
}

export interface ChargeQrisResult {
  transactionId: string;
  /** URL gambar QR — frontend render langsung sebagai <img>. */
  qrUrl: string;
  /** ISO timestamp kapan QR expired. */
  expiresAt: string;
  /** Status awal dari Midtrans. Biasanya "pending" untuk QRIS. */
  status: string;
}

interface MidtransAction {
  name: string;
  method: string;
  url: string;
}

interface MidtransChargeResponse {
  status_code: string;
  transaction_id: string;
  transaction_status: string;
  actions?: MidtransAction[];
  expiry_time?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_time?: string;
}

/** Cek apakah env Midtrans sudah diisi. Kalau belum, return false —
 *  pemanggil harus menampilkan pesan 'Midtrans belum dikonfigurasi'
 *  daripada crash. */
export function isMidtransConfigured(): boolean {
  return !!process.env.MIDTRANS_SERVER_KEY;
}

function getBaseUrl(): string {
  return process.env.MIDTRANS_IS_PRODUCTION === "true" ? PROD_BASE : SANDBOX_BASE;
}

function getAuthHeader(): string {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) throw new Error("MIDTRANS_SERVER_KEY belum diisi");
  // Midtrans Server Key dipakai sebagai Basic auth (username:server-key,
  // password kosong).
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

/** Panggil Midtrans /v2/charge dengan payment_type=qris. */
export async function chargeQris(input: ChargeQrisInput): Promise<ChargeQrisResult> {
  if (!isMidtransConfigured()) {
    throw new Error("Midtrans belum dikonfigurasi. Lihat docs/MIDTRANS.md");
  }

  const body = {
    payment_type: "qris",
    transaction_details: {
      order_id: input.orderCode,
      gross_amount: input.grossAmount,
    },
    qris: {
      acquirer: "gopay",
    },
    ...(input.customer ? {
      customer_details: {
        first_name: input.customer.name,
        email: input.customer.email,
        phone: input.customer.phone,
      },
    } : {}),
    ...(input.expiryMinutes
      ? {
          custom_expiry: {
            expiry_duration: input.expiryMinutes,
            unit: "minute",
          },
        }
      : {}),
  };

  const res = await fetch(`${getBaseUrl()}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Midtrans charge gagal (${res.status} ${res.statusText}): ${text.slice(0, 240)}`
    );
  }

  const data = (await res.json()) as MidtransChargeResponse;

  // Cari action "generate-qr-code" — berisi URL gambar QR.
  const qrAction = (data.actions ?? []).find(
    (a) => a.name === "generate-qr-code"
  );
  if (!qrAction?.url) {
    throw new Error(
      "Midtrans response tidak mengandung QR URL. Cek transaction_status / payment_type."
    );
  }

  // Midtrans kadang return expiry_time sebagai ISO string, kadang sebagai
  // "YYYY-MM-DD HH:MM:SS" tanpa zona. Normalisasi ke ISO.
  const expiresAt = data.expiry_time
    ? new Date(data.expiry_time).toISOString()
    : new Date(Date.now() + 30 * 60 * 1000).toISOString();

  return {
    transactionId: data.transaction_id,
    qrUrl: qrAction.url,
    expiresAt,
    status: data.transaction_status,
  };
}

/**
 * Panggil Midtrans /v2/{order_id}/status untuk cek status transaksi.
 * Dipakai oleh polling frontend (cadangan kalau webhook telat).
 */
export async function getOrderStatus(
  orderCode: string
): Promise<{ status: string; transactionStatus: string; transactionId: string } | null> {
  if (!isMidtransConfigured()) return null;

  const res = await fetch(`${getBaseUrl()}/v2/${encodeURIComponent(orderCode)}/status`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: getAuthHeader(),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as {
    transaction_id: string;
    transaction_status: string;
    status_code?: string;
  };
  return {
    transactionId: data.transaction_id,
    transactionStatus: data.transaction_status,
    status: data.status_code ?? "",
  };
}

/** Map Midtrans transaction_status ke status internal kita. */
export function mapMidtransStatus(transactionStatus: string): QrisStatus {
  const s = transactionStatus.toLowerCase();
  if (s === "capture" || s === "settlement") return "paid";
  if (s === "pending") return "pending";
  if (s === "expire") return "expired";
  if (s === "cancel") return "cancelled";
  if (s === "deny") return "failed";
  if (s === "refund") return "refunded";
  return "pending";
}

/**
 * Verifikasi signature webhook Midtrans (untuk endpoint /api/midtrans/webhook).
 *
 * Midtrans SHA-512(input) — input = order_id + status_code + gross_amount +
 * Server Key. Hex digest dibandingkan dengan `signature_key` di body.
 *
 * Lihat https://docs.midtrans.com/reference/signature-verification.
 *
 * Pakai Web Crypto API (tersedia di Node 18+ dan Edge runtime).
 */
export async function verifyWebhookSignatureAsync(input: {
  orderId: string;
  statusCode: string;
  grossAmount: string;
  signatureKey: string;
}): Promise<boolean> {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (!key) return false;
  const raw = `${input.orderId}${input.statusCode}${input.grossAmount}${key}`;
  try {
    const enc = new TextEncoder().encode(raw);
    const buf = await crypto.subtle.digest("SHA-512", enc);
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex === input.signatureKey;
  } catch {
    return false;
  }
}