"use client";

import type { Flavor } from "@/lib/types";
import { FlavorCard } from "./FlavorCard";

/**
 * Grid menu di beranda. HANYA untuk melihat — keranjang hanya bisa
 * ditambah dari halaman /order supaya alur pre-order tetap satu arah.
 */
export function FlavorGrid({ flavors }: { flavors: Flavor[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {flavors.map((f) => (
        <FlavorCard key={f.id} flavor={f} />
      ))}
    </div>
  );
}
