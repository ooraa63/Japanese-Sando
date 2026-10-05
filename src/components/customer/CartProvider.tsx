"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type {
  Bundle,
  CartBundleEntry,
  DeliveryMethod,
  Flavor,
  PaymentMethod,
} from "@/lib/types";

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
  email: string;
  instagram: string;
  phone: string;
  note: string;
  address: string;
  addressNote: string;
  lat: number | null;
  lng: number | null;
  deliveryMethod: DeliveryMethod;
  deliveryZone: string;
  paymentMethod: PaymentMethod | null;
  transferMethod: string;
  proofPath: string | null;
}

export interface CartStore {
  /** flavorId (string) -> jumlah */
  quantities: Record<string, number>;
  /** flavorId (string) -> catatan per item (mis. "jangan pakai cabe") */
  notes: Record<string, string>;
  /** Bundle yang sudah dipilih pembelanja, dengan slot terisi. */
  bundles: CartBundleEntry[];
  draft: CartDraft;
}

interface CartContextValue {
  quantities: Record<string, number>;
  /** Catatan per rasa (key = flavorId sebagai string). */
  notes: Record<string, string>;
  /** Bundle di keranjang. */
  bundles: CartBundleEntry[];
  draft: CartDraft;
  add: (flavor: Flavor) => void;
  setQuantity: (flavorId: number, qty: number) => void;
  remove: (flavorId: number) => void;
  setNote: (flavorId: number, note: string) => void;
  /**
   * Tambah bundle ke keranjang. `slots` harus berisi `required_qty`
   * flavorId (sudah tervalidasi di UI sebelum dipanggil). `note` opsional,
   * mis. "jangan pakai cabe" — berlaku untuk semua slot.
   */
  addBundle: (bundle: Bundle, slots: number[], note?: string) => string;
  removeBundle: (entryId: string) => void;
  /** Set catatan untuk satu bundle entry (entryId, bukan bundleId). */
  setBundleNote: (entryId: string, note: string) => void;
  /** Kosongkan semuanya (keranjang + data). */
  clear: () => void;
  /** Kosongkan keranjang tapi pertahankan data pengirim. */
  reset: () => void;
  /** Hapus nama + email + nomor telepon saja. */
  clearIdentity: () => void;
  updateDraft: (patch: Partial<CartDraft>) => void;
  totalItems: number;
}

const STORAGE_KEY = "js_cart_v1";

const EMPTY_DRAFT: CartDraft = {
  name: "",
  email: "",
  instagram: "",
  phone: "",
  note: "",
  address: "",
  addressNote: "",
  lat: null,
  lng: null,
  deliveryMethod: "pickup",
  deliveryZone: "pickup",
  paymentMethod: null,
  transferMethod: "",
  proofPath: null,
};

/** Snapshot server: objek stabil supaya React bisa membandingkan secara referensial. */
const EMPTY_STORE: CartStore = Object.freeze({
  quantities: Object.freeze({}) as Record<string, number>,
  notes: Object.freeze({}) as Record<string, string>,
  bundles: Object.freeze([]) as unknown as CartBundleEntry[],
  draft: EMPTY_DRAFT,
});

let store: CartStore = EMPTY_STORE;
let hydrated = false;
const listeners = new Set<() => void>();

/**
 * Bentuk store juga menyimpan catatan per-item. Kita tambahkan ke tipe
 * `CartStore` di runtime lewat assignment setelah deklarasi (lihat di
 * bawah). Pendekatan ini membuat migrasi CartStore lama tetap valid.
 */

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

/** Set catatan untuk satu flavor (key = String(flavorId)). */
function setNote(flavorId: number, note: string) {
  const key = String(flavorId);
  const notes = { ...store.notes };
  if (note.trim()) notes[key] = note.trim();
  else delete notes[key];
  write({ ...store, notes });
}

