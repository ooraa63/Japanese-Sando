"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronUp, ShoppingBag } from "lucide-react";
import { CartSheet } from "@/components/customer/CartSheet";
import { CartContents } from "@/components/customer/CartContents";
import { useCart } from "@/components/customer/CartProvider";
import { cartLinesFrom, cartSubtotal } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatIDR } from "@/lib/utils";
import type { Flavor } from "@/lib/types";

/**
 * Pemicu keranjang yang melayang, plus sheet yang dibuka saat diketuk.
 *
 * Steven 15-10-2026:
 *   1. "Untuk bagian bawah keranjang itu, setelah di click jangan langsung next
 *      tapi ada keranjang dulu seperti dulu ada pesanan apa aja baru lanjut."
 *      Dulu dock ini langsung memanggil `onCheckout`. Sekarang ia hanya membuka
 *      `CartSheet`; tombol "Lanjut" ada di dalam sheet itu.
 *   2. "Pada home, tambahkan keranjang juga jadi ketika mereka klik masukkan
 *      ke keranjang yang di home, mereka juga bisa lihat ada apa aja."
 *      Komponen ini sekarang dipasang di beranda juga, bukan cuma di `/order`.
 *
 * Bentuknya berbeda per layar:
 *   - Mobile: bar penuh di bawah layar (persis seperti bar sebelumnya), supaya
 *     jari telunjuk mendarat di tempat yang sama seperti tidak ada apa-apa.
 *   - Desktop: kartu kecil melayang di kanan bawah. Bar penuh di layar lebar
 *     terlihat seperti iklan, bukan alat. Kartu kecil + drawer kanan jauh lebih
 *     terasa tenang dan tidak menutupi konten.
 *
 * Pemakai cukup menulis `onCheckout` sekali:
 *   - kosong -> tombol navigating ke `/order` (dipakai di beranda, yang belum
 *     punya alur langkah),
 *   - fungsi -> tombol menjalankan langkah berikutnya (dipakai di `/order`).
 */
export function CartDock({
  flavors,
  onCheckout,
  checkoutLabel,
  emptyText,
  className = "",
}: {
  flavors: Flavor[];
  /** Langkah berikutnya. Kosong = tombol menuju `/order`. */
  onCheckout?: () => void;
  /** Label tombol di dalam sheet. Bawaan: `t.common.next`. */
  checkoutLabel?: string;
  /** Teks saat keranjang kosong. */
  emptyText?: string;
  className?: string;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "";

  /* Nav bawah (`MobileBottomNav`) menutupi dasar layar di semua halaman
     KECUALI empat halaman ini - persis kondisi `hidden` di sana. Kalau
     dock tidak ikut naik, di beranda ia menimpa nav dan pembeli tidak
     bisa menekan Beranda atau Orderan lagi.

     Syaratnya ditulis ulang di sini, bukan diimpor, supaya `CartDock`
     tidak perlu tahu apa pun soal `MobileBottomNav`. Kalau daftar
     halaman yang disembunyikan nav berubah, ubah DI DUA tempat lalu
     cek ulang posisinya di browser. */
  const adaNavBawah =
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/login") &&
    !pathname.startsWith("/register") &&
    !pathname.startsWith("/order");
  const { quantities, notes, bundles, totalItems } = useCart();
  const [open, setOpen] = useState(false);

  if (totalItems === 0) return null;

  const byId = new Map(flavors.map((f) => [f.id, f]));
  const lines = cartLinesFrom(quantities, byId, notes);
  const subtotal = cartSubtotal(lines, bundles);

  return (
    <>
      <div
        data-cart-dock
        className={`fixed right-0 left-0 z-30 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))]
          lg:right-6 lg:bottom-6 lg:left-auto lg:px-0 lg:pb-0 ${
          adaNavBawah
            ? "bottom-[calc(68px+env(safe-area-inset-bottom))]"
            : "bottom-0"
        } ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-cart-dock-button
          className="group flex w-full items-center gap-3 rounded-2xl bg-cocoa-800 px-4 py-3 text-left text-cream-50 shadow-xl transition enabled:hover:bg-cocoa-900 enabled:active:scale-[0.99] lg:w-80 lg:rounded-2xl lg:py-3.5"
        >
          <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-matcha-500">
            <ShoppingBag className="size-5" />
            <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-honey-400 px-1 text-[10px] font-extrabold text-cocoa-900 tabular">
              {totalItems}
            </span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm leading-tight font-extrabold">
              {totalItems} {totalItems === 1 ? t.common.itemOne : t.common.itemMany}
            </span>
            <span className="mt-0.5 block truncate text-[12px] font-semibold text-cream-200">
              {t.cart.view}
            </span>
          </span>

          <span className="shrink-0 text-sm leading-none font-extrabold tabular">
            {formatIDR(subtotal, lang)}
          </span>
          <ChevronUp className="size-4 shrink-0 text-cream-200 transition group-hover:-translate-y-0.5" />
        </button>
      </div>

      <CartSheet open={open} onClose={() => setOpen(false)} title={t.cart.title}>
        <CartContents
          flavors={flavors}
          emptyText={emptyText}
          checkoutLabel={checkoutLabel ?? t.common.next}
          onCheckout={() => {
            setOpen(false);
            // Tanpa `onCheckout`, dock-nya dipasang di halaman yang belum punya alur
            // langkah (beranda), jadi tombolnya membawa ke `/order`.
            if (onCheckout) onCheckout();
            else router.push("/order");
          }}
        />
      </CartSheet>

      {/* Spacer: dock-nya `fixed`, jadi tidak menambah tinggi halaman.
          Tanpa ini, baris terakhir beranda (CTA penutup + footer) tertutup
          dock. */}
      <div aria-hidden className="h-24 lg:hidden" />
    </>
  );
}