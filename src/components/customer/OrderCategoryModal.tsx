"use client";

import { useMemo } from "react";
import { UtensilsCrossed } from "lucide-react";
import type { Category } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { Modal } from "@/components/ui/Modal";
import { FlavorCard } from "@/components/customer/FlavorCard";

/**
 * Modal pilih rasa untuk satu kategori. Dipakai di halaman /order — klik
 * kartu kategori di halaman utama, modal ini muncul dengan daftar rasa di
 * dalamnya (mode pilih +/-, sama seperti di halaman penuh).
 *
 * Layout responsive:
 *   - Mobile  : slide up dari bawah (dari Modal), grid 1 kolom supaya kartu
 *               tidak kepalan.
 *   - Desktop: centered dialog.
 */
export function OrderCategoryModal({
  category,
  open,
  onClose,
  remainingStock,
  soldCounts = {},
}: {
  category: Category | null;
  open: boolean;
  onClose: () => void;
  remainingStock: number | null;
  /** Map flavorId -> jumlah terjual. */
  soldCounts?: Record<number, number>;
}) {
  const { t, lang } = useI18n();
  const { quantities } = useCart();

  const flavors = useMemo(
    () => (category ? category.flavors ?? [] : []),
    [category]
  );

  // Total pcs kategori ini di keranjang — ditampilkan sebagai badge di
  // judul modal agar pembeli tahu sudah pilih berapa.
  const totalInCart = useMemo(() => {
    if (!category) return 0;
    let total = 0;
    for (const f of flavors) {
      total += quantities[String(f.id)] ?? 0;
    }
    return total;
  }, [category, flavors, quantities]);

  if (!category) return null;

  const name = lang === "en" ? category.name_en : category.name_id;
  const desc = lang === "en" ? category.desc_en : category.desc_id;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-cocoa-700">
            <UtensilsCrossed className="size-4 text-matcha-600" />
            <span className="tabular">
              {totalInCart} {t.common.qty.toLowerCase()}
            </span>
          </div>
          <button type="button" onClick={onClose} className="btn-matcha">
            {t.common.confirm}
          </button>
        </div>
      }
    >
      {desc ? (
        <p className="mb-4 text-[13px] leading-relaxed text-cocoa-500">
          {desc}
        </p>
      ) : null}

      {flavors.length === 0 ? (
        <p className="rounded-2xl bg-cocoa-50 p-8 text-center text-sm text-cocoa-500">
          {t.menu.empty}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {flavors.map((f) => (
            <FlavorCard
              key={f.id}
              flavor={f}
              remainingStock={remainingStock}
              selectable
              showSocial
              soldCount={soldCounts[f.id] ?? 0}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}