function readStorage(): CartStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        quantities: {},
        notes: {},
        bundles: [],
        draft: EMPTY_DRAFT,
      };
    }
    const parsed = JSON.parse(raw) as Partial<CartStore>;
    const quantities: Record<string, number> = {};
    for (const [id, qty] of Object.entries(parsed.quantities ?? {})) {
      const n = Number(qty);
      if (Number.isFinite(n) && n > 0) quantities[id] = n;
    }
    const notes: Record<string, string> = {};
    for (const [id, n] of Object.entries(parsed.notes ?? {})) {
      if (typeof n === "string" && n.trim()) notes[id] = n;
    }
    const bundles: CartBundleEntry[] = Array.isArray(parsed.bundles)
      ? (parsed.bundles as unknown as CartBundleEntry[]).filter(
          (b) =>
            b &&
            typeof b.id === "string" &&
            b.bundle &&
            typeof b.bundle.id === "number" &&
            typeof b.bundle.required_qty === "number" &&
            Array.isArray(b.slots) &&
            // Sanitasi: drop bundle dari localStorage kalau slots.length tidak
            // match bundle.required_qty (mis. bundle config berubah atau
            // storage corrupt). RPC create_order raise invalid_quantity kalau
            // length-nya salah, jadi lebih baik drop di sini.
            b.slots.length === b.bundle.required_qty &&
            // Tiap slot harus flavorId positif (atau null).
            b.slots.every((s: unknown) => s === null || (typeof s === "number" && s > 0))
        )
      : ([] as CartBundleEntry[]);
    return {
      quantities,
      notes,
      bundles,
      draft: { ...EMPTY_DRAFT, ...(parsed.draft ?? {}) },
    };
  } catch {
    return { quantities: {}, notes: {}, bundles: [], draft: EMPTY_DRAFT };
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
    const next = (store.quantities[key] ?? 0) + 1;
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

  const addBundle = useCallback(
    (bundle: Bundle, slots: number[], note?: string): string => {
      const id = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const trimmedNote = note?.trim();
      const entry: CartBundleEntry = {
        id,
        bundle,
        slots,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      };
      write({ ...store, bundles: [...store.bundles, entry] });
      return id;
    },
    []
  );

  const removeBundle = useCallback((entryId: string) => {
    const next = store.bundles.filter((b) => b.id !== entryId);
    if (next.length === store.bundles.length) return;
    write({ ...store, bundles: next });
  }, []);

  const setBundleNote = useCallback((entryId: string, note: string) => {
    const next = store.bundles.map((b) => {
      if (b.id !== entryId) return b;
      const trimmed = note.trim();
      const copy: CartBundleEntry = { ...b };
      if (trimmed) copy.note = trimmed;
      else delete copy.note;
      return copy;
    });
    if (
      next.every((b, i) => b.note === store.bundles[i].note && b.id === store.bundles[i].id)
    ) {
      return;
    }
    write({ ...store, bundles: next });
  }, []);

  const clear = useCallback(() => {
    write({ quantities: {}, notes: {}, bundles: [], draft: EMPTY_DRAFT });
  }, []);

  const updateDraft = useCallback((patch: Partial<CartDraft>) => {
    write({ ...store, draft: { ...store.draft, ...patch } });
  }, []);

  /**
   * Mengosongkan keranjang. Dipakai setelah pesanan berhasil dikirim supaya
   * pembeli tidak Order ulang isi pesanan lama secara tidak sengaja.
   */
  const reset = useCallback(() => {
    write({ quantities: {}, notes: {}, bundles: [], draft: EMPTY_DRAFT });
  }, []);

  /**
   * Menghapus nama & nomor telepon saja, tanpa menyentuh isi keranjang.
   * Dipanggil saat pembeli meninggalkan halaman /order, supaya data pribadi
   * tidak ikut tersimpan untuk pesanan berikutnya.
   */
  const clearIdentity = useCallback(() => {
    const next = {
      ...store.draft,
      name: "",
      email: "",
      instagram: "",
      phone: "",
    };
    if (
      next.name === store.draft.name &&
      next.email === store.draft.email &&
      next.instagram === store.draft.instagram &&
      next.phone === store.draft.phone
    ) {
      return;
    }
    write({ ...store, draft: next });
  }, []);

  // Total pcs fisik = item satuan + slot bundle (1 slot = 1 pcs fisik).
  const totalItemsFromQty = Object.values(current.quantities).reduce(
    (s, q) => s + q,
    0
  );
  const totalItemsFromBundles = current.bundles.reduce(
    (s, b) => s + b.slots.filter((x) => x !== null).length,
    0
  );
  const totalItems = totalItemsFromQty + totalItemsFromBundles;

  const value: CartContextValue = {
    quantities: current.quantities,
    notes: current.notes ?? {},
    bundles: current.bundles ?? [],
    draft: current.draft,
    add,
    setQuantity,
    remove,
    setNote,
    addBundle,
    removeBundle,
    setBundleNote,
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
