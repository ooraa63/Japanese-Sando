"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  chargeQris,
  getOrderStatus,
  isMidtransConfigured,
  mapMidtransStatus,
  type QrisStatus,
} from "@/lib/midtrans/server";

/* =============================================================================
 *  QRIS Midtrans — order creation + status polling
 * ========================================================================== */

export interface CreateQrisOrderResult {
  ok: boolean;
  error?: string;
  /** Data order yang baru dibuat (kalau ok). */
  order?: {
    code: string;
    qrUrl: string;
    transactionId: string;
    expiresAt: string;
    grossAmount: number;
  };
}

const qrisOrderSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerEmail: z.string().trim().max(120).optional().nullable(),
  instagram: z.string().trim().min(1).max(40),
  phone: z.string().trim().min(9).max(30),
  deliveryMethod: z.enum(["pickup", "delivery"]),
  deliveryZone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional().nullable(),
  addressNote: z.string().trim().max(120).optional().nullable(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  note: z.string().trim().max(500).optional(),
  items: z.array(
    z.object({
      flavor_id: z.number().int().positive(),
      quantity: z.number().int().positive(),
      note: z.string().trim().max(200).optional().nullable(),
    })
  ),
  bundles: z.array(
    z.object({
      bundle_id: z.number().int().positive(),
      slots: z.array(z.object({ flavor_id: z.number().int().positive() })).min(1).max(20),
      note: z.string().trim().max(200).optional().nullable(),
    })
  ),
  language: z.enum(["id", "en"]).default("id"),
  userId: z.string().uuid().nullable().optional(),
});

/**
 * Buat order dengan payment_method='qris_midtrans' + panggil Midtrans untuk
 * generate QR dinamis. Return: order code + QR URL + expiry.
 *
 * Dipakai dari OrderFlow step 'payment' saat user pilih opsi QRIS Midtrans
 * dan klik 'Bayar dengan QRIS'.
 */
