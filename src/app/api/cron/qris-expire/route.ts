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
 *
 * PENTING: route ini BUKAN penjadwal. Kalau `SUPABASE_SERVICE_ROLE_KEY` tidak
 * di-set, route hanya melaporkan "tidak dijalankan" dengan status 200 — bukan
 * error, karena pekerjaan expiry-nya sudah otomatis dikerjakan `pg_cron` di
 * dalam database (lihat migration-37).
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
    // Bukan error: penjadwal yang sesungguhnya adalah job `qris-expire` di
    // pg_cron (migration-37), dan job itu tidak butuh env aplikasi sama sekali.
    // Route ini murni pemicu manual opsional, jadi balas 200 + penjelasan
    // supaya tidak terlihat seperti crash kalau tanpa service key.
    return NextResponse.json({
      ok: true,
      ran: false,
      reason: !url ? "missing_supabase_url" : "missing_service_role_key",
      note:
        "Route ini hanya pemicu manual. Expiry QRIS tetap berjalan otomatis " +
        "lewat job pg_cron 'qris-expire'. Set SUPABASE_SERVICE_ROLE_KEY hanya " +
        "kalau memang perlu memicu RPC ini manual.",
    });
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
  return NextResponse.json({ ok: true, ran: true, expired });
}