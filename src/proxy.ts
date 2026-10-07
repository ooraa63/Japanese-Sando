import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/order", "/track", "/admin/login", "/admin/setup"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // berkas statis: /foto-awal.jpeg, /favicon.ico, dll
  );
}

/**
 * Menyegarkan session Supabase dari cookie dan menjaga halaman admin tetap privat.
 *
 * Catatan penting: pakai `getSession()` (bukan `getUser()`) supaya @supabase/ssr
 * otomatis refresh access token kalau expired tapi refresh token masih valid.
 * `getUser()` strict validation — bakal return null kalau access token expired,
 * yang kemudian bikin layout `getCustomerProfile()` return null (swallow JWT
 * expired), sehingga user "terlihat logout" sampai refresh berikutnya.
 *
 * getSession() secara internal memanggil refresh jika perlu, dan setAll() di
 * bawah akan propagate cookies baru ke request + response.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // getSession() auto-refresh expired access token kalau refresh token valid.
  // Penting: di Vercel/Node.js runtime, ini jalan di setiap request yang
  // match, sehingga session hampir selalu fresh saat sampai ke Server
  // Component / RPC.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && isPublicPath(pathname) === false) {
    if (!session?.user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpeg|jpg|png|webp|avif|svg|ico)$).*)",
  ],
};