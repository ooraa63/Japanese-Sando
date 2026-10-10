"use client";

import Image from "next/image";
import { Gift, Sparkles } from "lucide-react";
import type { Bundle } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { PriceTag } from "./PriceTag";

/**
 * Deretan kartu "Paket Hemat".
 *
 * Dipisah dari `MenuBrowser` supaya bisa dipakai di dua tempat:
 * beranda (di atas section "Populer", permintaan Steven 10-10-2026) dan
 * halaman menu. Bundle adalah item eksplisit yang penjual jual sendiri,
 * jadi tampilannya sama di mana pun — hanya posisinya yang beda.
 */
export function BundleShowcase({ bundles }: { bundles: Bundle[] }) {
  const { t } = useI18n();

  if (bundles.length === 0) return null;

  return (
    <section>
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-cocoa-500">
        <Gift className="size-4 text-berry-500" />
        {t.menu.bundlesTitle}
      </p>
      <ul className="density-bundle-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bundles.map((b) => (
          <BundleCard key={b.id} bundle={b} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Kartu bundle untuk beranda & modal. Bundle adalah item eksplisit
 * yang penjual jual (mis. "Bundle 2 Sando Sandwich = 35k"). Saat ini
 * hanya dilihat-saja — pembelian bundle menyusul di iterasi berikut.
 */
function BundleCard({ bundle }: { bundle: Bundle }) {
  const { t, lang } = useI18n();
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
          {bundle.compare_price != null &&
          bundle.compare_price > bundle.price ? (
            <span className="absolute right-3 top-3 chip bg-berry-500 text-white shadow tabular">
              −
              {Math.round(
                ((bundle.compare_price - bundle.price) / bundle.compare_price) * 100
              )}
              %
            </span>
          ) : null}
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
          <div className="mt-2">
            <PriceTag
              price={bundle.price}
              comparePrice={bundle.compare_price}
              lang={lang}
              size="lg"
            />
          </div>
          <p className="mt-2 text-[12px] font-bold text-matcha-700">
            {t.menu.bundleIncludes.replace("{n}", String(bundle.required_qty))}
          </p>
        </div>
      </article>
    </li>
  );
}