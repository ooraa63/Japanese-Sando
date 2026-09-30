import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Klien Supabase untuk Server Component / Route Handler.
 * Membaca session dari cookie dan meneruskannya ke RLS.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Dipanggil dari Server Component yang tidak bisa menulis cookie —
            // aman diabaikan karena middleware sudah menyegarkan session.
          }
        },
      },
    }
  );
}

/** True bila user yang sedang login terdaftar sebagai admin. */
export async function getIsAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}

/** Data admin yang sedang login (null kalau belum login / bukan admin). */
export async function getCurrentAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("admins")
    .select("user_id, email, full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;

  return { ...data, email: data.email ?? user.email ?? "" };
}
