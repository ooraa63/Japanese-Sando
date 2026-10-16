"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { CartSheet } from "@/components/customer/CartSheet";
import { CartContents } from "@/components/customer/CartContents";
import { useCart } from "@/components/customer/CartProvider";
import { useI18n } from "@/lib/i18n";
import type { Flavor } from "@/lib/types";

/**
 * Ikon troli KECIL di header, untuk membuka isi keranjang.
 *
 * Steven 16-10-2026 (gambar 1): "saya gamau cart yang di home itu begitu, buat
 * aja seperti logo troli yang ada di kanan atas, kecil saja".
 *
 * Sebelumnya beranda memakai `CartDock` — bar gelap SELURUH lebar yang menutupi
 * kartu produk dan judul "Value bundles". Sekarang keranjang jadi tombol seukuran
 * ikon biasa di header, sama seperti ikon troli di tombol Pre-order.
 *
 * Knock-on yang bagus: pojok kanan bawah jadi kosong, jadi tombol WhatsApp
 * bisa benar-benar nempel di sana (lihat `WhatsAppFab`).
 *
 * Sifat:
 *   - Hanya muncul kalau keranjang ada isinya. Tombol kosong di header cuma
 *     menambah satu ikon lagi di top bar yang sudah padat.
 *   - Membuka `CartSheet` (sheet bawah di HP, drawer kanan di desktop).
 *   - Tombol "Lanjut" di dalam sheet membawa ke `/order`, karena beranda belum
 *     punya alur langkah.
 */
export function CartHeaderButton({ flavors }: { flavors: Flavor[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const { totalItems } = useCart();
  const [open, setOpen] = useState(false);

  if (totalItems === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-cart-header-button
        aria-label={t.cart.title}
        className="relative grid size-10 shrink-0 place-items-center rounded-xl text-cocoa-700 transition hover:bg-cocoa-100 active:bg-cocoa-200"
      >
        <ShoppingBag className="size-5" />
        {totalItems > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-honey-400 px-1 text-[10px] leading-4 font-extrabold text-cocoa-900 tabular">
            {totalItems}
          </span>
        ) : null}
      </button>

      <CartSheet open={open} onClose={() => setOpen(false)} title={t.cart.title}>
        <CartContents
          flavors={flavors}
          emptyText={t.cart.emptyOnHome}
          checkoutLabel={t.common.next}
          onCheckout={() => {
            setOpen(false);
            router.push("/order");
          }}
        />
      </CartSheet>
    </>
  );
}