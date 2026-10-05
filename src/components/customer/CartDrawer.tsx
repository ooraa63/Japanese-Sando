"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  Gift,
  MessageSquare,
  Minus,
  Plus,
  ShoppingBag,
  X,
  Trash2,
} from "lucide-react";
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
 *   - Daftar item per kategori (rasa satuan).
 *   - Daftar bundle yang sudah dipilih (dengan ringkasan slot).
 *   - Stepper +/- per item.
 *   - Catatan per item (inline).
 *   - Subtotal.
 */
export function CartDrawer({
  categories,
  open,
  onClose,
  onContinue,
  continueLabel,
  continueDisabled,
}: {
  categories: Category[];
  open: boolean;
  onClose: () => void;
  /**
   * Dipakai oleh OrderFlow step 'menu': tombol 'Lanjut' di dalam drawer
   * yang menutup drawer dan maju ke step berikutnya (payment). Kalau tidak
   * di-pass, drawer tidak punya tombol continue (cukup close).
   */
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
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

  // Subtotal item satuan + bundle.
  const subtotalItems = cartLines.reduce(
    (s, l) => s + l.flavor.price * l.qty,
    0
  );
  const subtotalBundles = cart.bundles.reduce(
    (s, b) => s + b.bundle.price,
    0
  );
  const subtotal = subtotalItems + subtotalBundles;

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
          {cartLines.length === 0 && cart.bundles.length === 0 ? (
            <p className="py-12 text-center text-sm text-cocoa-400">
              {t.cart.empty}
            </p>
          ) : (
            <ul className="space-y-3">
              {/* ----- Item satuan ----- */}
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

              {/* ----- Bundle entries ----- */}
              {cart.bundles.map((entry) => {
                const bName = lang === "en" ? entry.bundle.name_en : entry.bundle.name_id;
                return (
                  <li
                    key={entry.id}
                    className="rounded-2xl border-2 border-honey-300/60 bg-honey-300/10 p-3"
                  >
                    <div className="flex gap-3">
                      <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-honey-300 to-berry-500">
                        {entry.bundle.image_url ? (
                          <Image
                            src={entry.bundle.image_url}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="absolute inset-0 grid place-items-center text-white/70">
                            <Gift className="size-5" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold tracking-wide text-berry-600 uppercase">
                          {t.menu.bundleLabel}
                        </p>
                        <p className="truncate text-sm font-bold text-cocoa-900">
                          {bName}
                        </p>
                        <p className="text-[11px] text-cocoa-500">
                          {t.menu.bundleIncludes.replace(
                            "{n}",
                            String(entry.bundle.required_qty)
                          )}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-extrabold text-cocoa-900 tabular">
                        {formatIDR(entry.bundle.price, lang)}
                      </p>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <ul className="flex flex-wrap gap-1.5 text-[11px] text-cocoa-600">
                        {entry.slots.map((flavorId, idx) => {
                          const flavor = allFlavors.find((f) => f.id === flavorId);
                          const fname = flavor
                            ? lang === "en"
                              ? flavor.name_en
                              : flavor.name_id
                            : `#${flavorId}`;
                          return (
                            <li
                              key={idx}
                              className="rounded-full bg-cocoa-100 px-2 py-0.5"
                            >
                              <span className="font-bold text-cocoa-500">
                                {idx + 1}.
                              </span>{" "}
                              {fname}
                            </li>
                          );
                        })}
                      </ul>
                      <button
                        type="button"
                        onClick={() => cart.removeBundle(entry.id)}
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-cocoa-400 transition hover:bg-berry-500/10 hover:text-berry-500"
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    {/* Catatan bundle (opsional). Pakai ID entry (bukan
                        bundleId) supaya user bisa edit per-bundle-entry. */}
                    <div className="relative mt-2">
                      <MessageSquare className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-cocoa-400" />
                      <input
                        type="text"
                        maxLength={120}
                        placeholder={t.menu.bundleNoteLabel}
                        value={entry.note ?? ""}
                        onChange={(e) =>
                          cart.setBundleNote(entry.id, e.target.value)
                        }
                        className="input !py-2 !pl-9 !text-[12px]"
                      />
                    </div>
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
          {onContinue ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                // Panggil onContinue setelah drawer mulai menutup supaya
                // tidak terjadi double-render yang terlihat patah.
                requestAnimationFrame(() => onContinue());
              }}
              disabled={continueDisabled}
              className="btn-primary mt-3 w-full !py-3 text-[15px]"
            >
              {continueLabel ?? t.common.next}
              <ArrowRight className="size-4" />
            </button>
          ) : null}
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