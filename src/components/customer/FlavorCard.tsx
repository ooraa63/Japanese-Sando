"use client";

import Image from "next/image";
import { Flame, Heart, MessageSquare, Minus, PackageX, Plus, ShoppingBag, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { useFlavorLikes } from "@/lib/useFlavorLikes";
import { PriceTag } from "./PriceTag";
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
  /**
   * `showStock` -> tampilkan baris sisa stok ("Tersedia 11" / "Tersisa 3" /
   * "Habis"). Dimatikan di beranda karena kurang relevan untuk pengunjung
   * yang belum mau pesan; sisa stok baru relevan di halaman /order.
   */
  showStock = true,
  /**
   * `showSold` -> tampilkan baris "N terjual" di bawah pil like.
   * Default false: kartu menu di beranda cukup menampilkan "N liked"
   * (gambar referensi Steven) — angka terjual sudah tampil di section
   * "Populer", jadi tidak perlu diulang dua kali di halaman yang sama.
   */
  showSold = false,
  /**
   * `readOnlySocial` -> tampilkan counter 'terjual' & status like, tapi
   * tombol like dinonaktifkan (untuk halaman pre-order yang hanya boleh
   * melihat).
   */
  readOnlySocial = false,
  /**
   * `storefront` -> kartu bergaya etalase ala UIUX 3: foto di atas, hati
   * pojok kanan atas, lalu baris bawah berisi harga di kiri dan tombol
   * tambah di kanan. Warna tetap coklat — yang diambil layout-nya.
   */
  storefront = false,
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
  /** Tampilkan baris sisa stok. False di beranda, true di /order. */
  showStock?: boolean;
  /** Tampilkan baris "N terjual" di bawah pil like. Default false. */
  showSold?: boolean;
  /** Read-only: tampil tapi jangan izinkan like. */
  readOnlySocial?: boolean;
  /** Gaya etalase (UIUX 3) alih-alih kartu menu biasa. */
  storefront?: boolean;
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

  // Badge diskon di foto (kalau rasa ini punya harga coret).
  const discountPercent =
    flavor.compare_price != null &&
    Number.isFinite(flavor.compare_price) &&
    flavor.compare_price > flavor.price
      ? Math.round(
          ((flavor.compare_price - flavor.price) / flavor.compare_price) * 100
        )
      : null;

  // Like memakai store BERSAMA (`useFlavorLikes`) yang sama dengan kartu di
  // section "Populer". Kalau kartu ini punya state sendiri, menekan hati di
  // menu tidak akan membuat kartu Populer ikut berubah — dan dua kartu untuk
  // produk yang sama akan saling menimpa.
  const likes = useFlavorLikes();
  const isLiked = likes.isLiked(flavor.id);
  const likesCount = likes.count(flavor.id, flavor.likes_count ?? 0);
  const toggleLike = () => likes.toggle(flavor.id);

  /* ------------------------------------------------------------------
   * Gaya etalase (UIUX 3): foto di atas, hati pojok kanan atas, baris
   * bawah berisi harga + tombol tambah. Dipakai di halaman /order.
   * ------------------------------------------------------------------ */
  if (storefront) {
    return (
      <article
        className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition ${
          soldOut
            ? "border-cocoa-100 opacity-70"
            : "border-cocoa-200/70 hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10"
        }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-cream-100">
          {flavor.image_url ? (
            <Image
              src={flavor.image_url}
              alt={name}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-grain">
              <span className="font-display text-5xl font-bold text-white/25 select-none">
                {name.charAt(0)}
              </span>
            </div>
          )}

          {/* Hati pojok kanan atas — penanda "disukai" ala referensi. */}
          {readOnlySocial ? (
            <span className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm">
              <Heart
                className={`size-4 text-berry-500 ${isLiked ? "fill-current" : ""}`}
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={isLiked}
              aria-label={isLiked ? t.menu.likeRemove : t.menu.likeAdd}
              className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm transition hover:bg-white active:scale-95"
            >
              <Heart
                className={`size-4 transition ${isLiked ? "fill-current text-berry-500" : "text-cocoa-400"}`}
              />
            </button>
          )}

          {soldOut ? (
            <div className="absolute inset-0 grid place-items-center bg-cocoa-950/65">
              <span className="chip bg-white text-cocoa-800 shadow-lg">
                <PackageX className="size-3.5" />
                {t.menu.soldOut}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-3.5">
          <h3 className="font-display text-sm leading-tight font-bold text-cocoa-900">
            {name}
          </h3>
          <p className="mt-1 line-clamp-2 min-h-[2.4em] text-[11px] leading-snug text-cocoa-500">
            {desc ?? " "}
          </p>

          {/* Baris bawah: harga di atas, tombol full-width di bawahnya.
              Di grid 4 kolom HP kartu ini sempit — kalau harga dan
              tombol dijejer horizontal, angkanya terpotong jadi
              "Rp 1..." (masalah yang pernah dilaporkan Steven). Jadi
              menumpuknya adalah pilihan sadar, bukan sekadar gaya. */}
          <div className="mt-auto flex flex-col gap-2 pt-3">
            <PriceTag
              price={flavor.price}
              comparePrice={flavor.compare_price}
              lang={lang}
              size="md"
            />
            {selectable ? (
              <StorefrontAction
                flavor={flavor}
                inCart={inCart}
                soldOut={soldOut}
                stockEnabled={stockEnabled}
                left={left}
                fullWidth
              />
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  /* ------------------------------------------------------------------
   * Kartu menu di beranda (gambar referensi Steven, 10-10-2026):
   * foto tinggi, badge "Signature" di kiri atas, nama Playfair besar,
   * deskripsi, harga besar, lalu pil "N liked" selebar kartu.
   *
   * Ini SATU-SATUNYA tempat di beranda yang bisa di-like; section
   * "Populer" di atasnya sengaja read-only.
   * ------------------------------------------------------------------ */
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition ${
        soldOut
          ? "border-cocoa-100 opacity-70"
          : "border-cocoa-200/70 hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10"
      }`}
    >
      {/* Foto / placeholder. Rasio dibuat lebih tinggi dari 4:3 supaya
          kartu terasa seperti "poster" produk ala referensi. */}
      <div
        className={`flavor-photo relative aspect-[4/5] overflow-hidden bg-gradient-to-br ${gradientFor(flavor.slug)}`}
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
              {t.menu.signature}
            </span>
          ) : (
            <span />
          )}
          {/* Badge diskon (kalau ada) tetap nempel di foto; harga aslinya
              dipindah ke bawah gambar supaya tidak menutupi foto. */}
          {!soldOut && discountPercent !== null ? (
            <span className="chip bg-berry-500 text-white shadow tabular">
              −{discountPercent}%
            </span>
          ) : null}
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
        {/* Judul & deskripsi diberi tinggi minimum tetap supaya harga dan pil
            like selalu sejajar antar kartu — даже kalau ada nama 1 baris
            dan ada 2 baris.

            PENTING: nama hanya boleh dirender SATU kali di sini. Sebelumnya
            ada <h3>{name}</h3> di dalam wrapper flex ini DAN lagi di blok
            min-h di bawahnya, jadi tiap kartu menampilkan nama rasa dua kali
            (lihat laporan Steven "namanya kedouble"). Wrapper flex sekarang
            hanya untuk menyejajarkan chip jumlah keranjang dengan judul. */}
        <div className="flex items-start justify-between gap-2">
          {!compact ? (
            <h3 className="font-display min-h-[2.6em] text-xl leading-tight font-bold text-cocoa-900">
              {name}
            </h3>
          ) : (
            <h3 className="font-display text-base leading-snug font-bold text-cocoa-900">
              {name}
            </h3>
          )}
          {selectable && inCart > 0 ? (
            <span className="chip shrink-0 bg-matcha-100 text-matcha-700">
              <ShoppingBag className="size-3" />
              {inCart}
            </span>
          ) : null}
        </div>

        {!compact ? (
          <p className="flavor-desc mt-1.5 line-clamp-3 min-h-[3.6em] text-[13px] leading-relaxed text-cocoa-500">
            {desc ?? " "}
          </p>
        ) : null}

        {/* Harga DI BAWAH foto — dibuat sebesar mungkin di kartu beranda
            supaya pembeli cepat lihat tanpa menebak dari chip kecil. */}
        <div className="mt-2">
          <PriceTag
            price={flavor.price}
            comparePrice={flavor.compare_price}
            lang={lang}
            size="xl"
          />
        </div>

        {/* Baris sisa stok. Di beranda disembunyikan (showStock=false) supaya
            pengunjung yang belum memutuskan tidak ikut melihat angka stok; di
            /order baru ditampilkan karena di situ baru relevan. */}
        {showStock ? (
          <div className="mt-1 flex h-4 items-center gap-1.5 text-[11px] font-bold">
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
        ) : null}

        {selectable ? (
          <div className="mt-auto pt-3">
            <FlavorCardStepper
              flavor={flavor}
              soldOut={soldOut}
              stockEnabled={stockEnabled}
              left={left}
            />
          </div>
        ) : null}

        {/* Baris 'disukai' (+ 'terjual' kalau diaktifkan).
            Perataan:
            1) Angka + tombol dipakai BARIS SENDIRI di bawah teks, bukan
               dijejak baris dengan `truncate` — di grid sempit angka
               "terjual"/"disukai" pernah terpotong jadi "0 ter...".
            2) "disukai" memakai logo hati, jadi jelas itu suka, bukan
               sekadar angka.
            Di /order dipakai `readOnlySocial` sehingga tombolnya hilang
            dan angka saja yang tampil — like hanya ada di beranda. */}
        {showSocial ? (
          <div className="flavor-social mt-3 flex shrink-0 flex-col gap-1.5 border-t border-cocoa-100 pt-3 text-[12px]">
            {readOnlySocial ? (
              <span className="flex items-center justify-center gap-1 text-berry-500">
                <Heart className="size-4 shrink-0 fill-current" />
                <span className="font-bold tabular">{likesCount}</span>
                <span className="text-cocoa-500">{t.menu.likesCount}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => toggleLike()}
                aria-pressed={isLiked}
                aria-label={isLiked ? t.menu.likeRemove : t.menu.likeAdd}
                className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold transition active:scale-[0.98] ${
                  isLiked
                    ? "bg-berry-500 text-white"
                    : "bg-cocoa-100 text-cocoa-600 hover:bg-berry-500/15 hover:text-berry-600"
                }`}
              >
                <Heart
                  className={`size-4 shrink-0 ${isLiked ? "fill-current" : ""}`}
                />
                <span className="tabular">{likesCount}</span>
                <span>{t.menu.likesCount}</span>
              </button>
            )}
            {showSold ? (
              <span className="flex items-center justify-center gap-1 text-cocoa-500">
                <ShoppingBag className="size-4 shrink-0" />
                <span className="font-bold text-cocoa-700 tabular">{soldCount}</span>
                <span>{t.menu.soldCount}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Tombol aksi ringkas untuk kartu etalase (UIUX 3).
 *
 * Kalau produk belum ada di keranjang: tombol "+ Tambah" selebar baris.
 * Kalau sudah ada: angka pcs + tombol tambah kecil, supayaqty bisa naik
 * tanpa membuka drawer.
 *
 * `useCart()` dipanggil di sini (bukan di FlavorCard) supaya kartu yang
 * hanya dilihat-saja tidak ikut memuat state keranjang.
 */
function StorefrontAction({
  flavor,
  inCart,
  soldOut,
  stockEnabled,
  left,
  fullWidth = false,
}: {
  flavor: Flavor;
  inCart: number;
  soldOut: boolean;
  stockEnabled: boolean;
  left: number;
  /** Tombol selebar kartu (default kartu etalase pakai true). */
  fullWidth?: boolean;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  // `inCart` dikirim induk sebagai nilai awal supaya kartu tetap benar
  // walau provider keranjang belum selesai memuat.
  const qty = cart.quantities[String(flavor.id)] ?? inCart ?? 0;

  if (soldOut) {
    return (
      <button
        type="button"
        disabled
        className={`cursor-not-allowed rounded-xl border border-cocoa-200 bg-cocoa-50 px-3 py-2 text-[12px] font-bold whitespace-nowrap text-cocoa-400 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        {t.menu.unavailable}
      </button>
    );
  }

  if (qty > 0) {
    return (
      <div
        className={`flex items-center gap-1 ${fullWidth ? "w-full justify-between" : "shrink-0"}`}
      >
        <button
          type="button"
          onClick={() => cart.setQuantity(flavor.id, qty - 1)}
          aria-label={`-1 ${name}`}
          className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-matcha-500 bg-white text-matcha-600 transition hover:bg-matcha-50 active:scale-95"
        >
          <Minus className="size-4" />
        </button>
        <span className="min-w-6 flex-1 text-center font-display text-sm font-extrabold text-cocoa-900 tabular">
          {qty}
        </span>
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
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-matcha-500 text-white transition hover:bg-matcha-600 active:scale-95"
        >
          <Plus className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => cart.add(flavor)}
      className={`btn-primary !rounded-full !px-3.5 !py-2 text-[12px] whitespace-nowrap ${
        fullWidth ? "w-full" : "shrink-0"
      }`}
    >
      <Plus className="size-3.5" />
      {t.storefront.addShort}
    </button>
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
        className="mt-3 w-full cursor-not-allowed rounded-xl border border-cocoa-200 bg-cocoa-50 py-2 text-[13px] font-bold whitespace-nowrap text-cocoa-400"
      >
        {t.menu.unavailable}
      </button>
    );
  }

  if (qty > 0) {
    return (
      <div className="mt-2 space-y-2">
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
        // Toast removed — was interfering with the "Tambah ke keranjang" layer
        // when user clicks repeatedly. Cart drawer provides its own visual feedback.
      }}
      className="btn-primary mt-3 w-full !px-3 !py-2 text-[13px] whitespace-nowrap"
    >
      <Plus className="mr-1 inline size-3.5" />
      {t.menu.addToCart}
    </button>
  );
}
