"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  ChevronRight,
  Check,
  Filter,
  Gift,
  LayoutGrid,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import type { Bundle, Category } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { FlavorCard } from "./FlavorCard";
import { PriceTag } from "./PriceTag";
import { cheapestBundle, formatIDR } from "@/lib/utils";
import { useSoldCounts } from "@/lib/useSoldCounts";
import { OrderBundleModal } from "./OrderBundleModal";
import { useCart } from "./CartProvider";
import { remainingStockByCategory } from "@/lib/cart-stock";

/** Urutan tampilan grid produk di halaman pre-order (UIUX 3). */
type SortKey = "recommended" | "price-asc" | "price-desc" | "name";

/**
 * Penjelahar menu di beranda (mode lihat-saja):
 * klik kategori dulu, lalu lihat rasanya.
 */
export function MenuBrowser({
  categories,
  bundles = [],
  emptyLabel,
}: {
  categories: Category[];
  /** Bundle berdiri sendiri (category_id=NULL). */
  bundles?: Bundle[];
  emptyLabel?: string;
}) {
  const { t, lang } = useI18n();
  // Angka terjual diambil di sisi client supaya kartu bisa menampilkan
  // "N terjual" tanpa menunggu render server. Hook yang sama dipakai section
  // "Populer" di atas, jadi keduanya menampilkan angka yang konsisten.
  const soldCounts = useSoldCounts();
  const withFlavors = useMemo(
    () => categories.filter((c) => (c.flavors?.length ?? 0) > 0),
    [categories]
  );
  const [activeId, setActiveId] = useState<number | null>(null);

  const active = withFlavors.find((c) => c.id === activeId) ?? null;

  // Kalau hanya satu jenis, langsung tampilkan rasa-rasanya (tanpa perlu klik).
  const onlyOne = withFlavors.length === 1;
  const shown = onlyOne ? withFlavors[0] : active;

  // Bundle termurah, untuk teaser di beranda
  const best = useMemo(() => cheapestBundle(bundles), [bundles]);
  const bestOffer = best
    ? t.order.review.bundleOffer
        .replace("{n}", String(best.qty))
        .replace("{price}", formatIDR(best.price, lang))
    : "";

  if (withFlavors.length === 0 && bundles.length === 0) {
    return (
      <p className="card p-10 text-center text-cocoa-400">{emptyLabel ?? t.menu.empty}</p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Bundle tidak lagi dirender di sini. Permintaan Steven (10-10-2026):
          paket hemat dipindah ke atas section "Populer" di beranda, supaya
          urutannya Hero -> Bundle -> Populer -> Menu. */}

      {/* ---------- Tingkat 1: jenis makanan ---------- */}
      <div>
        {onlyOne ? (
          <p className="mb-3 flex items-center gap-2 text-base font-extrabold text-cocoa-800">
            <UtensilsCrossed className="size-4 shrink-0 text-cocoa-400" />
            {lang === "en" ? withFlavors[0].name_en : withFlavors[0].name_id}
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm font-bold text-cocoa-500">{t.menu.pickCategory}</p>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
              {withFlavors.map((c) => {
                const name = lang === "en" ? c.name_en : c.name_id;
                const desc = lang === "en" ? c.desc_en : c.desc_id;
                const selected = c.id === activeId;

                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={`group flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${
                        selected
                          ? "border-matcha-500 bg-matcha-50"
                          : "border-cocoa-200 bg-white hover:border-cocoa-300 hover:bg-cocoa-50/60"
                      }`}
                    >
                      <span
                        className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl ${
                          c.image_url
                            ? "bg-cocoa-100"
                            : "bg-gradient-to-br from-cocoa-300 to-cocoa-500"
                        }`}
                      >
                        {c.image_url ? (
                          <Image
                            src={c.image_url}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <LayoutGrid className="size-6 text-white/70" />
                        )}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-bold text-cocoa-900">
                          {name}
                        </span>
                        <span className="mt-0.5 block text-xs text-cocoa-400">
                          {c.flavors?.length} {t.menu.flavors}
                        </span>
                        {desc ? (
                          <span className="mt-0.5 line-clamp-1 block text-[11px] text-cocoa-400">
                            {desc}
                          </span>
                        ) : null}
                      </span>

                      <ChevronRight
                        className={`size-4 shrink-0 transition ${
                          selected ? "text-matcha-600" : "text-cocoa-300"
                        }`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* ---------- Tingkat 2: rasa ---------- */}
      {shown ? (
        <div className="border-t border-cocoa-200 pt-5">
          {/* Kalau cuma ada satu jenis, judul di baris atas (tingkat 1) sudah
              menulis nama yang sama persis. Menuliskannya lagi di sini bikin
              dua label identik bertumpuk — makin terasa setelah section
              "Kategori" dihapus dari beranda (permintaan Steven, 10-10-2026). */}
          {!onlyOne ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-bold text-cocoa-500">
                <UtensilsCrossed className="size-4" />
                {lang === "en" ? shown.name_en : shown.name_id}
              </p>

              <div className="flex items-center gap-3">
                {/* Paket termurah di toko, untuk memberi gambaran ke pembeli */}
                {bestOffer ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-berry-500/10 px-3 py-1 text-[11px] font-bold text-berry-600">
                    <Sparkles className="size-3.5" />
                    {bestOffer}
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="text-xs font-bold text-cocoa-400 transition hover:text-cocoa-700"
                >
                  ← {t.menu.changeCategory}
                </button>
              </div>
            </div>
          ) : bestOffer ? (
            <div className="mb-3 flex justify-end">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-berry-500/10 px-3 py-1 text-[11px] font-bold text-berry-600">
                <Sparkles className="size-3.5" />
                {bestOffer}
              </span>
            </div>
          ) : null}

          {/* Tiga kartu dalam satu baris, bahkan di HP — ini yang Steven
              minta (10-10-2026): kartu menu diperkecil supaya ukurannya
              sama dengan kartu "Populer" tepat di atasnya, bukan dua kali
              sebesar itu. Class `density-flavor-grid` sengaja TIDAK dipakai
              di sini karena class itu memaksa 2 kolom di layar < 640px. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
            {(shown.flavors ?? []).map((f) => (
              <FlavorCard
                key={f.id}
                flavor={f}
                dense
                showSocial
                soldCount={soldCounts[f.id] ?? 0}
                showSold
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Daftar menu untuk halaman pre-order:
 * Tampilkan kategori sebagai kartu; klik kategori -> buka modal dengan
 * grid rasa + stepper +/- di dalamnya. Lebih cepat di HP (tidak harus
 * scroll semua rasa) dan siap untuk menu lain di masa depan (setiap
 * kategori punya modal-nya sendiri).
 *
 * Bundle berdiri sendiri (atau yang terkait kategori) ditampilkan di
 * section terpisah di atas, supaya pembeli tahu ada pilihan paket hemat.
 * Bundle: klik -> modal pilih {required_qty} slot rasa -> masuk keranjang.
 */
export function OrderMenuBrowser({
  categories,
  bundles = [],
  soldCounts = {},
}: {
  categories: Category[];
  /** Bundle berdiri sendiri (category_id=NULL) atau per-kategori. */
  bundles?: Bundle[];
  /** Map flavorId -> jumlah pcs terjual (accepted/ready/delivered). */
  soldCounts?: Record<number, number>;
}) {
  const { t, lang } = useI18n();
  const { quantities, bundles: cartBundles } = useCart();
  const withFlavors = useMemo(
    () => categories.filter((c) => (c.flavors?.length ?? 0) > 0),
    [categories]
  );
  const [openBundleId, setOpenBundleId] = useState<number | null>(null);
  const activeBundle = bundles.find((b) => b.id === openBundleId) ?? null;

  /* ---------- State etalase ala UIUX 3 ---------- */
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [hideSoldOut, setHideSoldOut] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("recommended");

  // Pencarian dari kolom search di top bar: `/order?q=matcha`.
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim().toLowerCase();

  const totalFlavors = useMemo(
    () => withFlavors.reduce((sum, c) => sum + (c.flavors?.length ?? 0), 0),
    [withFlavors]
  );

  // Sisa stok per kategori setelah SELURUH isi keranjang diperhitungkan —
  // termasuk slot bundle yang sudah ada. Sebelumnya kartu rasa biasa hanya
  // mengurangi `quantities`, jadi begitu ada bundle di keranjang, angka
  // "Tersedia N" di halaman ini tetap menampilkan stok penuh (stok 10 ->
  // bundle 2 pcs -> kartu biasa masih tulis 10, padahal sudah sisa 8).
  // Logikanya sama dengan `OrderBundleModal` karena keduanya lewat helper.
  const remainingByCategory = useMemo(
    () => remainingStockByCategory(categories, quantities, cartBundles),
    [categories, quantities, cartBundles]
  );

  // Gabungan semua rasa dari kategori terpilih, lalu disaring & diurutkan.
  // `soldOut` dihitung di sini (bukan di kartu) supaya bisa dipakai untuk
  // tombol filter "sembunyikan yang habis" juga.
  const shownFlavors = useMemo(() => {
    const pool =
      activeCategory === "all"
        ? withFlavors.flatMap((c) => (c.flavors ?? []).map((f) => ({ flavor: f, category: c })))
        : withFlavors
            .filter((c) => c.id === activeCategory)
            .flatMap((c) => (c.flavors ?? []).map((f) => ({ flavor: f, category: c })));

    const isSoldOut = ({ flavor: f, category: c }: (typeof pool)[number]) => {
      const isActive = f.is_active ?? true;
      if (!isActive) return true;
      const left = remainingByCategory.get(c.id);
      return left != null && left <= 0;
    };

    let filtered = hideSoldOut ? pool.filter((x) => !isSoldOut(x)) : pool;

    // Pencarian: cocok di nama (id + en), deskripsi, dan slug.
    // Kategori yang sedang aktif TIDAK dipakai untuk mempersempit
    // pencarian — kalau user mengetik "matcha" sedang berada di kategori
    // lain, hasilnya akan menyesatkan. Kategori aktif cuma menentukan
    // urutan tampil, bukan kelayakannya.
    if (searchQuery) {
      filtered = filtered.filter(({ flavor: f }) => {
        const haystack = [
          f.name_id,
          f.name_en,
          f.desc_id,
          f.desc_en,
          f.slug,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchQuery);
      });
    }

    // "Rekomendasi" = featured dulu, sisanya ikut urutan kategori supaya
    // tidak lompat-lompat tiap render.
    const sorted = [...filtered];
    if (sortKey === "recommended") {
      sorted.sort((a, b) => {
        const fa = a.flavor.is_featured ? 0 : 1;
        const fb = b.flavor.is_featured ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return a.flavor.sort_order - b.flavor.sort_order;
      });
    } else if (sortKey === "price-asc") {
      sorted.sort((a, b) => a.flavor.price - b.flavor.price);
    } else if (sortKey === "price-desc") {
      sorted.sort((a, b) => b.flavor.price - a.flavor.price);
    } else {
      sorted.sort((a, b) => a.flavor.sort_order - b.flavor.sort_order);
    }
    return sorted;
  }, [withFlavors, activeCategory, hideSoldOut, sortKey, remainingByCategory, searchQuery]);

  const empty = withFlavors.length === 0 && bundles.length === 0;
  if (empty) {
    return <p className="card p-10 text-center text-cocoa-400">{t.menu.empty}</p>;
  }

  return (
    <>
      {/* ---------- Section bundle (paket hemat) ---------- */}
      {bundles.length > 0 ? (
        <div id="bundle-section" className="mb-8 scroll-mt-20">
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-berry-500/10 text-berry-600">
              <Gift className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-lg font-extrabold text-cocoa-900">
                {t.menu.bundleSection}
              </p>
              <p className="text-xs text-cocoa-500">
                {lang === "en"
                  ? "Mix and match flavors in one bundle"
                  : "Pilih beberapa rasa dalam satu paket"}
              </p>
            </div>
          </div>
          <ul className="density-bundle-grid grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b) => {
              const inCart = cartBundles.filter((cb) => cb.bundle.id === b.id).length;
              // Steven: satu bundle hanya boleh masuk keranjang SEKALI. Kalau
              // sudah ada, kartu dikunci supaya tidak bisa ditambah lagi
              // (backend juga akan menolak slot ganda untuk paket yang sama).
              const sudah = inCart > 0;
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    disabled={sudah}
                    onClick={() => setOpenBundleId(b.id)}
                    aria-label={
                      sudah
                        ? lang === "en"
                          ? `${b.name_en} already in cart`
                          : `${b.name_id} sudah ada di keranjang`
                        : undefined
                    }
                    className={`group block h-full w-full overflow-hidden rounded-2xl border-2 bg-white text-left transition ${
                      sudah
                        ? "cursor-not-allowed border-matcha-500 opacity-80"
                        : "border-cocoa-200 hover:-translate-y-0.5 hover:border-matcha-400 hover:shadow-lg hover:shadow-cocoa-900/10 active:scale-[0.99]"
                    }`}
                  >
                    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-transparent bg-white">
                      <div className="relative aspect-[5/3] overflow-hidden bg-gradient-to-br from-honey-300 to-berry-500 sm:aspect-[4/3]">
                        {b.image_url ? (
                          <Image
                            src={b.image_url}
                            alt={lang === "en" ? b.name_en : b.name_id}
                            fill
                            sizes="(max-width: 640px) 50vw, 33vw"
                            className="object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="absolute inset-0 grid place-items-center bg-grain">
                            <Gift className="size-12 text-white/50" />
                          </div>
                        )}
                        <span className="absolute left-3 top-3 chip bg-honey-400/95 text-cocoa-900 shadow">
                          <Sparkles className="size-3 fill-current" />
                          {t.menu.bundleLabel}
                        </span>
                        {b.compare_price != null &&
                        b.compare_price > b.price ? (
                          <span className="absolute right-3 top-3 chip bg-berry-500 text-white shadow tabular">
                            −
                            {Math.round(
                              ((b.compare_price - b.price) / b.compare_price) *
                                100
                            )}
                            %
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-lg leading-tight font-bold text-cocoa-900">
                            {lang === "en" ? b.name_en : b.name_id}
                          </h3>
                          {sudah ? (
                            <span className="chip shrink-0 bg-matcha-500 text-white">
                              <Check className="size-3" />
                              {lang === "en" ? "In cart" : "Di keranjang"}
                            </span>
                          ) : null}
                        </div>
                        {/* Harga DI BAWAH foto (bukan chip di atas foto) +
                            harga asal dicoret kalau bundle ini diskon. */}
                        <div className="mt-2">
                          <PriceTag
                            price={b.price}
                            comparePrice={b.compare_price}
                            lang={lang}
                            size="lg"
                          />
                        </div>
                        <p className="mt-2 text-[12px] font-bold text-matcha-700">
                          {t.menu.bundleIncludes.replace("{n}", String(b.required_qty))}
                        </p>
                      </div>
                    </article>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ---------- Strip kategori (UIUX 3) ---------- */}
      {withFlavors.length > 0 ? (
        <div className="mb-6">
          <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <li className="shrink-0">
              <button
                type="button"
                onClick={() => setActiveCategory("all")}
                className={`flex w-24 flex-col items-center gap-2 rounded-2xl border-2 p-3 transition sm:w-28 ${
                  activeCategory === "all"
                    ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                    : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-300"
                }`}
              >
                <span className="grid size-11 place-items-center rounded-xl bg-cocoa-100">
                  <LayoutGrid
                    className={`size-5 ${
                      activeCategory === "all" ? "text-cocoa-700" : "text-cocoa-500"
                    }`}
                  />
                </span>
                <span className="text-[11px] font-bold leading-tight">
                  {t.storefront.allCategories}
                </span>
                <span
                  className={`text-[10px] tabular ${
                    activeCategory === "all" ? "text-cream-300" : "text-cocoa-400"
                  }`}
                >
                  {totalFlavors}
                </span>
              </button>
            </li>

            {withFlavors.map((c) => {
              const name = lang === "en" ? c.name_en : c.name_id;
              const count = c.flavors?.length ?? 0;
              const isActive = activeCategory === c.id;
              return (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveCategory(c.id)}
                    aria-current={isActive}
                    className={`flex w-24 flex-col items-center gap-2 rounded-2xl border-2 p-3 transition sm:w-28 ${
                      isActive
                        ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                        : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-300"
                    }`}
                  >
                    <span
                      className={`relative grid size-11 place-items-center overflow-hidden rounded-xl ${
                        c.image_url ? "bg-cocoa-100" : "bg-gradient-to-br from-cocoa-300 to-cocoa-500"
                      }`}
                    >
                      {c.image_url ? (
                        <Image
                          src={c.image_url}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      ) : (
                        <LayoutGrid className="size-5 text-white/70" />
                      )}
                    </span>
                    <span className="line-clamp-2 text-[11px] leading-tight font-bold">
                      {name}
                    </span>
                    <span
                      className={`text-[10px] tabular ${
                        isActive ? "text-cream-300" : "text-cocoa-400"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ---------- Toolbar: filter / jumlah produk / urutan (UIUX 3) ---------- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-y border-cocoa-200/70 py-3">
        <button
          type="button"
          onClick={() => setHideSoldOut((v) => !v)}
          aria-pressed={hideSoldOut}
          className={`inline-flex items-center gap-2 text-xs font-bold transition ${
            hideSoldOut ? "text-cocoa-800" : "text-cocoa-500 hover:text-cocoa-800"
          }`}
        >
          <Filter className="size-3.5" />
          {hideSoldOut
            ? lang === "en"
              ? "Showing available only"
              : "Hanya yang tersedia"
            : t.storefront.hideSoldOut}
        </button>

        <span className="text-xs font-bold text-cocoa-400 tabular">
          {t.storefront.productsCount.replace("{n}", String(shownFlavors.length))}
        </span>

        <label className="inline-flex items-center gap-1.5 text-xs text-cocoa-400">
          <span className="font-bold">{t.storefront.sortBy}</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="cursor-pointer rounded-lg border border-cocoa-200 bg-white px-2 py-1 text-xs font-bold text-cocoa-700"
          >
            <option value="recommended">{t.storefront.sortRecommended}</option>
            <option value="price-asc">{t.storefront.sortPriceLow}</option>
            <option value="price-desc">{t.storefront.sortPriceHigh}</option>
            <option value="name">{t.storefront.sortNameAsc}</option>
          </select>
        </label>
      </div>

      {/* ---------- Grid produk (UIUX 3) ---------- */}
      {withFlavors.length > 0 ? (
        <div>
          <div className="sr-only" id={`category-${activeCategory ?? "all"}`} />
          <ul className="density-flavor-grid grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
            {shownFlavors.map(({ flavor: f, category: c }) => {
              const fid = String(f.id);
              const q = quantities[fid] ?? 0;
              // Stok itu PER KATEGORI (lihat create_order yang mengurangi
              // categories.stock), jadi setiap rasa memakai sisa stok
              // kategorinya — termasuk efek bundle yang sudah di keranjang.
              const catLeft = remainingByCategory.get(c.id) ?? null;
              return (
                <li key={f.id} className="flex">
                  <FlavorCard
                    flavor={f}
                    inCart={q}
                    remainingStock={catLeft}
                    showSocial={false}
                    soldCount={soldCounts[f.id] ?? 0}
                    readOnlySocial
                    showStock={false}
                    selectable
                    storefront
                  />
                </li>
              );
            })}
          </ul>

          {shownFlavors.length === 0 ? (
            <p className="card p-10 text-center text-sm text-cocoa-400">
              {t.menu.empty}
            </p>
          ) : null}
        </div>
      ) : null}

      {activeBundle ? (
        <OrderBundleModal
          // Pakai `key` agar state `slots` di dalam modal otomatis reset
          // ketika bundle yang dibuka berbeda (id / required_qty berubah).
          key={activeBundle.id}
          bundle={activeBundle}
          categories={withFlavors}
          open={activeBundle !== null}
          onClose={() => setOpenBundleId(null)}
          soldCounts={soldCounts}
        />
      ) : null}
    </>
  );
}

