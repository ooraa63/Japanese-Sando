"use client";

import { useMemo } from "react";
import { Minus, Plus, ShoppingBag, X, Trash2 } from "lucide-react";
import Image from "next/image";
import type { Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { formatIDR } from "@/lib/utils";

type CartLine = { flavor: Flavor; qty: number };

/**
 * Drawer keranjang — dipanggil dari ikon cart di step-step /order.
 * Mobile: slide up dari bawah. Desktop: panel di kanan.
 *
 * Berisi:
 *   - Daftar item per kategori (rasa saja — bundle menyusul).
 *   - Stepper +/- per item.
 *   - Catatan per item (inline).
 *   - Subtotal.
 */
export function CartDrawer({
  categories,
  open,
  onClose,
}: {
  categories: Category[];
  open: boolean;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();

  const allFlavors = useMemo(
    () => categories.flatMap((c) => c.flavors ?? []),
    [categories]
  );

  const cartLines = useMemo<CartLine[]>(
    () =>
      Object.entries(cart.quantities)
        .map(([id, qty]) => {
          const flavor = allFlavors.find((f) => String(f.id) === id);
          return flavor && qty > 0 ? { flavor, qty } : null;
        })
        .filter((x): x is CartLine => x !== null),
    [cart.quantities, allFlavors]
  );

  const subtotal = cartLines.reduce(
    (s, l) => s + l.flavor.price * l.qty,
    0
  );

  const totalItems = cart.totalItems;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center sm:justify-end">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-cocoa-950/60 backdrop-blur-sm"
      />
      <aside className="relative flex h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:inset-y-0 sm:right-0 sm:h-full sm:rounded-none sm:rounded-l-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-cocoa-100 bg-cream-50 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag className="size-5 text-matcha-600" />
            <h2 className="text-base font-bold text-cocoa-900">
              {t.cart.title}
            </h2>
            <span className="rounded-full bg-matcha-100 px-2.5 py-0.5 text-[11px] font-bold text-matcha-700 tabular">
              {totalItems}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100"
            aria-label="close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cartLines.length === 0 ? (
            <p className="py-12 text-center text-sm text-cocoa-400">
              {t.cart.empty}
            </p>
          ) : (
            <ul className="space-y-3">
              {cartLines.map((l) => {
                const note = cart.notes[String(l.flavor.id)] ?? "";
                return (
                  <li
                    key={l.flavor.id}
                    className="rounded-2xl border border-cocoa-200 bg-white p-3"
                  >
                    <div className="flex gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-cocoa-100">
                        {l.flavor.image_url ? (
                          <Image
                            src={l.flavor.image_url}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="absolute inset-0 grid place-items-center font-display text-base font-bold text-cocoa-300">
                            {l.flavor.name_id.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-cocoa-900">
                          {lang === "en" ? l.flavor.name_en : l.flavor.name_id}
                        </p>
                        <p className="text-xs text-cocoa-500 tabular">
                          {formatIDR(l.flavor.price, lang)} × {l.qty}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-extrabold text-cocoa-900 tabular">
                        {formatIDR(l.flavor.price * l.qty, lang)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="inline-flex items-stretch overflow-hidden rounded-lg border border-cocoa-200">
                        <button
                          type="button"
                          onClick={() =>
                            cart.setQuantity(l.flavor.id, l.qty - 1)
                          }
                          aria-label="-1"
                          className="grid size-8 place-items-center text-cocoa-500 transition hover:bg-cocoa-50"
                        >
                          {l.qty === 1 ? (
                            <Trash2 className="size-3.5" />
                          ) : (
                            <Minus className="size-3.5" />
                          )}
                        </button>
                        <div className="grid w-9 place-items-center text-sm font-bold text-cocoa-900 tabular">
                          {l.qty}
                        </div>
                        <button
                          type="button"
                          onClick={() => cart.setQuantity(l.flavor.id, l.qty + 1)}
                          aria-label="+1"
                          className="grid size-8 place-items-center bg-cocoa-800 text-white transition hover:bg-cocoa-700"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder={t.menu.notePlaceholder}
                      value={note}
                      onChange={(e) =>
                        cart.setNote(l.flavor.id, e.target.value)
                      }
                      maxLength={120}
                      className="input mt-2 !py-1.5 !text-[12px]"
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-cocoa-100 bg-cream-50 px-5 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-cocoa-700">{t.cart.subtotal}</span>
            <span className="font-display text-lg font-extrabold text-cocoa-900 tabular">
              {formatIDR(subtotal, lang)}
            </span>
          </div>
        </footer>
      </aside>
    </div>
  );
}

/** Ikon cart-button kecil dengan badge jumlah item — dipanggil dari header step. */
export function CartButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const cart = useCart();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative grid size-10 place-items-center rounded-xl border border-cocoa-200 bg-white text-cocoa-700 transition hover:bg-cocoa-100 ${className ?? ""}`}
      aria-label="Buka keranjang"
    >
      <ShoppingBag className="size-5" />
      {cart.totalItems > 0 ? (
        <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-matcha-500 px-1.5 text-[10px] font-extrabold text-white tabular shadow">
          {cart.totalItems}
        </span>
      ) : null}
    </button>
  );
}