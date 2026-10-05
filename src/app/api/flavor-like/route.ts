import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/flavor-like
 * Body: { flavor_id: number, session_id: string }
 * Response: { liked: boolean, likes_count: number }
 *
 * RPC `flavor_toggle_like` (migration-14) insert/hapus baris di
 * `flavor_likes` dan mengembalikan state like + counter terbaru.
 */
export async function POST(req: Request) {
  let body: { flavor_id?: number; session_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const flavorId = Number(body.flavor_id);
  const sessionId = String(body.session_id ?? "").trim();

  if (!Number.isInteger(flavorId) || flavorId <= 0 || !sessionId) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (sessionId.length > 100) {
    return NextResponse.json(
      { error: "session_id too long" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("flavor_toggle_like", {
    p_flavor_id: flavorId,
    p_session_id: sessionId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}