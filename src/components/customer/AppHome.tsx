"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Bundle, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { MAX_HOME_PICKS } from "@/lib/utils";
import { useSoldCounts } from "@/lib/useSoldCounts";
import { BundleShowcase } from "@/components/customer/BundleShowcase";
import { FlavorCard } from "@/components/customer/FlavorCard";

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
 * Produk populer — deretan kartu yang HANYA untuk dilihat.
 *
 * Permintaan Steven (10-10-2026): kartu di section ini tidak bisa
 * diketuk sama sekali. Bukan link ke /order, dan hatinya bukan tombol.
 * Menyonya di sini berarti heart-nya berubah jadi ikon biasa.
 * Tombolnya ada di section "Menu" di bawahnya.
 * ================================================================ */
export function PopularGrid({
  flavors,
  soldCounts = {},
}: {
  flavors: Flavor[];
  soldCounts?: Record<number, number>;
}) {
  const { t } = useI18n();

  if (flavors.length === 0) {
    return <p className="text-sm text-cocoa-400">{t.home.emptyPopular}</p>;
  }

  return (
    <section>
      {/* Tanpa link "Lihat Semua" (permintaan Steven, 10-10-2026): semua
          produk sudah tampil lengkap di section "Menu" tepat di bawahnya,
          jadi link itu cuma menambah ruang kosong. */}
      <SectionHead title={t.home.popular} />
      {/* Jarak antar kartu disamakan dengan section "Menu" (gap-2.5 / sm:gap-3)
          supaya dua baris kartu itu terlihat satu kesatuan — beda 1px di HP
          tapi 4px di PC, dan efeknya terlihat di layar lebar. */}
      <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {flavors.map((f) => (
          <li key={f.id} className="flex">
            <PopularCard flavor={f} soldCount={soldCounts[f.id] ?? 0} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Kartu read-only di section "Populer".
 *
 * Sengaja memakai komponen yang SAMA dengan kartu di section "Menu"
 * (`FlavorCard` gaya `dense`) supaya dua baris itu terlihat_IDENTIK —
 * bedanya hanya satu hal: di sini `readOnlySocial`, jadi hatinya cuma ikon
 * penanda dan tidak bisa ditekan. Section "Menu" di bawahnya yang menjadi
 * tempat Likes Like.
 */
function PopularCard({
  flavor,
  soldCount,
}: {
  flavor: Flavor;
  soldCount: number;
}) {
  return (
    <FlavorCard
      flavor={flavor}
      dense
      showSocial
      readOnlySocial
      showBadge={false}
      soldCount={soldCount}
      /* Angka terjual SELALU tampil, termasuk "0 terjual" (permintaan
         Steven, 10-10-2026). Sebelumnya disembunyikan saat 0 — itu membuat
         kartu tampak tidak lengkap dan tinggi barisnya tidak rata. */
      showSold
    />
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
 * Komposisi seluruh isi beranda
 * ================================================================ */

/**
 * Urutkan produk mengikuti pilihan penjual.
 *
 * Id yang tidak ditemukan (produknya sudah dihapus atau dinonaktifkan)
 * diam-diam dilewati supaya section tidak pernah menampilkan rongsokan.
 * Order admin dipakai apa adanya — itu yang dia susun lewat dashboard.
 */
function pickByIds(flavors: Flavor[], ids: number[] | null | undefined): Flavor[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const byId = new Map(flavors.map((f) => [f.id, f]));
  const out: Flavor[] = [];
  for (const raw of ids) {
    const f = byId.get(Number(raw));
    if (f) out.push(f);
    if (out.length >= MAX_HOME_PICKS) break;
  }
  return out;
}

export function AppHome({
  categories,
  bundles = [],
  heroImages,
  userName,
  popularIds,
  ctaSlot,
}: {
  categories: Category[];
  /** Bundle / paket hemat — ditampilkan di atas "Populer". */
  bundles?: Bundle[];
  heroImages: string[];
  userName?: string | null;
  /** Pilihan penjual untuk "Populer" (maks 3). Kosong = pakai otomatis. */
  popularIds?: number[];
  ctaSlot: React.ReactNode;
}) {
  const soldCounts = useSoldCounts();

  const allFlavors = useMemo(
    () => categories.flatMap((c) => c.flavors ?? []),
    [categories]
  );

  // Pilihan penjual menang kalau ada. Kalau tidak ada pilihan, pakai
  // urutan otomatis (like + terjual) — jadi website tetap utuh untuk
  // penjual yang belum pernah ke tab Beranda.
  const popularPicked = useMemo(
    () => pickByIds(allFlavors, popularIds),
    [allFlavors, popularIds]
  );
  const autoPopular = useMemo(() => {
    const sorted = [...allFlavors].sort((a, b) => {
      const sa = soldCounts[a.id] ?? 0;
      const sb = soldCounts[b.id] ?? 0;
      if (sa !== sb) return sb - sa;
      return (b.likes_count ?? 0) - (a.likes_count ?? 0);
    });
    return sorted.slice(0, MAX_HOME_PICKS);
  }, [allFlavors, soldCounts]);
  const popular = popularPicked.length > 0 ? popularPicked : autoPopular;

  // Urutan beranda (permintaan Steven, 10-10-2026):
  //   sapaan -> hero -> paket hemat -> Populer -> (lanjut ke menu)
  // Section "Kategori" dan banner promo dihapus; menu langsung menyusul
  // section "Populer".
  return (
    <div className="space-y-6">
      <HomeGreeting userName={userName} />

      <HeroBanner images={heroImages} ctaSlot={ctaSlot} />

      <BundleShowcase bundles={bundles} />

      <PopularGrid flavors={popular} soldCounts={soldCounts} />
    </div>
  );
}
