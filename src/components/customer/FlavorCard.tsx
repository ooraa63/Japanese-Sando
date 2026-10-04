"use client";

import { useState } from "react";
import Image from "next/image";
import { Flame, Heart, MessageSquare, Minus, PackageX, Plus, ShoppingBag, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
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
  inCart = 0,
  compact = false,
  remainingStock = null,
  categoryName,
  /**
   * `selectable` -> kartu punya tombol +/- (dipakai di halaman /order).
   * Default false supaya kartu di beranda murni lihat-saja tanpa akses
   * ke keranjang.
   */
  selectable = false,
  soldCount = 0,
  showSocial = false,
}: {
  flavor: Flavor;
  inCart?: number;
  compact?: boolean;
  /** Stok keseluruhan toko (bukan per rasa). null = tak terbatas. */
  remainingStock?: number | null;
  /** Nama kategori, ditampilkan sebagai label kecil di atas nama rasa. */
  categoryName?: string;
  selectable?: boolean;
  /** Jumlah pcs yang sudah terjual untuk rasa ini. */
  soldCount?: number;
  /** Tampilkan like heart + counter 'terjual' di kartu. */
  showSocial?: boolean;
}) {
  const { t, lang } = useI18n();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  const desc = lang === "en" ? flavor.desc_en : flavor.desc_id;
  const stockEnabled = remainingStock !== null && remainingStock !== undefined;
  const left = stockEnabled ? remainingStock : 0;
  // `is_active` bisa undefined kalau objek rasa datang dari public_menu()
  // (yang memang hanya mengirim rasa yang aktif). Unset berarti aktif.
  const isActive = flavor.is_active ?? true;
  const soldOut = !isActive || (stockEnabled && left <= 0);
  const low = stockEnabled && left > 0 && left <= 5;

  // Like state — disimpan per-device di localStorage. Inisialisasi dari storage.
  const likeKey = `like:flavor:${flavor.id}`;
  const [isLiked, setIsLiked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(likeKey) === "1";
    } catch {
      return false;
    }
  });
  function toggleLike() {
    setIsLiked((prev) => {
      const next = !prev;
      try {
        if (next) window.localStorage.setItem(likeKey, "1");
        else window.localStorage.removeItem(likeKey);
      } catch {
        /* abaikan */
      }
      return next;
    });
  }

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
        className={`relative aspect-[5/3] overflow-hidden bg-gradient-to-br ${gradientFor(flavor.slug)} sm:aspect-[4/3]`}
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
        {categoryName && !compact ? (
          <p className="mb-1 text-[10px] font-bold tracking-wide text-cocoa-300 uppercase">
            {categoryName}
          </p>
        ) : null}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg leading-tight font-bold text-cocoa-900">
            {name}
          </h3>
          {!selectable && inCart > 0 ? (
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

        {selectable ? (
          <FlavorCardStepper
            flavor={flavor}
            soldOut={soldOut}
            stockEnabled={stockEnabled}
            left={left}
          />
        ) : null}

        {/* Baris 'terjual' + like (hanya di halaman pilih menu, on demand) */}
        {showSocial ? (
          <div className="mt-3 flex items-center justify-between border-t border-cocoa-100 pt-3 text-xs">
            <span className="text-cocoa-500">
              <span className="font-bold text-cocoa-700 tabular">
                {soldCount}
              </span>{" "}
              {t.menu.soldCount.replace("{n}", "")}
            </span>
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={isLiked}
              aria-label={isLiked ? t.menu.likeRemove : t.menu.likeAdd}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition ${
                isLiked
                  ? "bg-berry-500 text-white"
                  : "bg-cocoa-100 text-cocoa-600 hover:bg-berry-500/15 hover:text-berry-600"
              }`}
            >
              <Heart
                className={`size-3.5 ${isLiked ? "fill-current" : ""}`}
              />
              {isLiked ? t.menu.liked : t.menu.like}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Stepper +/- untuk halaman /order. Dipisah supaya `useCart()` /
 * `useToast()` tidak terpanggil ketika kartu hanya untuk dilihat
 * (mis. di beranda).
 */
function FlavorCardStepper({
  flavor,
  soldOut,
  stockEnabled,
  left,
}: {
  flavor: Flavor;
  soldOut: boolean;
  stockEnabled: boolean;
  left: number;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  const qty = cart.quantities[String(flavor.id)] ?? 0;
  const note = cart.notes[String(flavor.id)] ?? "";

  if (soldOut) {
    return (
      <button
        type="button"
        disabled
        className="mt-4 w-full cursor-not-allowed rounded-xl border border-cocoa-200 bg-cocoa-50 py-2.5 text-sm font-bold text-cocoa-400"
      >
        {t.menu.unavailable}
      </button>
    );
  }

  if (qty > 0) {
    return (
      <div className="mt-4 space-y-2">
        <div
          className="inline-flex w-full items-stretch overflow-hidden rounded-xl border-2 border-matcha-500 bg-white shadow-sm"
          role="group"
          aria-label={name}
        >
          <button
            type="button"
            onClick={() => cart.setQuantity(flavor.id, qty - 1)}
            aria-label={`-1 ${name}`}
            className="grid w-12 shrink-0 place-items-center text-matcha-600 transition hover:bg-matcha-50 active:scale-95"
          >
            <Minus className="size-4" />
          </button>
          <div className="flex flex-1 items-center justify-center font-display text-base font-extrabold text-cocoa-900 tabular">
            {qty}
          </div>
          <button
            type="button"
            onClick={() => {
              const next = qty + 1;
              // Hormati sisa stok (kalau ada) supaya langkah berikutnya
              // tidak menambah lebih dari yang dijual.
              if (stockEnabled && left > 0 && next > left) {
                toast.warning(
                  name,
                  t.order.menu.maxReached.replace("{n}", String(left))
                );
                return;
              }
              cart.add(flavor);
            }}
            aria-label={`+1 ${name}`}
            className="grid w-12 shrink-0 place-items-center bg-matcha-500 text-white transition hover:bg-matcha-600 active:scale-95"
          >
            <Plus className="size-4" />
          </button>
        </div>
        {/* Field catatan per item — mis. "jangan pakai cabe". */}
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-cocoa-400" />
          <input
            type="text"
            placeholder={t.menu.notePlaceholder}
            value={note}
            onChange={(e) => cart.setNote(flavor.id, e.target.value)}
            maxLength={120}
            className="input !py-2 !pl-9 !text-[13px]"
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        cart.add(flavor);
        toast.success(name, t.menu.addToCart);
      }}
      className="btn-primary mt-4 w-full text-sm"
    >
      + {t.menu.addToCart}
    </button>
  );
}