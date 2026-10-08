import { NextResponse } from "next/server";

/**
 * Pemicu manual untuk `expire_stale_qris_orders()`.
 *
 * JADWAL UTAMA sekarang ada di `pg_cron` (lihat migration-37): database
 * memanggil RPC-nya sendiri tiap menit, jadi tidak bergantung paket Vercel
 * sama sekali. Route ini sengaja tetap ada untuk:
 *   - tes manual setelah pasang cron,
 *   - pemicu dari cron pihak ketiga kalau diperlukan nanti.
 *
 * Kenapa tidak pakai Vercel Cron: project ini plan Hobby, yang membatasi cron
 * maksimal 2x sehari — jadwal tiap menit tidak akan pernah dipicu.
 *
 * Autentikasi: set header `Authorization: Bearer $CRON_SECRET` kalau env
 * `CRON_SECRET` tersedia. Kalau env-nya kosong, route tetap boleh jalan supaya
 * mudah dites manual.
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