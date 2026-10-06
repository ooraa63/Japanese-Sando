"use client";

/**
 * Client-side Google OAuth via Google Identity Services (GIS).
 *
 * Alih-alih pakai `supabase.auth.signInWithOAuth()` (yang redirect ke
 * `https://<project-ref>.supabase.co/auth/v1/callback` dan muncul di
 * consent screen Google), kita pakai GIS popup flow:
 *
 *   1. Load `https://accounts.google.com/gsi/client` script
 *   2. User klik tombol → Google munculkan account chooser (popup)
 *   3. Dapet Google JWT (id_token)
 *   4. Exchange JWT ke Supabase session via `signInWithIdToken()`
 *   5. Supabase bikin auth.users + customer_profiles row otomatis
 *
 * Hasil: consent screen Google cuma menampilkan nama app (bukan URL
 * Supabase). Pengalaman user lebih clean.
 *
 * Env yang dibutuhkan:
 *   NEXT_PUBLIC_GOOGLE_CLIENT_ID — Client ID dari Google Cloud Console.
 *
 * Supabase Setup (di dashboard, satu kali):
 *   Authentication → Providers → Google → Enable + paste Client ID/Secret
 *   (Supabase verify JWT via configured Secret — tidak peduli flow client-side).
 */

let scriptLoadingPromise: Promise<void> | null = null;

/** Load GIS script lazily (singleton). */
export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;
  scriptLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-google-identity]'
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Google Identity Services"))
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadingPromise = null;
      reject(new Error("Failed to load Google Identity Services"));
    };
    document.head.appendChild(script);
  });
  return scriptLoadingPromise;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              id_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: {
              type?: string;
              message?: string;
            }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
  }
}

/**
 * Trigger Google account chooser via GIS. Return Google id_token (JWT)
 * yang siap di-exchange ke Supabase. Pakai scope "openid email profile"
 * — minimum untuk Supabase signInWithIdToken.
 */
export async function requestGoogleIdToken(
  clientId: string
): Promise<string> {
  await loadGoogleIdentityScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google Identity Services not available");
  }

  return new Promise((resolve, reject) => {
    try {
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        reject(new Error("Google Identity Services not available"));
        return;
      }
      const client = oauth2.initTokenClient({
        client_id: clientId,
        scope: "openid email profile",
        callback: (response) => {
          if (response.error) {
            reject(
              new Error(
                `${response.error}: ${response.error_description ?? "unknown"}`
              )
            );
            return;
          }
          if (!response.id_token) {
            reject(new Error("Google did not return id_token"));
            return;
          }
          resolve(response.id_token);
        },
        error_callback: (err) => {
          reject(
            new Error(
              `Google OAuth failed: ${err.type ?? ""} ${err.message ?? ""}`.trim()
            )
          );
        },
      });
      client.requestAccessToken();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}