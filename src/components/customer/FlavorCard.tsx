"use client";

import Image from "next/image";
import { Flame, PackageX, ShoppingBag, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatIDR } from "@/lib/utils";
import type { Flavor } from "@/lib/types";

/** Warna fallback per rasa, dipakai kalau produk belum punya foto. */
const GRADIENTS = [
  "from-[#3a2415] to-[#6b4423]",
  "from-[#f6e3c0] to-[#c98a3f]",
  "from-[#5f7a3a] to-[#9cbf6a]",
  "from-[#8c5a2b] to-[#d9a15b]",
  "from-[#f7d7dc] to-[#e06b7f]",
];

function gradientFor(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function FlavorCard({
  flavor,
  onAdd,
  inCart = 0,
  compact = false,
  remainingStock = null,
}: {
  flavor: Flavor;
  onAdd?: (flavor: Flavor) => void;
  inCart?: number;
  compact?: boolean;
  /** Stok keseluruhan toko (bukan per rasa). null = tak terbatas. */
  remainingStock?: number | null;
}) {
  const { t, lang } = useI18n();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  const desc = lang === "en" ? flavor.desc_en : flavor.desc_id;
  const stockEnabled = remainingStock !== null;
  const left = remainingStock ?? 0;
  const soldOut = !flavor.is_active || (stockEnabled && left <= 0);
  const low = stockEnabled && left > 0 && left <= 5;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition ${
        soldOut
          ? "border-cocoa-100 opacity-70"
          : "border-cocoa-200/70 hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10"
      }`}
    >
      {/* Foto / placeholder */}
      <div
        className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradientFor(flavor.slug)}`}
      >
        {flavor.image_url ? (
          <Image
            src={flavor.image_url}
            alt={name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-grain">
            <span className="font-display text-6xl font-bold text-white/25 select-none">
              {name.charAt(0)}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {flavor.is_featured && !soldOut ? (
            <span className="chip bg-honey-400/95 text-cocoa-900 shadow">
              <Star className="size-3 fill-current" />
              {t.menu.featured}
            </span>
          ) : (
            <span />
          )}
          <span className="chip bg-white/95 text-cocoa-800 shadow tabular">
            {formatIDR(flavor.price, lang)}
          </span>
        </div>

        {soldOut ? (
          <div className="absolute inset-0 grid place-items-center bg-cocoa-950/65">
            <span className="chip bg-white text-cocoa-800 shadow-lg">
              <PackageX className="size-3.5" />
              {t.menu.soldOut}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg leading-tight font-bold text-cocoa-900">
            {name}
          </h3>
          {inCart > 0 ? (
            <span className="chip shrink-0 bg-matcha-100 text-matcha-700">
              <ShoppingBag className="size-3" />
              {inCart}
            </span>
          ) : null}
        </div>

        {!compact && desc ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-cocoa-500">
            {desc}
          </p>
        ) : null}

        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold">
          {soldOut ? (
            <span className="text-berry-500">
              <PackageX className="mr-1 inline size-3" />
              {t.menu.soldOut}
            </span>
          ) : stockEnabled ? (
            <span className={low ? "text-honey-500" : "text-matcha-600"}>
              <Flame className="mr-1 inline size-3" />
              {low
                ? t.menu.lowStock.replace("{n}", String(left))
                : t.menu.inStock.replace("{n}", String(left))}
            </span>
          ) : (
            <span className="text-matcha-600">
              <Flame className="mr-1 inline size-3" />
              {t.menu.unlimited}
            </span>
          )}
        </div>

        {/* Tombol hanya di halaman /order (bukan di beranda). */}
        {onAdd ? (
          <button
            type="button"
            onClick={() => onAdd(flavor)}
            disabled={soldOut}
            className={`mt-4 w-full text-sm ${
              soldOut
                ? "btn border border-cocoa-200 bg-cocoa-50 text-cocoa-400"
                : "btn-primary"
            }`}
          >
            {soldOut ? t.menu.unavailable : `+ ${t.menu.addToCart}`}
          </button>
        ) : null}
      </div>
    </article>
  );
}
