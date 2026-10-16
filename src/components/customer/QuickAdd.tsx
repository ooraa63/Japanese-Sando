"use client";

/**
 * Popup tambah cepat ke keranjang dari BERANDA.
 *
 * Steven 14-10-2026: "yang di home yang untuk bundle, favorite, intinya
 * semua makanan saya mau buat dimana saat kita tap, bisa popup untuk kita add
 * to cart".
 *
 * Sebelumnya kartu di beranda cuma lihat-saja — diklik tidak terjadi apa-apa,
 * pembeli harus pindah ke `/order` dulu. Sekarang satu ketukan langsung
 * membuka popup: lihat harga, atur jumlah, masukkan keranjang.
 *
 * Struktur penting:
 * -.Provider ini di PASANG SEKALI di `src/app/page.tsx`, lalu
 *   `FlavorCard` / `BundleCard` memanggil `useQuickAdd()` sendiri. Jadi tidak
 *   ada prop yang diteruskan melewati beberapa komponen (AppHome ->
 *   NewShowcase -> FlavorCard), dan halaman lain yang memakai kartu yang sama
 *   tidak ikut berubah.
 * - `OrderBundleModal` (popup pilih isi paket) DIPAKAI ULANG, bukan ditulis
 *   ulang — itu modal yang sudah benar, sudah memvalidasi jumlah slot sama
 *   dengan `required_qty` dan sudah menambahkannya ke keranjang sendiri.
 */

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Image from "next/image";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import type { Bundle, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatIDR } from "@/lib/utils";
import { useCart } from "@/components/customer/CartProvider";
import { CartHeaderButton } from "@/components/customer/CartHeaderButton";
import { OrderBundleModal } from "@/components/customer/OrderBundleModal";
import { flatFlavors } from "@/lib/cart";
import { useSoldCounts } from "@/lib/useSoldCounts";

interface QuickAddValue {
  /** Buka popup tambah cepat untuk satu rasa. */
  openFlavor: (flavor: Flavor) => void;
  /** Buka popup pilih isi paket. */
  openBundle: (bundle: Bundle) => void;
  /** Kunci keranjang boleh dibuka dari beranda (selalu true saat provider ada). */
  enabled: boolean;
  /**
   * Daftar rasa untuk merakit isi keranjang (nama, harga, foto).
   *
   * Tombol troli di header membutuhkannya: yang tersimpan di localStorage hanya
   * id rasa, jadi tanpa katalog halaman tidak bisa menampilkan apa isi keranjang.
   */
  flavors: Flavor[];
}

const QuickAddContext = createContext<QuickAddValue | null>(null);

/**
 * Hook pemanggil popup.
 *
 * Kalau komponen berada di luar provider (mis. halaman `/order`), hook ini
 * mengembalikan `null` — bukan melempar error — supaya kartu rasa di
 * `/order` tetap aman memakai komponen yang sama.
 */
export function useQuickAdd(): QuickAddValue | null {
  return useContext(QuickAddContext);
}

export function QuickAddProvider({
  categories,
  children,
}: {
  categories: Category[];
  children: React.ReactNode;
}) {
  const [flavor, setFlavor] = useState<Flavor | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const soldCounts = useSoldCounts();

  const openFlavor = useCallback((f: Flavor) => setFlavor(f), []);
  const openBundle = useCallback((b: Bundle) => setBundle(b), []);
  const closeFlavor = useCallback(() => setFlavor(null), []);
  const closeBundle = useCallback(() => setBundle(null), []);

  // Steven 15-10-2026: "Pada home, tambahkan keranjang juga..." Daftar rasa ini
  // yang dipakai tombol troli di header untuk merakit isi keranjang.
  const flavors = useMemo(() => flatFlavors(categories), [categories]);

  const value = useMemo<QuickAddValue>(
    () => ({ openFlavor, openBundle, enabled: true, flavors }),
    [openFlavor, openBundle, flavors]
  );

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddModal flavor={flavor} onClose={closeFlavor} />
      <OrderBundleModal
        bundle={bundle}
        categories={categories}
        soldCounts={soldCounts}
        open={bundle != null}
        onClose={closeBundle}
      />
    </QuickAddContext.Provider>
  );
}

/**
 * Tombol troli keranjang untuk dipasang di header beranda.
 *
 * Sengaja memakai `useQuickAdd()` (bukan menerima `flavors` sebagai prop)
 * supaya `page.tsx` tidak perlu memanggil `flatFlavors` sendiri dan daftar
 * rasa tetap punya satu sumber kebenaran.
 */
export function HomeCartButton() {
  const ctx = useQuickAdd();
  if (!ctx) return null;
  return <CartHeaderButton flavors={ctx.flavors} />;
}

/**
 * Isi popup: foto, nama, harga, jumlah, tombol tambah.
 *
 * Memakai `setQuantity` (bukan `add`) supaya kalau pembeli sebenarnya sudah
 * punya 2 pcs dan memilih 3 lagi, totalnya jadi 3 — bukan 5. `add()` selalu
 * menambah satu.
 */
function QuickAddModal({
  flavor,
  onClose,
}: {
  flavor: Flavor | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const [qty, setQty] = useState(1);

  // Reset jumlah tiap kali popup dibuka untuk rasa yang berbeda.
  const [lastFlavorId, setLastFlavorId] = useState<number | null>(null);
  if (flavor && flavor.id !== lastFlavorId) {
    setLastFlavorId(flavor.id);
    setQty(1);
  }

  if (!flavor) return null;

  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  const inCart = cart.quantities[String(flavor.id)] ?? 0;

  const confirm = () => {
    cart.setQuantity(flavor.id, qty);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-cocoa-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Foto — tinggi dibatasi supaya di HP popup tidak menutupi layar. */}
        <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-cocoa-300 to-cocoa-500">
          {flavor.image_url ? (
            <Image
              src={flavor.image_url}
              alt={name}
              fill
              sizes="(max-width: 640px) 100vw, 384px"
              className="object-cover"
            />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t.order.payment.cancel}
            className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-white/90 text-cocoa-700 transition hover:bg-white"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <p className="text-lg leading-tight font-extrabold text-cocoa-900">{name}</p>
          <p className="mt-1 text-base font-bold text-cocoa-700 tabular">
            {formatIDR(flavor.price, lang)}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
              {t.common.qty}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label={`-1 ${name}`}
                className="grid size-9 place-items-center rounded-xl border border-cocoa-200 text-cocoa-700 transition hover:bg-cocoa-50 disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center text-base font-bold tabular">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                aria-label={`+1 ${name}`}
                className="grid size-9 place-items-center rounded-xl border border-cocoa-200 text-cocoa-700 transition hover:bg-cocoa-50"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {inCart > 0 ? (
            <p className="mt-3 text-[12px] text-cocoa-500">
              {t.cart.alreadyInCart.replace("{n}", String(inCart))}
            </p>
          ) : null}

          <button
            type="button"
            onClick={confirm}
            className="btn-matcha mt-4 w-full !py-3"
          >
            <ShoppingBag className="size-4" />
            {t.cart.quickAdd}
          </button>
        </div>
      </div>
    </div>
  );
}