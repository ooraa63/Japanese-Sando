"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Flavor, PaymentMethod } from "@/lib/types";

/**
 * Keranjang pre-order disimpan di localStorage supaya pembeli tidak
 * kehilangan pesanan kalau halaman di-refresh atau tab ditutup.
 *
 * Dipakai sebagai external store (useSyncExternalStore) supaya:
 *  - semua komponen selalu melihat data yang sama,
 *  - tidak ada cascading render saat sinkronisasi localStorage,
 *  - render pertama di server tetap konsisten (tidak ada hydration error).
 */
export interface CartDraft {
  name: string;
  phone: string;
  note: string;
  paymentMethod: PaymentMethod | null;
  transferMethod: string;
  proofPath: string | null;
}

export interface CartStore {
  /** flavorId (string) -> jumlah */
  quantities: Record<string, number>;
  draft: CartDraft;
}

interface CartContextValue {
  quantities: Record<string, number>;
  draft: CartDraft;
  add: (flavor: Flavor) => void;
  setQuantity: (flavorId: number, qty: number) => void;
  remove: (flavorId: number) => void;
  /** Kosongkan semuanya (keranjang + data). */
  clear: () => void;
  /** Kosongkan keranjang tapi pertahankan data pengirim. */
  reset: () => void;
  /** Hapus nama + nomor telepon saja. */
  clearIdentity: () => void;
  updateDraft: (patch: Partial<CartDraft>) => void;
  totalItems: number;
}

const STORAGE_KEY = "js_cart_v1";

const EMPTY_DRAFT: CartDraft = {
  name: "",
  phone: "",
  note: "",
  paymentMethod: null,
  transferMethod: "",
  proofPath: null,
};

/** Snapshot server: objek stabil supaya React bisa membandingkan secara referensial. */
const EMPTY_STORE: CartStore = Object.freeze({
  quantities: Object.freeze({}) as Record<string, number>,
  draft: EMPTY_DRAFT,
});

let store: CartStore = EMPTY_STORE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function write(next: CartStore) {
  store = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Kuota penuh / mode privat — abaikan, state tetap jalan di memori.
  }
  emit();
}

function readStorage(): CartStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { quantities: {}, draft: EMPTY_DRAFT };
    const parsed = JSON.parse(raw) as Partial<CartStore>;
    const quantities: Record<string, number> = {};
    for (const [id, qty] of Object.entries(parsed.quantities ?? {})) {
      const n = Number(qty);
      if (Number.isFinite(n) && n > 0) quantities[id] = n;
    }
    return { quantities, draft: { ...EMPTY_DRAFT, ...(parsed.draft ?? {}) } };
  } catch {
    return { quantities: {}, draft: EMPTY_DRAFT };
  }
}

/** Idempoten — aman dipanggil berkali-kali. */
function hydrate() {
  if (hydrated) return;
  hydrated = true;
  store = readStorage();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => store;
const getServerSnapshot = () => EMPTY_STORE;

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  // Idempoten + hanya di browser, jadi aman dipanggil saat render.
  if (typeof window !== "undefined") hydrate();

  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const add = useCallback((flavor: Flavor) => {
    const key = String(flavor.id);
    const max = flavor.stock_enabled ? Math.max(1, flavor.stock) : 99;
    const next = Math.min((store.quantities[key] ?? 0) + 1, max);
    if (next === store.quantities[key]) return;
    write({ ...store, quantities: { ...store.quantities, [key]: next } });
  }, []);

  const setQuantity = useCallback((flavorId: number, qty: number) => {
    const key = String(flavorId);
    const quantities = { ...store.quantities };
    if (qty <= 0) delete quantities[key];
    else quantities[key] = qty;
    write({ ...store, quantities });
  }, []);

  const remove = useCallback((flavorId: number) => setQuantity(flavorId, 0), [setQuantity]);

  const clear = useCallback(() => {
    write({ quantities: {}, draft: EMPTY_DRAFT });
  }, []);

  const updateDraft = useCallback((patch: Partial<CartDraft>) => {
    write({ ...store, draft: { ...store.draft, ...patch } });
  }, []);

  /**
   * Mengosongkan keranjang. Dipakai setelah pesanan berhasil dikirim supaya
   * pembeli tidak Order ulang isi pesanan lama secara tidak sengaja.
   */
  const reset = useCallback(() => {
    write({ quantities: {}, draft: EMPTY_DRAFT });
  }, []);

  /**
   * Menghapus nama & nomor telepon saja, tanpa menyentuh isi keranjang.
   * Dipanggil saat pembeli meninggalkan halaman /order, supaya data pribadi
   * tidak ikut tersimpan untuk pesanan berikutnya.
   */
  const clearIdentity = useCallback(() => {
    const next = { ...store.draft, name: "", phone: "" };
    if (next.name === store.draft.name && next.phone === store.draft.phone) return;
    write({ ...store, draft: next });
  }, []);

  const totalItems = Object.values(current.quantities).reduce((s, q) => s + q, 0);

  const value: CartContextValue = {
    quantities: current.quantities,
    draft: current.draft,
    add,
    setQuantity,
    remove,
    clear,
    reset,
    clearIdentity,
    updateDraft,
    totalItems,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart harus dipakai di dalam <CartProvider>");
  return ctx;
}