export async function createQrisOrderAction(
  _prev: CreateQrisOrderResult | null,
  formData: FormData
): Promise<CreateQrisOrderResult> {
  if (!isMidtransConfigured()) {
    return { ok: false, error: "midtrans_not_configured" };
  }

  try {

  // Parse payload dari formData (single JSON field).
  let payload: unknown;
  try {
    const json = String(formData.get("payload") ?? "");
    payload = JSON.parse(json);
  } catch {
    return { ok: false, error: "invalid_payload" };
  }

  const parsed = qrisOrderSchema.safeParse(payload);
  if (!parsed.success) {
    console.error("[qris-actions] zod failed:", parsed.error.flatten());
    return { ok: false, error: "invalid_payload" };
  }
  const data = parsed.data;

  // Pre-validate bundle slots length vs bundle.required_qty dari DB.
  // RPC `create_order` raise `invalid_quantity` kalau slots.length != required_qty
  // dan bundle gak punya qty yg valid. Pre-check ini biar error-nya lebih jelas.
  if (data.bundles.length > 0) {
    const supabaseForBundles = await createClient();
    const bundleIds = Array.from(new Set(data.bundles.map((b) => b.bundle_id)));
    const { data: bundleRows } = await supabaseForBundles
      .from("bundles")
      .select("id, required_qty, is_active")
      .in("id", bundleIds);
    const requiredByBundle = new Map<number, { required_qty: number; is_active: boolean }>();
    for (const row of bundleRows ?? []) {
      requiredByBundle.set(row.id, { required_qty: row.required_qty, is_active: row.is_active });
    }
    for (const b of data.bundles) {
      const info = requiredByBundle.get(b.bundle_id);
      if (!info) {
        return { ok: false, error: "bundle_not_found" };
      }
      if (!info.is_active) {
        return { ok: false, error: "bundle_unavailable" };
      }
      if (b.slots.length !== info.required_qty) {
        console.error("[qris-actions] bundle slots length mismatch:", {
          bundle_id: b.bundle_id,
          slots_length: b.slots.length,
          required_qty: info.required_qty,
        });
        return { ok: false, error: "bundle_incomplete" };
      }
    }
  }

  const supabase = await createClient();

  // 1. Buat order dengan payment_method='qris_midtrans'. Backend create_order
  //    sudah support nilai ini (lihat migration-18). Bukti transfer di-skip
  //    karena QRIS tidak butuh upload bukti.
  let rpcResult: { order_code: string; order_id: number } | null = null;
  let rpcErr: { message: string } | null = null;
  try {
    const result = await supabase.rpc("create_order", {
      p_customer_name: data.customerName,
      p_customer_email: data.customerEmail ?? null,
      p_instagram: data.instagram,
      p_phone: data.phone,
      p_payment_method: "qris_midtrans",
      p_delivery_method: data.deliveryMethod,
      p_delivery_zone: data.deliveryZone ?? (data.deliveryMethod === "delivery" ? "other" : "pickup"),
      p_address: data.address ?? null,
      p_address_note: data.addressNote ?? null,
      p_lat: data.lat ?? null,
      p_lng: data.lng ?? null,
      p_payment_proof: null,
      p_note: data.note ?? null,
      p_language: data.language,
      p_items: data.items,
      p_bundles: data.bundles,
      p_user_id: data.userId ?? null,
    });
    rpcResult = result.data as { order_code: string; order_id: number } | null;
    rpcErr = result.error;
  } catch (e) {
    // Supabase rpc() bisa throw alih-alih rt/nil + error (mis. network,
    // JWT expired, abort). Tangkap dan log supaya gak silent-fail ke outer catch.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[qris-actions] create_order THREW:", msg, { stack: e instanceof Error ? e.stack : undefined });
    rpcErr = { message: msg };
  }

  if (rpcErr || !rpcResult) {
    const msg = rpcErr?.message ?? "rpc_failed";
    console.error("[qris-actions] create_order failed:", msg, { rpcErr });
    return { ok: false, error: mapRpcError(msg) };
  }

  const orderCode = (rpcResult as { order_code: string; order_id: number })
    .order_code;
  const grossAmount = await getOrderTotal(orderCode);
  if (grossAmount == null) {
    console.error("[qris-actions] order_total_missing for", orderCode);
    return { ok: false, error: "order_total_missing" };
  }

  // 2. Panggil Midtrans untuk generate QR.
  try {
    const charge = await chargeQris({
      orderCode,
      grossAmount,
      customer: {
        name: data.customerName,
        email: data.customerEmail ?? undefined,
        phone: data.phone,
      },
      // QR expired setelah 5 menit — biar gak ngegantungin QR yang udah hangus.
      expiryMinutes: 5,
    });

    // 3. Simpan transaction_id + QR URL + expiry ke order via RPC.
    const { error: setErr } = await supabase.rpc("set_order_qris_charge", {
      p_order_code: orderCode,
      p_transaction_id: charge.transactionId,
      p_qr_url: charge.qrUrl,
      p_expires_at: charge.expiresAt,
    });
    if (setErr) {
      console.error("[qris-actions] set_order_qris_charge gagal:", setErr.message, {
        orderCode,
        transactionId: charge.transactionId,
      });
      return { ok: false, error: "save_charge_failed" };
    }

    revalidatePath("/account");
    return {
      ok: true,
      order: {
        code: orderCode,
        qrUrl: charge.qrUrl,
        transactionId: charge.transactionId,
        expiresAt: charge.expiresAt,
        grossAmount,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[qris-actions] midtrans_charge or set_charge gagal:", msg, { stack: e instanceof Error ? e.stack : undefined });
    return { ok: false, error: "midtrans_charge_failed" };
  }
} catch (outerErr) {
  // Safety net: kalau ada error di luar try-catch dalam (mis. schema validation,
  // payload decode, dll), log dan return generic supaya gak silent-fail.
  const msg = outerErr instanceof Error ? outerErr.message : String(outerErr);
  console.error("[qris-actions] outer error:", msg, { stack: outerErr instanceof Error ? outerErr.stack : undefined });
  return { ok: false, error: "generic" };
}
}

/** Ambil total_price dari orders (private). Dipakai oleh createQrisOrderAction
 *  untuk gross_amount Midtrans. */
async function getOrderTotal(orderCode: string): Promise<number | null> {
  const supabase = await createClient();
  // Kita tidak bisa SELECT langsung dari orders (customer tidak login),
  // jadi pakai public_invoice RPC (return total).
  const { data, error } = await supabase.rpc("public_invoice", { p_code: orderCode });
  if (error || !data) return null;
  return (data as { total: number }).total;
}

function mapRpcError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("below_min_order")) return "below_min_order";
  if (m.includes("invalid_phone")) return "invalid_phone";
  if (m.includes("invalid_name")) return "invalid_name";
  if (m.includes("invalid_email")) return "invalid_email";
  if (m.includes("invalid_instagram")) return "invalid_instagram";
  if (m.includes("invalid_quantity")) return "invalid_quantity";
  if (m.includes("flavor_unavailable")) return "flavor_unavailable";
  if (m.includes("insufficient_stock")) return "insufficient_stock";
  if (m.includes("address_required")) return "address_required";
  if (m.includes("preorder_closed")) return "preorder_closed";
  if (m.includes("empty_cart")) return "empty_cart";
  if (m.includes("too_many_items")) return "too_many_items";
  if (m.includes("name_too_long")) return "name_too_long";
  if (m.includes("settings_missing")) return "settings_missing";
  if (m.includes("invalid_payment_method")) return "invalid_payment_method";
  if (m.includes("invalid_delivery_method")) return "invalid_delivery_method";
  if (m.includes("invalid_delivery_zone")) return "invalid_delivery_zone";
  return "generic";
}

