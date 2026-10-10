"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Store "produk yang aku suka", dipakai bersama oleh kartu Populer di beranda
 * dan kartu di halaman menu.
 *
 * Kenapa store modul-level, bukan `useState` per kartu:
 * kartu yang sama bisa muncul di beberapa tempat sekaligus (mis. grid Populer
 * dan daftar menu lengkap di halaman yang sama). Kalau tiap kartu punya
 * state sendiri, pencetan hati di satu tempat tidak langsung terlihat di
 * tempat lain.
 *
 * Like dicatat di dua tempat, sama seperti FlavorCard:
 *  - `localStorage` (key `like:flavor:<id>`) supaya instan & bertahan reload,
 *  - tabel `flavor_likes` lewat POST /api/flavor-like, untuk counter global.
 *
 * Kalau offline / server gagal, pilihan lokal tetap disimpan: lebih baik
 * counter server yang telat sinkron daripada pilihan yang hilang.
 */

const KEY_PREFIX = "like:flavor:";
const SESSION_KEY = "sando_session_id";

/* ---------- snapshot: WAJIB referensinya stabil ---------- */
/*
 * `useSyncExternalStore` membandingkan snapshot dengan `Object.is` setiap
 * render. Kalau fungsi ini mengembalikan array BARU tiap panggilan, React
 * menganggap store terus berubah -> render tak terbatas. Jadi hasilnya
 * di-cache dan hanya diganti kalau isi storage benar-benar berbeda.
 * (Lihat gotchas.md #23 dan #31.)
 */
let cachedRaw: string | null = null;
let cachedIds: number[] = [];

const listeners = new Set<() => void>();

/** Counter dari server; menimpa `flavor.likes_count` kalau sudah sync. */
let countOverrides: Record<number, number> = {};

function readLikedIds(): number[] {
  let raw = "";
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      if (window.localStorage.getItem(key) !== "1") continue;
      raw += key + ";";
    }
  } catch {
    return [];
  }
  if (raw === cachedRaw) return cachedIds;

  cachedRaw = raw;
  cachedIds = raw
    .split(";")
    .filter(Boolean)
    .map((k) => Number(k.replace(KEY_PREFIX, "")))
    .filter((id) => Number.isFinite(id) && id > 0);
  return cachedIds;
}

function emit() {
  // Paksa baca ulang storage: cache sengaja dibuang supaya isi barunya
  // benar-benar dihitung ulang.
  cachedRaw = null;
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const EMPTY: number[] = [];

/** Session-id per perangkat; sama seperti FlavorCard. */
function getSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    let s = window.localStorage.getItem(SESSION_KEY);
    if (!s) {
      s = `s-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      window.localStorage.setItem(SESSION_KEY, s);
    }
    return s;
  } catch {
    return "ssr";
  }
}

export interface UseFlavorLikes {
  /** Id produk yang sedang ICM ini. */
  likedIds: number[];
  likedSet: Set<number>;
  /** Apakah produk ini sudah di-like. */
  isLiked: (id: number) => boolean;
  /** Counter like yang benar (memakai override dari server kalau ada). */
  count: (id: number, fallback: number) => number;
  /** Nyalakan / matikan like. Optimistic: storage berubah duluan. */
  toggle: (id: number) => void;
}

export function useFlavorLikes(): UseFlavorLikes {
  const likedIds = useSyncExternalStore(subscribe, readLikedIds, () => EMPTY);

  const likedSet = useMemo(() => new Set(likedIds), [likedIds]);

  const toggle = useCallback((id: number) => {
    const wasLiked = readLikedIds().includes(id);

    // 1. Tulis ke storage dulu supaya UI berubah seketika.
    const key = `${KEY_PREFIX}${id}`;
    try {
      if (wasLiked) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, "1");
    } catch {
      /* storage penuh / diblokir — tetap coba server */
    }
    emit();

    // 2. Sinkronkan ke server. Kegagalan tidak membatalkan pilihan lokal.
    void (async () => {
      try {
        const res = await fetch("/api/flavor-like", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ flavor_id: id, session_id: getSessionId() }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          likes_count?: number;
        };
        if (typeof data?.likes_count === "number") {
          countOverrides = { ...countOverrides, [id]: data.likes_count };
          emit();
        }
      } catch {
        /* offline — counter akan sinkron lain kali */
      }
    })();
  }, []);

  const isLiked = useCallback((id: number) => likedSet.has(id), [likedSet]);

  const count = useCallback(
    (id: number, fallback: number) => countOverrides[id] ?? fallback,
    []
  );

  return { likedIds, likedSet, isLiked, count, toggle };
}