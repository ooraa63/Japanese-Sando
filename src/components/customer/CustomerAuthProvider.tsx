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
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

const PROFILE_CACHE_KEY = "js_customer_profile_v1";

/**
 * Provider autentikasi customer.
 *
 * - Saat mount: cek sesi Supabase. Kalau ada, ambil profil via RPC
 *   `customer_profile()` dan simpan ke localStorage supaya render pertama
 *   di server bisa menampilkan header yang konsisten (guest vs logged in).
 * - Subscribe ke `supabase.auth.onAuthStateChange` supaya login/logout
 *   dari tab lain atau dari server action tercermin langsung.
 *
 * SSR: di server `profile` selalu null dan `loading` = true. Saat client
 * mount, kita set state asinkron. Komponen yang sangat sensitif (mis.
 * tombol sign out) boleh disable selama loading.
 */
export function CustomerAuthProvider({
  children,
  initialProfile = null,
}: {
  children: ReactNode;
  initialProfile?: CustomerProfile | null;
}) {
  const [profile, setProfile] = useState<CustomerProfile | null>(initialProfile);
  const [loading, setLoading] = useState(true);

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
      try {
        window.localStorage.removeItem(PROFILE_CACHE_KEY);
      } catch {
        // abaikan
      }
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

  // Pertama kali mount di browser: cek sesi + sinkronkan profil.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (user) {
          await refresh();
        } else {
          setProfile(null);
          try {
            window.localStorage.removeItem(PROFILE_CACHE_KEY);
          } catch {
            // abaikan
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  // Dengarkan perubahan sesi Supabase (login dari tab lain, logout, dll).
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void refresh();
      } else {
        setProfile(null);
        try {
          window.localStorage.removeItem(PROFILE_CACHE_KEY);
        } catch {
          // abaikan
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [refresh]);

  const value = useMemo<CustomerAuthValue>(
    () => ({ profile, loading, refresh, signOutClient }),
    [profile, loading, refresh, signOutClient]
  );

  return (
    <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error("useCustomerAuth harus dipakai di dalam <CustomerAuthProvider>");
  return ctx;
}