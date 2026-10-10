"use client";

import { formatIDR } from "@/lib/utils";
import type { Language } from "@/lib/types";

/**
 * Harga jual + harga asal dicoret (opsional).
 *
 * Kalau `comparePrice` diisi DAN lebih besar dari `price`, tampilkan:
 *   [badge diskon]  Rp 35.000   Rp 50.000 (coret)
 *
 * Ini yang dipakai di kartu bundle supaya pembeli langsung lihat hematannya,
 * bukan cuma angka akhir yangstance "murah atau mahal".
 */
export function PriceTag({
  price,
  comparePrice = null,
  lang,
  size = "md",
  align = "left",
}: {
  price: number;
  /** Harga sebelum diskon. Null / <= price = tidak ada harga coret. */
  comparePrice?: number | null;
  lang: Language;
  size?: "sm" | "md" | "lg" | "xl";
  align?: "left" | "center" | "right";
}) {
  const hasDiscount =
    comparePrice != null && Number.isFinite(comparePrice) && comparePrice > price;
  const offPercent = hasDiscount
    ? Math.round(((comparePrice - price) / comparePrice) * 100)
    : 0;

  const priceSize =
    size === "xl"
      ? "text-3xl"
      : size === "lg"
        ? "text-2xl"
        : size === "sm"
          ? "text-sm"
          : "text-base";
  const compareSize =
    size === "xl"
      ? "text-base"
      : size === "lg"
        ? "text-sm"
        : size === "sm"
          ? "text-[11px]"
          : "text-xs";

  const justify =
    align === "center"
      ? "justify-center"
      : align === "right"
        ? "justify-end"
        : "justify-start";

  if (!hasDiscount) {
    return (
      <span
        className={`inline-flex items-baseline font-extrabold text-cocoa-900 tabular ${priceSize} ${justify}`}
      >
        {formatIDR(price, lang)}
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${justify}`}>
      <span className="inline-flex shrink-0 items-center rounded-md bg-berry-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white tabular">
        −{offPercent}%
      </span>
      <span
        className={`font-extrabold text-berry-600 tabular ${compareSize} line-through decoration-berry-400 decoration-2`}
      >
        {formatIDR(comparePrice, lang)}
      </span>
      <span className={`font-extrabold text-cocoa-900 tabular ${priceSize}`}>
        {formatIDR(price, lang)}
      </span>
    </span>
  );
}