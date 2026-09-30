"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { ShoppingBag } from "lucide-react";
import type { Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "./CartProvider";
import { FlavorCard } from "./FlavorCard";
import { useToast } from "@/components/ui/Toast";

/** Grid menu yang bisa langsung ditambahkan ke keranjang. */
export function FlavorGrid({ flavors }: { flavors: Flavor[] }) {
  const { add, quantities } = useCart();
  const toast = useToast();
  const { t, lang } = useI18n();

  const handleAdd = (flavor: Flavor) => {
    add(flavor);
    toast.success(lang === "en" ? flavor.name_en : flavor.name_id, t.menu.addToCart);
  };

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {flavors.map((f) => (
          <FlavorCard key={f.id} flavor={f} onAdd={handleAdd} inCart={quantities[f.id] ?? 0} />
        ))}
      </div>
      <FloatingCartBar />
    </>
  );
}

/** Bilah melayang yang muncul begitu ada isi keranjang. */
function FloatingCartBar() {
  const { totalItems, quantities } = useCart();
  const router = useRouter();
  const { t } = useI18n();

  // `false` di server & render hidrasi pertama, `true` setelahnya —
  // tanpa useEffect, jadi tidak ada cascading render.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted || totalItems === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-4">
      <div className="mx-auto flex max-w-lg animate-[fade-up_0.3s_ease-out] items-center justify-between gap-4 rounded-2xl bg-cocoa-900/95 px-5 py-3.5 text-cream-50 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-matcha-500 text-sm font-bold tabular">
            {totalItems}
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold">{t.order.menu.cartTitle}</p>
            <p className="text-[11px] text-cream-200/60">
              {Object.keys(quantities).length} {t.hero.stats.flavors}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => router.push("/order?step=menu")}
          className="btn !bg-cream-50 !px-4 !py-2.5 !text-[13px] !text-cocoa-900 hover:!bg-cream-100"
        >
          <ShoppingBag className="size-4" />
          {t.order.review.editItems}
        </button>
      </div>
    </div>
  );
}