/* ---------- Polling status ---------- */

export interface QrisStatusResult {
  ok: boolean;
  status?: QrisStatus;
  /** Order status kalau QRIS sudah paid/expired (sync). */
  orderStatus?: string;
  error?: string;
}

/**
 * Polling status QRIS order. Dipakai frontend setiap 5 detik selama user
 * di halaman QR. Cek ke Midtrans langsung (cadangan webhook).
 */
export async function checkQrisStatusAction(
  orderCode: string
): Promise<QrisStatusResult> {
  if (!orderCode) return { ok: false, error: "no_code" };

  // 1. Cek Midtrans langsung.
  const status = await getOrderStatus(orderCode);
  if (!status) {
    // Midtrans tidak merespons (env belum di-set atau network error).
    // Fallback ke RPC publik supaya kita tetap bisa render status kalau
    // webhook sudah pernah update DB.
    const supabase = await createClient();
    const { data } = await supabase.rpc("public_order_qris_status", { p_code: orderCode });
    if (!data) return { ok: false, error: "not_found" };
    return {
      ok: true,
      status: (data as { qris_status: QrisStatus | null }).qris_status ?? "pending",
      orderStatus: (data as { order_status: string }).order_status,
    };
  }

  // 2. Sync ke DB kalau ada perubahan status (idempotent).
  const newStatus = mapMidtransStatus(status.transactionStatus);
  const supabase = await createClient();
  const { data: dbRow } = await supabase.rpc("public_order_qris_status", { p_code: orderCode });
  const dbStatus = (dbRow as { qris_status: QrisStatus | null } | null)?.qris_status;

  // Kalau DB belum up-to-date dengan Midtrans, update lewat RPC.
  if (
    dbStatus !== newStatus &&
    (newStatus === "paid" ||
      newStatus === "expired" ||
      newStatus === "failed" ||
      newStatus === "refunded" ||
      newStatus === "cancelled")
  ) {
    await supabase.rpc("set_order_qris_status", {
      p_transaction_id: status.transactionId,
      p_status: newStatus,
    });
  }

  return {
    ok: true,
    status: newStatus,
    orderStatus: dbStatus === newStatus ? (dbRow as { order_status: string })?.order_status : undefined,
  };
}