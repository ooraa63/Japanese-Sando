"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight, LayoutGrid, Sparkles, UtensilsCrossed } from "lucide-react";
import type { Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { FlavorCard } from "./FlavorCard";
import { useCart } from "./CartProvider";
import { useToast } from "@/components/ui/Toast";
import { cheapestBundle, formatIDR } from "@/lib/utils";

/**
 * Penjelahar menu dua tingkat: pilih jenis makanan dulu, baru lihat rasanya.
 * Dipakai di beranda (mode lihat) dan di halaman pre-order (mode pilih).
 */
export function MenuBrowser({
  categories,
  remainingStock = null,
  onAdd,
  emptyLabel,
}: {
  categories: Category[];
  remainingStock?: number | null;
  onAdd?: (flavor: Flavor) => void;
  emptyLabel?: string;
}) {
  const { t, lang } = useI18n();
  const withFlavors = useMemo(
    () => categories.filter((c) => (c.flavors?.length ?? 0) > 0),
    [categories]
  );
  const [activeId, setActiveId] = useState<number | null>(null);

  const active = withFlavors.find((c) => c.id === activeId) ?? null;

  // Kalau hanya satu jenis, langsung tampilkan rasa-rasanya (tanpa perlu klik).
  const onlyOne = withFlavors.length === 1;
  const shown = onlyOne ? withFlavors[0] : active;

  // Paket termurah di toko, untuk memberi gambaran ke pembeli
  const best = useMemo(() => cheapestBundle(withFlavors), [withFlavors]);
  const bestOffer = best
    ? t.order.review.bundleOffer
        .replace("{n}", String(best.qty))
        .replace("{price}", formatIDR(best.price, lang))
    : "";

  if (withFlavors.length === 0) {
    return (
      <p className="card p-10 text-center text-cocoa-400">{emptyLabel ?? t.menu.empty}</p>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------- Tingkat 1: jenis makanan ---------- */}
      <div>
        {onlyOne ? (
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-cocoa-500">
            <UtensilsCrossed className="size-4" />
            {lang === "en" ? withFlavors[0].name_en : withFlavors[0].name_id}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm font-bold text-cocoa-500">{t.menu.pickCategory}</p>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {withFlavors.map((c) => {
                const name = lang === "en" ? c.name_en : c.name_id;
                const desc = lang === "en" ? c.desc_en : c.desc_id;
                const selected = c.id === activeId;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={`group flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${
                        selected
                          ? "border-matcha-500 bg-matcha-50"
                          : "border-cocoa-200 bg-white hover:border-cocoa-300 hover:bg-cocoa-50/60"
                      }`}
                    >
                      <span
                        className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl ${
                          c.image_url
                            ? "bg-cocoa-100"
                            : "bg-gradient-to-br from-cocoa-300 to-cocoa-500"
                        }`}
                      >
                        {c.image_url ? (
                          <Image
                            src={c.image_url}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <LayoutGrid className="size-6 text-white/70" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-bold text-cocoa-900">
                          {name}
                        </span>
                        <span className="mt-0.5 block text-xs text-cocoa-400">
                          {c.flavors?.length} {t.menu.flavors}
                        </span>
                        {desc ? (
                          <span className="mt-0.5 line-clamp-1 block text-[11px] text-cocoa-400">
                            {desc}
                          </span>
                        ) : null}
                      </span>

                      <ChevronRight
                        className={`size-4 shrink-0 transition ${
                          selected ? "text-matcha-600" : "text-cocoa-300"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ---------- Tingkat 2: rasa ---------- */}
      {shown ? (
        <div className="border-t border-cocoa-200 pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-cocoa-500">
              <UtensilsCrossed className="size-4" />
              {lang === "en" ? shown.name_en : shown.name_id}
            </p>

            <div className="flex items-center gap-3">
              {/* Paket termurah di toko, untuk memberi gambaran ke pembeli */}
              {bestOffer ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-berry-500/10 px-3 py-1 text-[11px] font-bold text-berry-600">
                  <Sparkles className="size-3.5" />
                  {bestOffer}
                </span>
              ) : null}

              {!onlyOne ? (
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="text-xs font-bold text-cocoa-400 transition hover:text-cocoa-700"
                >
                  ← {t.menu.changeCategory}
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(shown.flavors ?? []).map((f) => (
              <FlavorCard
                key={f.id}
                flavor={f}
                remainingStock={remainingStock}
                onAdd={onAdd}
                categoryName={onlyOne ? undefined : lang === "en" ? shown.name_en : shown.name_id}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Pembungkus yang juga toasted saat tambah ke keranjang. */
export function OrderMenuBrowser({
  categories,
  remainingStock,
}: {
  categories: Category[];
  remainingStock: number | null;
}) {
  const { add } = useCart();
  const toast = useToast();
  const { t, lang } = useI18n();

  function handleAdd(flavor: Flavor) {
    add(flavor);
    toast.success(lang === "en" ? flavor.name_en : flavor.name_id, t.menu.addToCart);
  }

  return (
    <MenuBrowser
      categories={categories}
      remainingStock={remainingStock}
      onAdd={handleAdd}
    />
  );
}
