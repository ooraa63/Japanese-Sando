"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight, Gift, LayoutGrid, Plus, Sparkles, UtensilsCrossed } from "lucide-react";
import type { Bundle, Category } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { FlavorCard } from "./FlavorCard";
import { cheapestBundle, formatIDR } from "@/lib/utils";
import { OrderCategoryModal } from "./OrderCategoryModal";
import { useCart } from "./CartProvider";

/**
 * Penjelahar menu di beranda (mode lihat-saja):
 * klik kategori dulu, lalu lihat rasanya.
 */
export function MenuBrowser({
  categories,
  bundles = [],
  remainingStock = null,
  emptyLabel,
}: {
  categories: Category[];
  /** Bundle berdiri sendiri (category_id=NULL). */
  bundles?: Bundle[];
  remainingStock?: number | null;
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

  // Bundle termurah, untuk teaser di beranda
  const best = useMemo(() => cheapestBundle(bundles), [bundles]);
  const bestOffer = best
    ? t.order.review.bundleOffer
        .replace("{n}", String(best.qty))
        .replace("{price}", formatIDR(best.price, lang))
    : "";

  if (withFlavors.length === 0 && bundles.length === 0) {
    return (
      <p className="card p-10 text-center text-cocoa-400">{emptyLabel ?? t.menu.empty}</p>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------- Bundle berdiri sendiri ---------- */}
      {bundles.length > 0 ? (
        <div>
          <p className="mb-3 flex items-center gap-2 text-sm font-bold text-cocoa-500">
            <Gift className="size-4 text-berry-500" />
            {t.menu.bundlesTitle}
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => (
              <BundleCard key={b.id} bundle={b} lang={lang} t={t} />
            ))}
          </ul>
        </div>
      ) : null}

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
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {(shown.flavors ?? []).map((f) => (
              <FlavorCard
                key={f.id}
                flavor={f}
                remainingStock={remainingStock}
                categoryName={onlyOne ? undefined : lang === "en" ? shown.name_en : shown.name_id}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Daftar menu untuk halaman pre-order:
 * Tampilkan kategori sebagai kartu; klik kategori -> buka modal dengan
 * grid rasa + stepper +/- di dalamnya. Lebih cepat di HP (tidak harus
 * scroll semua rasa) dan siap untuk menu lain di masa depan (setiap
 * kategori punya modal-nya sendiri).
 */
export function OrderMenuBrowser({
  categories,
  remainingStock,
  soldCounts,
}: {
  categories: Category[];
  remainingStock: number | null;
  /** Map flavorId -> jumlah pcs terjual (accepted/ready/delivered). */
  soldCounts?: Record<number, number>;
}) {
  const { t, lang } = useI18n();
  const { quantities } = useCart();
  const withFlavors = useMemo(
    () => categories.filter((c) => (c.flavors?.length ?? 0) > 0),
    [categories]
  );
  const [openId, setOpenId] = useState<number | null>(null);

  const active = withFlavors.find((c) => c.id === openId) ?? null;

  if (withFlavors.length === 0) {
    return <p className="card p-10 text-center text-cocoa-400">{t.menu.empty}</p>;
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {withFlavors.map((c) => {
          const name = lang === "en" ? c.name_en : c.name_id;
          const desc = lang === "en" ? c.desc_en : c.desc_id;
          // Total pcs kategori ini yang sudah masuk keranjang.
          const inCart = (c.flavors ?? []).reduce(
            (s, f) => s + (quantities[String(f.id)] ?? 0),
            0
          );

          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setOpenId(c.id)}
                className="group flex w-full items-center gap-3.5 rounded-2xl border-2 border-cocoa-200 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-matcha-400 hover:shadow-lg hover:shadow-cocoa-900/10 active:scale-[0.99] sm:p-3.5"
              >
                <span
                  className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl sm:size-16 ${
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
                      sizes="64px"
                      className="object-cover"
                    />
                  ) : (
                    <LayoutGrid className="size-7 text-white/70" />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-display text-base font-bold text-cocoa-900 sm:text-lg">
                      {name}
                    </span>
                    {inCart > 0 ? (
                      <span className="chip shrink-0 bg-matcha-500 text-white">
                        {inCart}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-cocoa-400">
                    {c.flavors?.length} {t.menu.flavors}
                  </span>
                  {desc ? (
                    <span className="mt-0.5 line-clamp-1 block text-[12px] text-cocoa-500">
                      {desc}
                    </span>
                  ) : null}
                </span>

                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-matcha-50 text-matcha-600 transition group-hover:bg-matcha-500 group-hover:text-white sm:size-11">
                  <Plus className="size-4 sm:size-5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <OrderCategoryModal
        category={active}
        open={active !== null}
        onClose={() => setOpenId(null)}
        remainingStock={remainingStock}
        soldCounts={soldCounts}
      />
    </>
  );
}

/**
 * Kartu bundle untuk beranda & modal. Bundle adalah item eksplisit
 * yang penjual jual (mis. "Bundle 2 Sando Sandwich = 35k"). Saat ini
 * hanya dilihat-saja — pembelian bundle menyusul di iterasi berikut.
 */
function BundleCard({
  bundle,
  lang,
  t,
}: {
  bundle: Bundle;
  lang: ReturnType<typeof useI18n>["lang"];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const name = lang === "en" ? bundle.name_en : bundle.name_id;
  const desc = lang === "en" ? bundle.desc_en : bundle.desc_id;
  return (
    <li>
      <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-cocoa-200/70 bg-white transition hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10">
        <div className="relative aspect-[5/3] overflow-hidden bg-gradient-to-br from-honey-300 to-berry-500 sm:aspect-[4/3]">
          {bundle.image_url ? (
            <Image
              src={bundle.image_url}
              alt={name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-grain">
              <Gift className="size-12 text-white/50" />
            </div>
          )}
          <span className="absolute left-3 top-3 chip bg-honey-400/95 text-cocoa-900 shadow">
            <Sparkles className="size-3 fill-current" />
            {t.menu.bundleLabel}
          </span>
          <span className="absolute right-3 top-3 chip bg-white/95 text-cocoa-800 shadow tabular">
            {formatIDR(bundle.price, lang)}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-display text-lg leading-tight font-bold text-cocoa-900">
            {name}
          </h3>
          {desc ? (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-cocoa-500">
              {desc}
            </p>
          ) : null}
          <p className="mt-3 text-[12px] font-bold text-matcha-700">
            {t.menu.bundleIncludes
              .replace("{n}", String(bundle.required_qty))}
          </p>
        </div>
      </article>
    </li>
  );
}