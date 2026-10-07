"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronRight, Gift, LayoutGrid, Sparkles, UtensilsCrossed } from "lucide-react";
import type { Bundle, Category } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { FlavorCard } from "./FlavorCard";
import { cheapestBundle, formatIDR } from "@/lib/utils";
import { OrderBundleModal } from "./OrderBundleModal";
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
  soldCounts = {},
}: {
  categories: Category[];
  /** Bundle berdiri sendiri (category_id=NULL). */
  bundles?: Bundle[];
  remainingStock?: number | null;
  emptyLabel?: string;
  /** Map flavorId -> jumlah terjual (untuk like/sold di beranda). */
  soldCounts?: Record<number, number>;
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
          <ul className="density-bundle-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

          <div className="density-flavor-grid grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {(shown.flavors ?? []).map((f) => (
              <FlavorCard
                key={f.id}
                flavor={f}
                remainingStock={remainingStock}
                categoryName={onlyOne ? undefined : lang === "en" ? shown.name_en : shown.name_id}
                showSocial
                soldCount={soldCounts[f.id] ?? 0}
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
 *
 * Bundle berdiri sendiri (atau yang terkait kategori) ditampilkan di
 * section terpisah di atas, supaya pembeli tahu ada pilihan paket hemat.
 * Bundle: klik -> modal pilih {required_qty} slot rasa -> masuk keranjang.
 */
export function OrderMenuBrowser({
  categories,
  bundles = [],
  remainingStock,
  soldCounts,
}: {
  categories: Category[];
  /** Bundle berdiri sendiri (category_id=NULL) atau per-kategori. */
  bundles?: Bundle[];
  remainingStock: number | null;
  /** Map flavorId -> jumlah pcs terjual (accepted/ready/delivered). */
  soldCounts?: Record<number, number>;
}) {
  const { t, lang } = useI18n();
  const { quantities, bundles: cartBundles } = useCart();
  const withFlavors = useMemo(
    () => categories.filter((c) => (c.flavors?.length ?? 0) > 0),
    [categories]
  );
  const [openCategoryId, setOpenCategoryId] = useState<number | null>(null);
  const [openBundleId, setOpenBundleId] = useState<number | null>(null);

  const activeCategory = withFlavors.find((c) => c.id === openCategoryId) ?? null;
  const activeBundle = bundles.find((b) => b.id === openBundleId) ?? null;

  const empty = withFlavors.length === 0 && bundles.length === 0;
  if (empty) {
    return <p className="card p-10 text-center text-cocoa-400">{t.menu.empty}</p>;
  }

  return (
    <>
      {/* ---------- Section bundle (paket hemat) ---------- */}
      {bundles.length > 0 ? (
        <div id="bundle-section" className="mb-8 scroll-mt-20">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-berry-500/10 text-berry-600">
              <Gift className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold text-cocoa-900">
                {t.menu.bundleSection}
              </p>
              <p className="text-xs text-cocoa-500">
                {lang === "en"
                  ? "Mix and match flavors in one bundle"
                  : "Pilih beberapa rasa dalam satu paket"}
              </p>
            </div>
          </div>
          <ul className="density-bundle-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => {
              const inCart = cartBundles.filter((cb) => cb.bundle.id === b.id).length;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setOpenBundleId(b.id)}
                    className="group block h-full w-full overflow-hidden rounded-2xl border-2 border-cocoa-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-matcha-400 hover:shadow-lg hover:shadow-cocoa-900/10 active:scale-[0.99]"
                  >
                    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-transparent bg-white">
                      <div className="relative aspect-[5/3] overflow-hidden bg-gradient-to-br from-honey-300 to-berry-500 sm:aspect-[4/3]">
                        {b.image_url ? (
                          <Image
                            src={b.image_url}
                            alt={lang === "en" ? b.name_en : b.name_id}
                            fill
                            sizes="(max-width: 640px) 50vw, 33vw"
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
                          {formatIDR(b.price, lang)}
                        </span>
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-lg leading-tight font-bold text-cocoa-900">
                            {lang === "en" ? b.name_en : b.name_id}
                          </h3>
                          {inCart > 0 ? (
                            <span className="chip shrink-0 bg-matcha-500 text-white">
                              {inCart}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-[12px] font-bold text-matcha-700">
                          {t.menu.bundleIncludes.replace("{n}", String(b.required_qty))}
                        </p>
                      </div>
                    </article>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ---------- Section kategori (item satuan) — rasa inline, gak perlu klik kategori dulu ---------- */}
      {withFlavors.length > 0 ? (
        <div className="space-y-8">
          {withFlavors.map((c) => {
            const name = lang === "en" ? c.name_en : c.name_id;
            const desc = lang === "en" ? c.desc_en : c.desc_id;
            const inCart = (c.flavors ?? []).reduce(
              (s, f) => s + (quantities[String(f.id)] ?? 0),
              0
            );
            return (
              <div key={c.id} id={`category-${c.id}`} className="scroll-mt-24">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-cocoa-100">
                    {c.image_url ? (
                      <Image
                        src={c.image_url}
                        alt=""
                        width={36}
                        height={36}
                        className="size-9 object-cover"
                      />
                    ) : (
                      <LayoutGrid className="size-5 text-cocoa-500" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-extrabold text-cocoa-900 sm:text-lg">
                        {name}
                      </h3>
                      {inCart > 0 ? (
                        <span className="chip shrink-0 bg-matcha-500 text-white">
                          {inCart}
                        </span>
                      ) : null}
                    </div>
                    {desc ? (
                      <p className="line-clamp-1 text-xs text-cocoa-500">{desc}</p>
                    ) : null}
                  </div>
                </div>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {(c.flavors ?? []).map((f) => {
                    const fid = String(f.id);
                    const q = quantities[fid] ?? 0;
                    return (
                      <li key={f.id} className="flex">
                        <FlavorCard
                          flavor={f}
                          inCart={q}
                          remainingStock={remainingStock}
                          selectable
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {activeBundle ? (
        <OrderBundleModal
          // Pakai `key` agar state `slots` di dalam modal otomatis reset
          // ketika bundle yang dibuka berbeda (id / required_qty berubah).
          key={activeBundle.id}
          bundle={activeBundle}
          categories={withFlavors}
          open={activeBundle !== null}
          onClose={() => setOpenBundleId(null)}
          soldCounts={soldCounts}
        />
      ) : null}
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
            <p className="bundle-desc mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-cocoa-500">
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