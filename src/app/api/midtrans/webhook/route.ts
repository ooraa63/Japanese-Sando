import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  mapMidtransStatus,
  verifyWebhookSignatureAsync,
} from "@/lib/midtrans/server";

/**
 * Webhook Midtrans. Dipanggil Midtrans saat ada perubahan status pembayaran
 * (settlement → paid, expire, cancel, deny, refund).
 *
 * Docs: https://docs.midtrans.com/reference/webhook-notification.
 *
 * Body Midtrans (contoh):
 * {
 *   "transaction_id": "...",
 *   "order_id": "JS-...",
 *   "gross_amount": "35000.00",
 *   "payment_type": "qris",
 *   "transaction_status": "settlement",
 *   "status_code": "200",
 *   "signature_key": "...",
 *   ...
 * }
 *
 * Konfigurasi di dashboard Midtrans:
 *   Settings → Configuration → Payment → Notification URL:
 *     https://<your-domain>/api/midtrans/webhook
 *
 * Response kita: 200 OK (kalau valid). Midtrans retry kalau kita balas non-2xx.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // Butuh Buffer/require('node:crypto') untuk
                       // verifikasi SHA-512 sync. Edge runtime bisa juga,
                       // tapi Node lebih reliable untuk webhook.

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const orderId = String(body.order_id ?? "");
  const statusCode = String(body.status_code ?? "");
  const grossAmount = String(body.gross_amount ?? "");
  const signatureKey = String(body.signature_key ?? "");
  const transactionStatus = String(body.transaction_status ?? "");
  const transactionId = String(body.transaction_id ?? "");

  if (!orderId || !signatureKey) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 }
    );
  }

  // Verifikasi signature. Kalau MIDTRANS_SERVER_KEY belum di-set, return
  // 503 supaya Midtrans retry terus (lebih aman daripada menerima payload
  // yang tidak bisa diverifikasi).
  const isValid = await verifyWebhookSignatureAsync({
    orderId,
    statusCode,
    grossAmount,
    signatureKey,
  });
  if (!isValid) {
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 403 }
    );
  }

  // Map status Midtrans ke status internal kita, sync via Supabase RPC.
  const status = mapMidtransStatus(transactionStatus);

  const supabase = await createClient();
  // Pakai transaction_id (bukan order_id) supaya set_order_qris_status bisa
  // menemukan order yang tepat.
  if (transactionId) {
    const { error } = await supabase.rpc("set_order_qris_status", {
      p_transaction_id: transactionId,
      p_status: status,
    });
    if (error) {
      console.error("set_order_qris_status gagal:", error.message);
      // Tetap 200 OK supaya Midtrans tidak retry terus-menerus kalau
      // errornya internal. Tapi log untuk observability.
    }
  } else {
    console.warn("Webhook tanpa transaction_id:", orderId);
  }

  return NextResponse.json({ ok: true });
}

/** GET untuk sanity-check (cek webhook URL hidup). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "midtrans-webhook",
    accept: "POST",
  });
}