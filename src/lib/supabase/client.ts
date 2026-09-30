import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | undefined;

/**
 * Klien Supabase untuk sisi browser / Client Component.
 * Memakai anon (publishable) key — semua hak akses ditegakkan oleh RLS + RPC.
 */
export function createClient(): SupabaseClient {
  if (cached) return cached;
  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
  return cached;
}
