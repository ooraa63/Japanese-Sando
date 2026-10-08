"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Gift,
  Sparkles,
  Check,
  AlertTriangle,
  Plus,
  Minus,
  Heart,
  MessageSquare,
  PackageX,
} from "lucide-react";
import type { Bundle, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatIDR } from "@/lib/utils";
import { PriceTag } from "./PriceTag";

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
 * (gambar + nama + harga + +/- stepper) seperti OrderCategoryModal +
 * FlavorCard. Klik + untuk menambah slot, - untuk mengurangi. Catatan
 * bundle di bawah (1 note per bundle, berlaku untuk semua slot).
 *
 * Backend create_order menerima array `{bundle_id, slots: [{flavor_id} * N],
 * note}` dengan N = bundle.required_qty. Backend cek stok; validasi klien
 * hanya untuk memilih flavor yang allowed.
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
  // Reset otomatis oleh React karena parent (MenuBrowser) memberikan
  // `key={activeBundle.id}` ke modal ini.
  const [slots, setSlots] = useState<Array<number>>([]);
  const [note, setNote] = useState<string>("");

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

  /**
   * Sisa stok per kategori, sudah dikurangi isian keranjang.
   *
   * Stok itu PER KATEGORI (lihat `create_order` yang mengurangi
   * `categories.stock` satu pcs per slot bundle). Jadi kalau user sudah
   * tambah 1 Cookies biasa DAN punya 1 slot bundle Cookies, dua-duanya
   * memotong stok kategori yang sama. Perhitungan di sini harus mencerminkan
   * itu juga, supaya angka "Tersedia N" di modal sama dengan sisa sebenarnya
   * saat checkout.
   */
  const remainingByCategory = useMemo(() => {
    const used = new Map<number, number>();
    const bump = (catId: number | null | undefined, n: number) => {
      if (catId == null) return;
      used.set(catId, (used.get(catId) ?? 0) + n);
    };

    // Item biasa yang sudah ada di keranjang.
    for (const [flavorIdStr, qty] of Object.entries(cart.quantities)) {
      const f = categories
        .flatMap((c) => c.flavors ?? [])
        .find((x) => String(x.id) === flavorIdStr);
      bump(f?.category_id, qty);
    }

    // Slot bundle: tiap slot = 1 pcs dari kategori rasa yang dipilih.
    // `slots` bisa berisi null kalau entry belum lengkap terisi — lewati.
    for (const entry of cart.bundles ?? []) {
      for (const flavorId of entry.slots ?? []) {
        if (flavorId == null) continue;
        const f = categories
          .flatMap((c) => c.flavors ?? [])
          .find((x) => x.id === flavorId);
        bump(f?.category_id, 1);
      }
    }

    const out = new Map<number, number | null>();
    for (const c of categories) {
      out.set(
        c.id,
        c.stock_enabled
          ? Math.max(0, (c.stock ?? 0) - (used.get(c.id) ?? 0))
          : null
      );
    }
    return out;
  }, [categories, cart.quantities, cart.bundles]);

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

  function addOne(flavorId: number) {
    const catId = allowedFlavors.find((f) => f.id === flavorId)?.category_id;
    const left =
      catId != null ? (remainingByCategory.get(catId) ?? null) : null;
    // Hormati sisa stok kategori: jangan sampai slot baru membuat total
    // melebihi yang tersedia (backend tetap memvalidasi, tapi lebih baik
    // dicegah di sini supaya langkah tambah di UI).
    if (left !== null) {
      const alreadyPicked = countOf(flavorId);
      if (alreadyPicked >= left) {
        const flavor = allowedFlavors.find((f) => f.id === flavorId);
    toast.warning(
      flavor ? (lang === "en" ? flavor.name_en : flavor.name_id) : "",
      t.order.menu.maxReached.replace("{n}", String(left))
    );
        return;
      }
    }
    setSlots((prev) => {
      if (prev.length >= requiredQty) return prev;
      return [...prev, flavorId];
    });
  }
  function removeOne(flavorId: number) {
    setSlots((prev) => {
      // Hapus instance terakhir dari flavor tsb (mulai dari belakang)
      // supaya kalau ada 2x Cookies & Cream, klik - kurangi 1 dulu.
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i] === flavorId) {
          const next = prev.slice();
          next.splice(i, 1);
          return next;
        }
      }
      return prev;
    });
  }
  function countOf(flavorId: number): number {
    return slots.reduce((s, id) => (id === flavorId ? s + 1 : s), 0);
  }

  function addBundleToCart() {
    if (!bundle) return;
    if (!allFilled) {
      toast.warning(name, t.menu.bundleEmpty.replace("{n}", String(requiredQty)));
      return;
    }
    cart.addBundle(bundle, slots, note || undefined);
    // Toast removed — see FlavorCard.tsx untuk alasannya.
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
            onClick={addBundleToCart}
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
          <div className="mt-1.5">
            <PriceTag
              price={bundle.price}
              comparePrice={bundle.compare_price}
              lang={lang}
              size="lg"
            />
          </div>
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
              <span
                key={`${idx}-${flavorId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-matcha-500/15 px-2.5 py-1 text-[12px] font-bold text-matcha-700"
              >
                <span className="tabular">#{idx + 1}</span>
                <span className="max-w-[10rem] truncate">
                  {lang === "en" ? f.name_en : f.name_id}
                </span>
              </span>
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
            const picked = countOf(f.id);
            const remaining = requiredQty - filledCount;
            return (
              <article
                key={f.id}
                className={`relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition ${
                  picked > 0
                    ? "border-matcha-500 shadow-md"
                    : "border-cocoa-200 hover:border-cocoa-300"
                }`}
              >
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
                  {/* Sisa stok kategori SEBENARNYA — sebelumnya di-hardcode "Selalu tersedia"
                      padahal create_order sudah mengurangi categories.stock satu
                      pcs per slot bundle. */}
                  {(() => {
                    const catId = f.category_id;
                    const left =
                      catId != null
                        ? (remainingByCategory.get(catId) ?? null)
                        : null;
                    if (left === 0) {
                      return (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-berry-500">
                          <PackageX className="size-3" />
                          {t.menu.soldOut}
                        </p>
                      );
                    }
                    if (left !== null) {
                      return (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-matcha-700">
                          <Sparkles className="size-3" />
                          {left <= 5
                            ? t.menu.lowStock.replace("{n}", String(left))
                            : t.menu.inStock.replace("{n}", String(left))}
                        </p>
                      );
                    }
                    return (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-cocoa-400">
                        <Sparkles className="size-3" />
                        {t.menu.unlimited}
                      </p>
                    );
                  })()}
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
                  {/* +/- stepper (gaya FlavorCard) */}
                  <div
                    className="mt-3 inline-flex w-full items-stretch overflow-hidden rounded-xl border-2 border-matcha-500 shadow-sm"
                    role="group"
                    aria-label={name}
                  >
                    <button
                      type="button"
                      onClick={() => removeOne(f.id)}
                      disabled={picked <= 0}
                      aria-label={`-1 ${name}`}
                      className="grid w-12 shrink-0 place-items-center text-matcha-600 transition hover:bg-matcha-50 active:scale-95 disabled:text-cocoa-300 disabled:hover:bg-transparent"
                    >
                      <Minus className="size-4" />
                    </button>
                    <div className="flex flex-1 items-center justify-center font-display text-base font-extrabold text-cocoa-900 tabular">
                      {picked}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (remaining <= 0) {
                          toast.warning(
                            name,
                            t.order.menu.maxReached.replace(
                              "{n}",
                              String(requiredQty)
                            )
                          );
                          return;
                        }
                        addOne(f.id);
                      }}
                      disabled={remaining <= 0}
                      aria-label={`+1 ${name}`}
                      className="grid w-12 shrink-0 place-items-center bg-matcha-500 text-white transition hover:bg-matcha-600 active:scale-95 disabled:bg-cocoa-300"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Catatan bundle (1 note per bundle, berlaku untuk semua slot) */}
      <div className="mt-5">
        <label htmlFor="bundle-note" className="label">
          <MessageSquare className="mr-1 inline size-3.5" />
          {t.menu.bundleNoteLabel}
        </label>
        <input
          id="bundle-note"
          type="text"
          maxLength={120}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.menu.notePlaceholder}
          className="input"
        />
        <p className="mt-1.5 text-xs text-cocoa-400">{t.menu.bundleNoteHint}</p>
      </div>
    </Modal>
  );
}