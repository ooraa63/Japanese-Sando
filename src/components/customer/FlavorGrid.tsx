"use client";

import type { Flavor } from "@/lib/types";
import { FlavorCard } from "./FlavorCard";

/**
 * Grid menu di beranda. HANYA untuk melihat — keranjang hanya bisa
 * ditambah dari halaman /order supaya alur pre-order tetap satu arah.
 */
export function FlavorGrid({
  flavors,
  remainingStock = null,
}: {
  flavors: Flavor[];
  remainingStock?: number | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
      {flavors.map((f) => (
        <FlavorCard key={f.id} flavor={f} remainingStock={remainingStock} />
      ))}
    </div>
  );
}
