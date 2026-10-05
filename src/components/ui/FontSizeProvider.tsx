"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

/**
 * Mode tampilan:
 *  - "normal"   : default, font 16px, kartu 1 kolom di mobile.
 *  - "compact"  : font ~14px, kartu flavor/kategori 2 kolom di mobile,
 *                 padding lebih rapat. Pembeli yang layar HP-nya kecil
 *                 bisa melihat lebih banyak item sekaligus.
 *
 * Disimpan di localStorage supaya konsisten antar reload / halaman.
 * Diterapkan ke <html> via atribut `data-density` (lihat globals.css).
 */

export type DensityMode = "normal" | "compact";

const STORAGE_KEY = "js_density_v1";

interface DensityStore {
  mode: DensityMode;
}

const EMPTY_STORE: DensityStore = Object.freeze({ mode: "normal" });

let store: DensityStore = EMPTY_STORE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function write(next: DensityStore) {
  store = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* abaikan */
  }
  // Terapkan ke <html> segera (sebelum emit) supaya tidak ada flash layout.
  if (typeof document !== "undefined") {
    document.documentElement.dataset.density = next.mode;
  }
  emit();
}

function readStorage(): DensityStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "normal" };
    const parsed = JSON.parse(raw) as Partial<DensityStore>;
    if (parsed.mode === "compact") return { mode: "compact" };
    return { mode: "normal" };
  } catch {
    return { mode: "normal" };
  }
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  store = readStorage();
  if (typeof document !== "undefined") {
    document.documentElement.dataset.density = store.mode;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => store;
const getServerSnapshot = (): DensityStore => EMPTY_STORE;

interface DensityContextValue {
  mode: DensityMode;
  setMode: (m: DensityMode) => void;
  toggle: () => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

export function FontSizeProvider({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined") hydrate();

  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Pasang dataset ke <html> di SSR-friendly way juga (fallback).
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.density = current.mode;
    }
  }, [current.mode]);

  const value: DensityContextValue = {
    mode: current.mode,
    setMode: (m) => {
      if (m === store.mode) return;
      write({ mode: m });
    },
    toggle: () => write({ mode: store.mode === "compact" ? "normal" : "compact" }),
  };

  return (
    <DensityContext.Provider value={value}>{children}</DensityContext.Provider>
  );
}

export function useFontSize(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error("useFontSize harus dipakai di dalam <FontSizeProvider>");
  return ctx;
}
