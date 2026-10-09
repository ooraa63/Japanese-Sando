"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Heart,
  LayoutGrid,
  Plus,
  Star,
  Truck,
  Timer,
} from "lucide-react";
import type { Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/utils";

/**
 * Beranda bergaya aplikasi — mengikuti layout UIUX 4 (screen "Home"):
 * sapaan -> hero banner (carousel) -> kategori -> produk populer ->
 * banner promo -> daftar terlaris.
 *
 * Semua section memakai palet coklat yang sudah ada (cocoa/cream/honey).
 * Referensinya oranye, jadi aksen diambil dari `honey-*` — tetap di
 * keluarga coklat, bukan warna baru.
 */

/* ==================================================================
 * Sapaan — "Good morning, User! ☕"
 * ================================================================ */

/** Bahasa sapaan menurut jam lokal. Nilai balik string, jadi stabil. */
function greetingForHour(t: ReturnType<typeof useI18n>["t"]) {
  const h = new Date().getHours();
  if (h < 11) return t.home.greetingMorning;
  if (h < 18) return t.home.greetingAfternoon;
  return t.home.greetingEvening;
}

/** Jam tidak punya "perubahan" yang perlu dipantau. */
function noopSubscribe() {
  return () => {};
}

export function HomeGreeting({ userName }: { userName?: string | null }) {
  const { t } = useI18n();

  // Jam adalah "sumber luar", jadi dibaca lewat useSyncExternalStore —
  // bukan useEffect + setState (itu cascading render, dan React 19 +
  // eslint menolaknya). Server selalu merender sapaan pagi; client
  // membaca jam sungguhan SESUDAH hydration, jadi tidak ada mismatch.
  const greeting = useSyncExternalStore(
    noopSubscribe,
    () => greetingForHour(t),
    () => t.home.greetingMorning
  );

  const name = userName?.trim() || t.home.guest;

  return (
    <h1 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-900 sm:text-xl">
      {greeting}, {name}!
      <span aria-hidden className="text-base">
        ☕
      </span>
    </h1>
  );
}

/* ==================================================================
 * Hero banner — gambar di kanan, teks di kiri, titik carousel
 * ================================================================ */
export function HeroBanner({
  images,
  ctaSlot,
}: {
  images: string[];
  ctaSlot: React.ReactNode;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState(0);

  const slides = useMemo(() => images.filter(Boolean), [images]);
  const hasCarousel = slides.length > 1;

  useEffect(() => {
    if (!hasCarousel) return;
    const timer = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasCarousel, slides.length]);

  const src = slides[active] ?? null;

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-cocoa-900 shadow-lg shadow-cocoa-900/15">
      {/* Foto produk menutupi separuh kanan banner. */}
      {src ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2">
          <Image
            src={src}
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-cocoa-900 via-cocoa-900/55 to-transparent" />
        </div>
      ) : null}

      <div className="relative p-5 pr-[45%] sm:p-7 sm:pr-[45%]">
        <h2 className="font-display text-xl leading-tight font-extrabold text-balance text-cream-50 sm:text-2xl">
          {t.home.heroTitleTop}{" "}
          <span className="text-honey-400">{t.home.heroTitleAccent}</span>
          <br />
          {t.home.heroTitleBottom}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-cream-200/75 sm:text-sm">
          {t.home.heroDesc}
        </p>
        <div className="mt-4">{ctaSlot}</div>
      </div>

      {/* Titik carousel ala referensi: yang aktif memanjang. */}
      {hasCarousel ? (
        <div className="relative flex items-center justify-center gap-1.5 pb-4">
          {slides.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === active}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-5 bg-honey-400" : "w-2 bg-cream-50/40"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ==================================================================
 * Kategori — deretan ikon yang bisa digeser
 * ================================================================ */
export function CategoryRow({ categories }: { categories: Category[] }) {
  const { t, lang } = useI18n();
  const withFlavors = categories.filter((c) => (c.flavors?.length ?? 0) > 0);
  if (withFlavors.length === 0) return null;

  return (
    <section>
      <SectionHead title={t.home.categories} />
      <ul className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {withFlavors.map((c) => {
          const name = lang === "en" ? c.name_en : c.name_id;
          return (
            <li key={c.id} className="shrink-0">
              <Link
                href="/order"
                className="flex w-[4.5rem] flex-col items-center gap-1.5 rounded-2xl border border-cocoa-200/70 bg-white p-2.5 transition hover:border-honey-400 hover:shadow-md"
              >
                <span className="relative grid size-11 place-items-center overflow-hidden rounded-xl bg-honey-100">
                  {c.image_url ? (
                    <Image
                      src={c.image_url}
                      alt=""
                      fill
                      sizes="44px"
                      className="object-cover"
                    />
                  ) : (
                    <LayoutGrid className="size-5 text-honey-600" />
                  )}
                </span>
                <span className="line-clamp-2 text-center text-[10px] leading-tight font-bold text-cocoa-700">
                  {name}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ==================================================================
 * Produk populer — kartu 3 kolom dengan hati + jumlah suka
 * ================================================================ */
export function PopularGrid({ flavors }: { flavors: Flavor[] }) {
  const { t, lang } = useI18n();

  if (flavors.length === 0) {
    return <p className="text-sm text-cocoa-400">{t.home.emptyPopular}</p>;
  }

  return (
    <section>
      <SectionHead
        title={t.home.popular}
        href="/order"
        linkLabel={t.home.viewAll}
      />
      <ul className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
        {flavors.map((f) => {
          const name = lang === "en" ? f.name_en : f.name_id;
          const isSoldOut = f.is_active === false;
          return (
            <li key={f.id} className="flex">
              <Link
                href="/order"
                className="group flex w-full flex-col overflow-hidden rounded-2xl border border-cocoa-200/70 bg-white transition hover:-translate-y-0.5 hover:border-honey-400 hover:shadow-md"
              >
                <div className="relative aspect-square overflow-hidden bg-cream-100">
                  {f.image_url ? (
                    <Image
                      src={f.image_url}
                      alt={name}
                      fill
                      sizes="(max-width: 640px) 30vw, 20vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-grain">
                      <span className="font-display text-3xl font-bold text-white/30">
                        {name.charAt(0)}
                      </span>
                    </div>
                  )}
                  {/* Hati ala referensi; menaut ke halaman favorit. */}
                  <span
                    aria-hidden
                    className="absolute top-1.5 right-1.5 grid size-7 place-items-center rounded-full bg-white/90 shadow-sm"
                  >
                    <Heart className="size-3.5 text-cocoa-400" />
                  </span>
                  {isSoldOut ? (
                    <div className="absolute inset-0 grid place-items-center bg-cocoa-950/60">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-cocoa-800">
                        {t.menu.soldOut}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-1 flex-col p-2 sm:p-2.5">
                  <p className="line-clamp-1 text-[11px] font-bold text-cocoa-900 sm:text-xs">
                    {name}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-1 pt-1.5">
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-cocoa-500">
                      <Heart className="size-3 fill-berry-400 text-berry-400" />
                      {f.likes_count ?? 0}
                    </span>
                    <span className="text-[11px] font-extrabold text-honey-600 tabular sm:text-xs">
                      {formatIDR(f.price, lang)}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ==================================================================
 * Banner promo
 *
 * PENTING: kode diskon di referensi ("COFFEE20") tidak boleh
 * dikarang — kalau tidak ada, pembeli akan pakai kode yang salah.
 * Yang ditampilkan hanya DATA NYATA dari settings:
 *   - `free_shipping_min` > 0  -> gratis ongkir (itu voucher asli)
 *   - selain itu                 -> batas pesanan
 * Kalau keduanya kosong, banner tidak dirender sama sekali.
 * ================================================================ */
export function PromoBanner({
  freeShippingMin,
  deadline,
}: {
  freeShippingMin: number;
  deadline?: string | null;
}) {
  const { t, lang } = useI18n();

  const hasFreeShip = freeShippingMin > 0;
  if (!hasFreeShip && !deadline) return null;

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] bg-cocoa-900 p-5 shadow-lg shadow-cocoa-900/15">
      <div className="pointer-events-none absolute -right-6 -bottom-6 size-40 rounded-full bg-honey-500/15 blur-2xl" />
      <div className="relative max-w-[65%]">
        {hasFreeShip ? (
          <>
            <h3 className="font-display text-lg leading-tight font-extrabold text-cream-50">
              {t.home.promoFreeShip}
            </h3>
            <p className="mt-1 text-xs text-cream-200/75">
              {t.home.promoFreeShipDesc.replace(
                "{min}",
                formatIDR(freeShippingMin, lang)
              )}
            </p>
          </>
        ) : (
          <>
            <h3 className="font-display text-lg leading-tight font-extrabold text-cream-50">
              {t.home.promoDeadline}
            </h3>
            <p className="mt-1 text-xs text-cream-200/75">{deadline}</p>
          </>
        )}

        <Link
          href="/order"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-cream-50 px-4 py-2 text-xs font-bold text-cocoa-900 transition hover:bg-honey-300"
        >
          {hasFreeShip ? (
            <Truck className="size-3.5" />
          ) : (
            <Timer className="size-3.5" />
          )}
          {t.home.promoUseCode}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ==================================================================
 * Terlaris — baris: foto | nama | harga | tombol +
 *
 * Hanya dirender kalau ada rasa yang benar-benar sudah terjual. Kalau
 * belum ada satu pun penjualan, section ini disembunyikan — bukan
 * menampilkan lima baris "0 terjual" yang tidak berguna.
 * ================================================================ */
export function BestSellingList({
  flavors,
  soldCounts = {},
}: {
  flavors: Flavor[];
  soldCounts?: Record<number, number>;
}) {
  const { t, lang } = useI18n();

  // Filter lagi di sini supaya aman dipanggil dari mana saja.
  const rows = flavors.filter((f) => (soldCounts[f.id] ?? 0) > 0);
  if (rows.length === 0) return null;

  return (
    <section>
      <SectionHead
        title={t.home.bestSelling}
        href="/order"
        linkLabel={t.home.viewAll}
      />
      <ul className="space-y-2.5">
        {flavors.map((f) => {
          const name = lang === "en" ? f.name_en : f.name_id;
          return (
            <li key={f.id}>
              <Link
                href="/order"
                className="flex items-center gap-3 rounded-2xl border border-cocoa-200/70 bg-white p-2.5 transition hover:border-honey-400 hover:shadow-md"
              >
                <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-cream-100">
                  {f.image_url ? (
                    <Image
                      src={f.image_url}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-grain font-display text-lg font-bold text-white/40">
                      {name.charAt(0)}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-cocoa-900">
                    {name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-cocoa-400">
                    <Star className="size-3 fill-honey-400 text-honey-400" />
                    <span className="font-bold tabular">
                      {soldCounts[f.id] ?? 0}
                    </span>
                    <span>{t.home.sold}</span>
                  </span>
                </span>

                <span className="shrink-0 text-sm font-extrabold text-cocoa-900 tabular">
                  {formatIDR(f.price, lang)}
                </span>
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-honey-400 text-cocoa-900"
                >
                  <Plus className="size-4" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---------- judul section + link "Lihat semua" ---------- */
function SectionHead({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-extrabold text-cocoa-900">{title}</h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-bold text-honey-600 transition hover:text-honey-500"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

/* ==================================================================
 * Counter "terjual" per rasa
 * ================================================================ */

/**
 * Ambil counter terjual dari RPC publik. Satu panggilan untuk seluruh
 * halaman — semua section yang butuh angka ini menerima hasil yang sama.
 * Kalau gagal, angka dianggap 0 (kotak selalu tampil, tidak error).
 */
function useSoldCounts() {
  const [counts, setCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("public_flavor_sold_counts");
        if (cancelled || !Array.isArray(data)) return;
        const m: Record<number, number> = {};
        for (const row of data as Array<{ flavor_id: number; qty: number }>) {
          m[row.flavor_id] = row.qty;
        }
        setCounts(m);
      } catch {
        /* kotak kosong, bukan error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return counts;
}

/* ==================================================================
 * Komposisi seluruh isi beranda
 * ================================================================ */
export function AppHome({
  categories,
  heroImages,
  userName,
  freeShippingMin,
  deadline,
  ctaSlot,
}: {
  categories: Category[];
  heroImages: string[];
  userName?: string | null;
  freeShippingMin: number;
  deadline?: string | null;
  ctaSlot: React.ReactNode;
}) {
  const soldCounts = useSoldCounts();

  const allFlavors = useMemo(
    () => categories.flatMap((c) => c.flavors ?? []),
    [categories]
  );

  // "Populer" = paling banyak disukai. Angka like itu nyata, jadi urut
  // berdasarkan-nya; tidak ada angka rekaan seperti rating bintang.
  const popular = useMemo(() => {
    const sorted = [...allFlavors].sort((a, b) => {
      const sa = soldCounts[a.id] ?? 0;
      const sb = soldCounts[b.id] ?? 0;
      if (sa !== sb) return sb - sa;
      return (b.likes_count ?? 0) - (a.likes_count ?? 0);
    });
    return sorted.slice(0, 6);
  }, [allFlavors, soldCounts]);

  // "Terlaris" = benar-benar yang sudah terjual. Kalau belum ada satu
  // pun, list-nya kosong dan section-nya disembunyikan oleh komponen.
  const bestSelling = useMemo(() => {
    return allFlavors
      .filter((f) => (soldCounts[f.id] ?? 0) > 0)
      .sort((a, b) => (soldCounts[b.id] ?? 0) - (soldCounts[a.id] ?? 0))
      .slice(0, 5);
  }, [allFlavors, soldCounts]);

  return (
    <div className="space-y-6">
      <HomeGreeting userName={userName} />

      <HeroBanner images={heroImages} ctaSlot={ctaSlot} />

      <CategoryRow categories={categories} />

      <PopularGrid flavors={popular} />

      <PromoBanner freeShippingMin={freeShippingMin} deadline={deadline} />

      <BestSellingList flavors={bestSelling} soldCounts={soldCounts} />
    </div>
  );
}