"use client";

import Image from "next/image";
import { Minus, Package, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/components/customer/CartProvider";
import { cartLinesFrom, cartSubtotal } from "@/lib/cart";
import { useI18n } from "@/lib/i18n";
import { formatIDR } from "@/lib/utils";
import type { Flavor } from "@/lib/types";

/**
 * Isi keranjang: daftar item, stepper jumlah, subtotal, dan tombol lanjut.
 *
 * Steven 15-10-2026: "Untuk bagian bawah keranjang itu, setelah di click jangan
 * langsung next tapi ada keranjang dulu seperti dulu ada pesanan apa aja baru
 * lanjut". Jadi bar bawah tidak lagi langsung melompat ke pembayaran - ia
 * membuka tampilan keranjang dulu, dan tombol "Lanjut" ada DI DALAM tampilan itu.
 *
 * Komponen ini dipakai di dua tempat tanpa diubah strukturnya:
 *   - `CartSheet`  (drawer bawah di HP, drawer kanan di desktop)
 *   - `CartRail`   (panel samping yang menempel di halaman `/order`)
 *
 * Jadi daftar item + subtotal + tombolnya hanya ada SATU implementasi. Kalau
 * nanti tampilan keranjang berubah, cukup ubah di sini.
 *
 * Harga dihitung ulang dari `lib/cart.ts` dengan rumus yang sama persis dengan
 * `OrderFlow` dan `create_order`, supaya angka yang dilihat pembeli sebelum
 * lanjut sama dengan yang ditagih di akhir.
 */
export function CartContents({
  flavors,
  onCheckout,
  checkoutLabel,
  checkoutIcon,
  emptyText,
  footer = true,
}: {
  /** Daftar rasa yang boleh ditampilkan (dari `public_menu()`). */
  flavors: Flavor[];
  /** Dipanggil saat tombol lanjut ditekan. */
  onCheckout?: () => void;
  /** Label tombol lanjut. Kosong = tombol tidak dirender. */
  checkoutLabel?: string;
  checkoutIcon?: React.ReactNode;
  /** Override teks keranjang kosong. Bawaan: `t.cart.empty`. */
  emptyText?: string;
  /** Render subtotal + tombol. `false` kalau panel menaruh tombol sendiri. */
  footer?: boolean;
}) {
  const { t, lang } = useI18n();
  const { quantities, notes, bundles, setQuantity, removeBundle } = useCart();

  const byId = new Map(flavors.map((f) => [f.id, f]));
  const lines = cartLinesFrom(quantities, byId, notes);
  const subtotal = cartSubtotal(lines, bundles);
  const totalItems =
    lines.reduce((s, l) => s + l.qty, 0) +
    bundles.reduce(
      (s, b) => s + b.slots.filter((x) => x !== null).length,
      0,
    );

  if (totalItems === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-cocoa-100 text-cocoa-400">
          <ShoppingBag className="size-7" />
        </span>
        <p className="max-w-xs text-sm text-cocoa-500">
          {emptyText ?? t.cart.empty}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* ---------- Daftar item ---------- */}
      <ul className="min-h-0 flex-1 divide-y divide-cocoa-100 overflow-y-auto">
        {lines.map((line) => {
          const nama = lang === "en" ? line.flavor.name_en : line.flavor.name_id;
          return (
            <li key={line.flavor.id} className="flex items-center gap-3 px-4 py-3">
              <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-cocoa-100">
                {line.flavor.image_url ? (
                  <Image
                    src={line.flavor.image_url}
                    alt={nama}
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="grid size-full place-items-center text-cocoa-400">
                    <ShoppingBag className="size-4" />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                {/* Nama boleh dua baris. Di rail desktop (22rem) kolom
                    nama cuma menyisakan ~100px kalau dipaksa satu baris,
                    sehingga "Cookies & Cream" terpotong jadi "Cooko...". */}
                <span className="block text-sm leading-snug font-bold text-cocoa-800">
                  {nama}
                </span>
                {line.note ? (
                  <span className="mt-0.5 block truncate text-[11px] text-cocoa-400">
                    {t.common.note}: {line.note}
                  </span>
                ) : null}
                <span className="mt-0.5 block text-[11px] text-cocoa-500 tabular">
                  {formatIDR(line.flavor.price, lang)}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1 rounded-full border border-cocoa-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setQuantity(line.flavor.id, line.qty - 1)}
                  aria-label={`${t.common.qty} - 1`}
                  className="grid size-6 place-items-center rounded-full text-cocoa-600 transition hover:bg-cocoa-100"
                >
                  <Minus className="size-3.5" />
                </button>
                <span className="w-4 text-center text-sm font-extrabold text-cocoa-800 tabular">
                  {line.qty}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity(line.flavor.id, line.qty + 1)}
                  aria-label={`${t.common.qty} + 1`}
                  className="grid size-6 place-items-center rounded-full bg-cocoa-100 text-cocoa-700 transition hover:bg-cocoa-200"
                >
                  <Plus className="size-3.5" />
                </button>
              </span>

              <span className="w-16 shrink-0 text-right text-sm font-extrabold text-cocoa-900 tabular">
                {formatIDR(line.flavor.price * line.qty, lang)}
              </span>
            </li>
          );
        })}

        {bundles.map((entry) => {
          const nama = lang === "en" ? entry.bundle.name_en : entry.bundle.name_id;
          const isi = entry.slots
            .map((id) => (id == null ? null : byId.get(id)))
            .filter((f): f is Flavor => Boolean(f))
            .map((f) => (lang === "en" ? f.name_en : f.name_id));
          return (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-matcha-100">
                {entry.bundle.image_url ? (
                  <Image
                    src={entry.bundle.image_url}
                    alt={nama}
                    fill
                    sizes="48px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="grid size-full place-items-center text-matcha-600">
                    <Package className="size-4" />
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                {/* Sama seperti baris rasa satuan: dua baris, bukan satu. */}
                <span className="block text-sm leading-snug font-bold text-cocoa-800">
                  {nama}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-cocoa-500">
                  {t.cart.bundleSlots.replace("{flavors}", isi.join(", ") || "-")}
                </span>
                {entry.note ? (
                  <span className="mt-0.5 block truncate text-[11px] text-cocoa-400">
                    {t.common.note}: {entry.note}
                  </span>
                ) : null}
              </span>

              <button
                type="button"
                onClick={() => removeBundle(entry.id)}
                aria-label={t.cart.removeItem}
                className="grid size-8 shrink-0 place-items-center rounded-full text-cocoa-400 transition hover:bg-cocoa-100 hover:text-berry-500"
              >
                <Trash2 className="size-4" />
              </button>

              <span className="w-16 shrink-0 text-right text-sm font-extrabold text-cocoa-900 tabular">
                {formatIDR(entry.bundle.price, lang)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* ---------- Subtotal + tombol lanjut ---------- */}
      {footer ? (
        <div className="shrink-0 border-t border-cocoa-100 bg-cocoa-50/70 px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-bold tracking-wider text-cocoa-500 uppercase">
              {t.cart.subtotal}
            </span>
            <span className="text-lg font-extrabold text-cocoa-900 tabular">
              {formatIDR(subtotal, lang)}
            </span>
          </div>

          {checkoutLabel && onCheckout ? (
            <button type="button" onClick={onCheckout} className="btn-matcha mt-3 w-full">
              {checkoutIcon ?? null}
              {checkoutLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}