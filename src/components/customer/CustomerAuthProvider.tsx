"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CustomerProfile } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export type AuthModalMode = "login" | "register";

interface CustomerAuthValue {
  /** null = belum login / sesi tidak valid. */
  profile: CustomerProfile | null;
  /** true saat pertama kali memuat dari server (atau localStorage). */
  loading: boolean;
  /**
   * Sinkronkan ulang profil dengan server. Dipakai setelah register /
   * update identitas / sign-in dari server action.
   */
  refresh: () => Promise<void>;
  /** Hapus sesi di client + Supabase cookies. Redirect dilakukan oleh caller. */
  signOutClient: () => Promise<void>;

  /* ---------------------------------------------------------------------
   * Modal kontrol — dipakai oleh SiteHeader & komponen lain untuk membuka
   * popup login/register tanpa harus navigate ke /login atau /register.
   * ------------------------------------------------------------------- */
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
  /** Buka modal dengan mode tertentu. Idempotent. */
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
  /** Ganti mode tanpa menutup modal (bis). */
  setAuthModalMode: (mode: AuthModalMode) => void;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

const PROFILE_CACHE_KEY = "js_customer_profile_v1";

/**
 * Baca cache profil dari localStorage kalau ada. Dipakai untuk render pertama
 * di client supaya tidak flash "logged out" selagi server-side refresh
 * Supabase session sedang jalan (token refresh di background, dsb).
 *
 * Cache hanya dipakai untuk display, bukan untuk auth — signIn/signOut/
 * server action selalu nge-fetch fresh dari server.
 */
function readCachedProfile(): CustomerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerProfile;
  } catch {
    return null;
  }
}

/**
 * Provider autentikasi customer.
 *
 * - Server render: `profile` di-seed dari `initialProfile` (server fetch via
 *   `customer_profile()` RPC). Client mount: kalau `initialProfile` null tapi
 *   localStorage cache ada (token di-refresh sebentar, dsb), pakai cache dulu
 *   supaya UI gak flash "logged out". Lalu refresh dari server di background.
 * - Subscribe ke `supabase.auth.onAuthStateChange`. Hanya setProfile(null)
 *   kalau event-nya `SIGNED_OUT` — event lain dengan session null (mis.
 *   `INITIAL_SESSION` saat token habis + refresh sebentar, atau sementara
 *   `TOKEN_REFRESHED` gagal) JANGAN langsung clear UI; tunggu konfirmasi.
 *
 * Tujuan: konsisten tampil logged-in selama sesi Supabase masih recoverable
 * (refresh token valid). Cuma SIGNED_OUT eksplisit yang membuat UI logout.
 */
export function CustomerAuthProvider({
  children,
  initialProfile = null,
}: {
  children: ReactNode;
  initialProfile?: CustomerProfile | null;
}) {
  // Pakai cache lokal kalau initialProfile null — mencegah UI flash logged-out
  // saat server-side getCustomerProfile gagal karena race / expired token.
  const [profile, setProfile] = useState<CustomerProfile | null>(
    initialProfile ?? readCachedProfile()
  );
  const [loading, setLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>("login");

  const openAuthModal = useCallback((mode: AuthModalMode = "login") => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);
  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  const fetchProfile = useCallback(async (): Promise<CustomerProfile | null> => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("customer_profile");
      if (error || !data) return null;
      return data as CustomerProfile;
    } catch {
      return null;
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await fetchProfile();
    setProfile(next);
    if (next) {
      try {
        window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(next));
      } catch {
        // abaikan
      }
    } else {
      // Jangan clear cache kalau ternyata tidak ada session (bisa jadi
      // transient token refresh issue) — server action yang valid akan
      // overwrite cache kalau perlu.
    }
  }, [fetchProfile]);

  const signOutClient = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // abaikan — cookie mungkin sudah kadaluarsa
    }
    setProfile(null);
    try {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    } catch {
      // abaikan
    }
  }, []);

  // Pertama kali mount di browser: kalau initialProfile null tapi cache ada,
  // pakai cache supaya UI gak flash. Lalu refresh di background untuk
  // sinkronisasi. Pakai getSession() (auto-refresh token expired) bukan
  // getUser() (strict validation).
  //
  // PENTING: initialProfile TIDAK masuk dep array — efek ini hanya boleh
  // jalan sekali saat mount. Kalau dep initialProfile, setiap kali layout
  // re-render dengan initialProfile baru, efek re-fire dan bisa null-kan
  // state saat ada transient mismatch antara server (expired token) vs
  // client (refresh jalan).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        // getSession() auto-refreshes jika access token expired dan refresh
        // token masih valid — lebih reliable buat checking session state.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          await refresh();
        }
        // Kalau session null di mount → kemungkinan memang belum login.
        // Tetap clear cache stale. Profile state akan tetap null dari
        // initialProfile=null (server bilang belum login).
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dengarkan perubahan sesi Supabase. Hanya treat SIGNED_OUT event
  // sebagai logout definitif — event lain dengan session null sementara
  // (mis. INITIAL_SESSION sebelum hydrate, atau transient refresh issue)
  // JANGAN langsung clear profile.
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Event eksplisit logout dari Supabase.
      if (event === "SIGNED_OUT") {
        setProfile(null);
        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch {
          // abaikan
        }
        return;
      }
      // Session null + event lain = bisa transient (refresh sebentar, dll).
      // Cuma sync kalau server-side signal lain sudah konfirm logout.
      // Untuk aman, kalau session null DAN gak ada profile sama sekali → clear.
      if (session?.user) {
        void refresh();
        setAuthModalOpen(false);
        return;
      }
      // session null tapi bukan SIGNED_OUT — JANGAN clear profile.
      // Tetap biarkan UI logged in kalau sebelumnya sudah ada profile.
      // Supabase akan emit SIGNED_OUT eksplisit kalau sesi benar-benar
      // berakhir; sampai itu, kita keep state.
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      profile,
      loading,
      refresh,
      signOutClient,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      setAuthModalMode,
    }),
    [
      profile,
      loading,
      refresh,
      signOutClient,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
      setAuthModalMode,
    ]
  );

  return (
    <CustomerAuthContext.Provider value={value}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) {
    throw new Error(
      "useCustomerAuth harus dipanggil dari dalam <CustomerAuthProvider>"
    );
  }
  return ctx;
}