"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Gift,
  Sparkles,
  Check,
  AlertTriangle,
  Plus,
  X,
  Heart,
} from "lucide-react";
import type { Bundle, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatIDR } from "@/lib/utils";

/** Gradient fallback per flavor (sama dengan FlavorCard). */
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

/**
 * Modal untuk memilih isi bundle. Layout: kartu sandwich-style
 * (gambar + nama + harga + tombol "Pilih") seperti OrderCategoryModal
 * (Sando Sandwich picker). Klik kartu untuk toggle pilih/hapus dari
 * bundle. Maks = bundle.required_qty — duplikat diperbolehkan.
 *
 * Backend `create_order` menerima array `{bundle_id, slots: [{flavor_id} * N]}`
 * dengan N = bundle.required_qty. Tiap slot diisi dengan flavor aktif dan
 * (kalau bundle terkait kategori) dari kategori yang sama. Backend yang
 * cek stok; validasi klien hanya sebatas pilih flavor yang allowed.
 */
export function OrderBundleModal({
  bundle,
  categories,
  open,
  onClose,
  soldCounts: soldCountsProp = {},
}: {
  bundle: Bundle | null;
  categories: Category[];
  open: boolean;
  onClose: () => void;
  soldCounts?: Record<number, number>;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const toast = useToast();

  // Daftar slot rasa (Array<flavorId>). Boleh ada flavor yang sama
  // muncul beberapa kali — yaitu cara user pesan bundle "2x Cookies".
  // State ini di-reset otomatis oleh React karena parent (MenuBrowser)
  // memberikan `key={activeBundle.id}` ke modal ini, sehingga mount/unmount
  // terjadi setiap bundle yang dibuka berbeda.
  const [slots, setSlots] = useState<Array<number>>([]);

  // Rasa yang boleh dipilih.
  const allowedFlavors: Array<Flavor & { categoryName: string }> = useMemo(() => {
    if (!bundle) return [];
    const list: Array<Flavor & { categoryName: string }> = [];
    for (const c of categories) {
      if (bundle.category_id !== null && c.id !== bundle.category_id) continue;
      for (const f of c.flavors ?? []) {
        list.push({ ...f, categoryName: lang === "en" ? c.name_en : c.name_id });
      }
    }
    return list;
  }, [bundle, categories, lang]);

  if (!bundle) return null;

  const name = lang === "en" ? bundle.name_en : bundle.name_id;
  const desc = lang === "en" ? bundle.desc_en : bundle.desc_id;
  const requiredQty = bundle.required_qty;
  const filledCount = slots.length;
  const allFilled = filledCount === requiredQty;
  const isCategoryScoped = bundle.category_id !== null;
  const scopeCategory = isCategoryScoped
    ? categories.find((c) => c.id === bundle.category_id) ?? null
    : null;
  const scopeName = scopeCategory
    ? lang === "en"
      ? scopeCategory.name_en
      : scopeCategory.name_id
    : "";

  function pickFlavor(flavorId: number) {
    setSlots((prev) => {
      if (prev.length >= requiredQty) return prev;
      return [...prev, flavorId];
    });
  }

  function removePicked(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  function addBundle() {
    if (!bundle) return;
    if (!allFilled) {
      toast.warning(name, t.menu.bundleEmpty.replace("{n}", String(requiredQty)));
      return;
    }
    cart.addBundle(bundle, slots);
    toast.success(name, t.menu.addToCart);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-cocoa-700">
            <Gift className="size-4 text-matcha-600" />
            <span className="tabular">
              {filledCount}/{requiredQty} {t.common.qty.toLowerCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={addBundle}
            disabled={!allFilled}
            className="btn-matcha disabled:opacity-50"
          >
            <Check className="size-4" />
            {t.common.confirm}
          </button>
        </div>
      }
    >
      {/* Hero */}
      <div className="-mt-2 mb-4 flex gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-honey-300 to-berry-500 sm:size-20">
          {bundle.image_url ? (
            <Image
              src={bundle.image_url}
              alt={name}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Gift className="size-7 text-white/70" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wide text-berry-600 uppercase">
            {t.menu.bundleLabel}
          </p>
          <p className="font-display text-base font-bold text-cocoa-900">{name}</p>
          {desc ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] text-cocoa-500">{desc}</p>
          ) : null}
          <p className="mt-1.5 text-[12px] font-bold text-matcha-700">
            <Sparkles className="mr-1 inline size-3" />
            {t.menu.bundlePickFlavors
              .replace("{n}", String(requiredQty))
              .replace("{name}", "")}
          </p>
          <p className="text-xs font-bold text-cocoa-800 tabular">
            {formatIDR(bundle.price, lang)}
          </p>
        </div>
      </div>

      {/* Catatan scope */}
      {isCategoryScoped ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-cocoa-50 px-3 py-2 text-[12px] text-cocoa-600">
          <AlertTriangle className="size-3.5 shrink-0 text-cocoa-400" />
          <span>{t.menu.bundlePickFromCategory.replace("{name}", scopeName)}</span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-matcha-50 px-3 py-2 text-[12px] text-matcha-700">
          <Sparkles className="size-3.5 shrink-0" />
          <span>{t.menu.bundleAnyCategory}</span>
        </div>
      )}

      {/* Slot yang sudah dipilih (chip kecil) */}
      {slots.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {slots.map((flavorId, idx) => {
            const f = allowedFlavors.find((x) => x.id === flavorId);
            if (!f) return null;
            return (
              <button
                type="button"
                key={`${idx}-${flavorId}`}
                onClick={() => removePicked(idx)}
                className="inline-flex items-center gap-1.5 rounded-full bg-matcha-500/15 px-2.5 py-1 text-[12px] font-bold text-matcha-700 transition hover:bg-berry-500/10 hover:text-berry-600"
                title={lang === "en" ? "Remove" : "Hapus"}
              >
                <span className="tabular">#{idx + 1}</span>
                <span className="max-w-[10rem] truncate">
                  {lang === "en" ? f.name_en : f.name_id}
                </span>
                <X className="size-3" />
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Grid flavor cards (gaya Sando Sandwich picker) */}
      {allowedFlavors.length === 0 ? (
        <p className="rounded-2xl bg-cocoa-50 p-8 text-center text-sm text-cocoa-500">
          {t.menu.empty}
        </p>
      ) : (
        <div className="density-flavor-grid grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {allowedFlavors.map((f) => {
            const picked = slots.filter((id) => id === f.id).length;
            const remaining = requiredQty - filledCount;
            const disabled = remaining <= 0;
            return (
              <article
                key={f.id}
                className={`relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition ${
                  picked > 0
                    ? "border-matcha-500 shadow-md"
                    : "border-cocoa-200 hover:border-cocoa-300"
                } ${disabled ? "opacity-60" : ""}`}
              >
                {picked > 0 ? (
                  <span
                    aria-hidden
                    className="absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-full bg-matcha-500 text-xs font-extrabold text-white shadow"
                  >
                    {picked}
                  </span>
                ) : null}
                <div
                  className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradientFor(f.slug)}`}
                >
                  {f.image_url ? (
                    <Image
                      src={f.image_url}
                      alt={lang === "en" ? f.name_en : f.name_id}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <span className="font-display text-3xl font-bold text-white/80">
                        {(lang === "en" ? f.name_en : f.name_id).charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <p className="truncate font-display text-base leading-tight font-bold text-cocoa-900">
                    {lang === "en" ? f.name_en : f.name_id}
                  </p>
                  {!isCategoryScoped ? (
                    <p className="mt-0.5 truncate text-[11px] text-cocoa-400">
                      {f.categoryName}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-cocoa-400 tabular">
                      {formatIDR(f.price, lang)}
                    </p>
                  )}
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-matcha-700">
                    <Sparkles className="size-3" />
                    {t.menu.unlimited}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-cocoa-500">
                    <span className="tabular">
                      <span className="font-bold text-cocoa-800">
                        {soldCountsProp[f.id] ?? 0}
                      </span>{" "}
                      {t.common.sold.toLowerCase()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3 text-rose-500" />
                      <span className="tabular">0</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => pickFlavor(f.id)}
                    disabled={disabled}
                    className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-bold transition ${
                      picked > 0
                        ? "bg-matcha-500 text-white hover:bg-matcha-600"
                        : "bg-cocoa-700 text-cream-50 hover:bg-cocoa-800"
                    } disabled:cursor-not-allowed disabled:bg-cocoa-300 disabled:text-cocoa-500`}
                  >
                    {picked > 0 ? (
                      <>
                        <Check className="size-4" />
                        {picked > 1
                          ? `${t.common.picked} ${picked}x`
                          : t.common.confirm}
                      </>
                    ) : (
                      <>
                        <Plus className="size-4" />
                        {t.common.pick}
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Modal>
  );
}