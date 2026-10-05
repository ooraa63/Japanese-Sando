"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Gift, Sparkles, Check, X, AlertTriangle } from "lucide-react";
import type { Bundle, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatIDR } from "@/lib/utils";

/**
 * Modal untuk memilih isi bundle (slot rasa). Backend `create_order`
 * menerima array `{bundle_id, slots: [{flavor_id} * N]}` dengan N =
 * `bundle.required_qty`. Tiap slot harus diisi dengan flavor yang aktif
 * dan (kalau bundle terkait kategori) dari kategori yang sama.
 *
 * Stok mengikuti flavor yang dipilih: backend akan menolak kalau total
 * pcs (item satuan + slot bundle) di sebuah kategori melebihi
 * `categories.stock`. Validasi di sisi klien hanya sebagai pengaman
 * awal; kalau backend menolak, kita tampilkan toast.
 *
 * `key` prop di parent (lihat MenuBrowser) menjamin `slots` reset
 * otomatis ketika bundle yang dibuka berbeda — tanpa butuh effect.
 */
export function OrderBundleModal({
  bundle,
  categories,
  open,
  onClose,
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

  // Tiap slot menyimpan flavorId (number) atau null kalau belum dipilih.
  // Diinisialisasi sekali saat modal mount (atau saat `key` prop di parent
  // berubah), dan akan di-reset oleh React ketika bundle berganti.
  const [slots, setSlots] = useState<Array<number | null>>(() =>
    bundle ? new Array<number | null>(bundle.required_qty).fill(null) : []
  );

  // Kumpulan rasa yang boleh dipilih. Kalau bundle terkait kategori,
  // hanya rasa dari kategori itu. Kalau berdiri sendiri, semua rasa.
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
  const filledCount = slots.filter((s) => s !== null).length;
  const allFilled = filledCount === bundle.required_qty;
  const isCategoryScoped = bundle.category_id !== null;
  const scopeCategory = isCategoryScoped
    ? categories.find((c) => c.id === bundle.category_id) ?? null
    : null;
  const scopeName = scopeCategory
    ? lang === "en"
      ? scopeCategory.name_en
      : scopeCategory.name_id
    : "";

  function pickForSlot(slotIdx: number, flavorId: number) {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = flavorId;
      return next;
    });
  }

  function clearSlot(slotIdx: number) {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });
  }

  function addBundle() {
    if (!bundle) return;
    if (!allFilled) {
      toast.warning(name, t.menu.bundleEmpty.replace("{n}", String(bundle.required_qty)));
      return;
    }
    cart.addBundle(bundle, slots.map((s) => s as number));
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
              {filledCount}/{bundle.required_qty}
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
      {/* Hero image + ringkasan */}
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
              .replace("{n}", String(bundle.required_qty))
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

      {/* Daftar slot */}
      <div className="space-y-3">
        {slots.map((slotValue, slotIdx) => {
          const slotLabel = t.menu.bundleSlotN.replace("{n}", String(slotIdx + 1));
          const pickedFlavor = slotValue
            ? allowedFlavors.find((f) => f.id === slotValue) ?? null
            : null;
          return (
            <div
              key={slotIdx}
              className="rounded-2xl border border-cocoa-200 bg-white p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
                  {slotLabel}
                </p>
                {pickedFlavor ? (
                  <button
                    type="button"
                    onClick={() => clearSlot(slotIdx)}
                    className="inline-flex items-center gap-1 rounded-full bg-cocoa-100 px-2 py-0.5 text-[11px] font-bold text-cocoa-600 transition hover:bg-cocoa-200"
                  >
                    <X className="size-3" />
                    {t.common.cancel}
                  </button>
                ) : null}
              </div>
              {pickedFlavor ? (
                <div className="flex items-center gap-2.5">
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-cocoa-100">
                    {pickedFlavor.image_url ? (
                      <Image
                        src={pickedFlavor.image_url}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center font-display text-sm font-bold text-cocoa-400">
                        {pickedFlavor.name_id.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-cocoa-900">
                      {lang === "en" ? pickedFlavor.name_en : pickedFlavor.name_id}
                    </p>
                    {!isCategoryScoped ? (
                      <p className="truncate text-[11px] text-cocoa-400">
                        {pickedFlavor.categoryName}
                      </p>
                    ) : (
                      <p className="text-[11px] text-cocoa-400 tabular">
                        {formatIDR(pickedFlavor.price, lang)}
                      </p>
                    )}
                  </div>
                  <Check className="size-4 shrink-0 text-matcha-600" />
                </div>
              ) : (
                <p className="text-sm text-cocoa-400">{t.menu.bundleSlotEmpty}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {allowedFlavors.map((f) => {
                  const selected = slotValue === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => pickForSlot(slotIdx, f.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-[12px] font-bold transition ${
                        selected
                          ? "border-matcha-500 bg-matcha-50 text-matcha-700"
                          : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-300"
                      }`}
                    >
                      <span
                        className={`inline-block size-2 rounded-full ${
                          selected ? "bg-matcha-500" : "bg-cocoa-300"
                        }`}
                      />
                      {lang === "en" ? f.name_en : f.name_id}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
