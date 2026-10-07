import { NextResponse } from "next/server";

/**
 * Cron: expire QRIS yang lewat masa berlaku.
 *
 * Vercel Cron memanggil `GET /api/cron/qris-expire` tiap menit (lihat
 * `vercel.json`). Fungsinya memanggil RPC `expire_stale_qris_orders()` yang
 * menandai order QRIS `pending` yang `qris_expires_at < now()` jadi
 * `expired` + `cancelled` dan mengembalikan stok kategori.
 *
 * Kenapa perlu cron (bukan_and relying on webhook Midtrans):
 *   Kalau pembeli menutup modal QRIS / tidak bayar sama sekali, Midtrans
 *   TIDAK mengirim webhook apa pun. Order akan menggantung selamanya di
 *   `qris_status='pending'`. Cron inilah yang menutup celah itu.
 *
 * Autentikasi: Vercel mengirim header `Authorization: Bearer $CRON_SECRET`
 *   kalau env `CRON_SECRET` di-set. Kalau env-nya kosong (mis. di preview
 *   tanpa secret), route tetap boleh jalan supaya mudah dites manual —
 *   tapi tidak ada yang bisa memicu lewat URL publik tanpa secret di prod.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    if (header !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }
  }

  // Supabase service-role client: RPC-nya hanya di-grant ke service_role,
  // jadi kita wajib pakai service key (bukan session anon user).
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: "missing_supabase_service_env" },
      { status: 500 }
    );
  }

  const res = await fetch(`${url}/rest/v1/rpc/expire_stale_qris_orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({}),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("expire_stale_qris_orders gagal:", res.status, detail);
    return NextResponse.json(
      { ok: false, error: "rpc_failed", status: res.status },
      { status: 500 }
    );
  }

  const expired = Number(await res.text());
  return NextResponse.json({ ok: true, expired });
}