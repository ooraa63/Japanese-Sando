"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Category } from "@/lib/types";
import { useI18n } from "@/lib/i18n";

/**
 * Panel kategori di beranda — mengikuti baris "Tiga Kategori" pada
 * UIUX 1: teks + tombol di kiri, foto produk di tengah, teks + tombol
 * di kanan. Warna tetap coklat, yang diambil hanya layout-nya.
 */
export function CategoryBand({
  categories,
  heroImage,
}: {
  categories: Category[];
  /** Foto untuk panel tengah (biasanya foto produk unggulan). */
  heroImage?: string | null;
}) {
  const { t, lang } = useI18n();
  if (categories.length === 0) return null;

  const totalFlavors = categories.reduce(
    (sum, c) => sum + (c.flavors?.length ?? 0),
    0
  );

  return (
    <section className="bg-cream-100">
      <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-10 lg:py-16">
        {/* ---------- Kiri: kategori ---------- */}
        <div className="text-center lg:text-left">
          <h2 className="font-display text-2xl leading-tight font-bold text-cocoa-900 sm:text-3xl">
            {t.home.categoriesTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-cocoa-600 lg:mx-0">
            {t.home.categoriesDesc}
          </p>
          <p className="mt-2 text-xs font-bold text-cocoa-500 tabular">
            {categories.length} · {totalFlavors} {t.menu.flavors}
          </p>
          <Link
            href="#menu"
            className="btn-primary mt-5 !rounded-full !px-6 !py-2.5 text-sm"
          >
            {t.home.categoriesCta}
            <ArrowRight className="size-4" />
          </Link>
        </div>

        {/* ---------- Tengah: foto produk ---------- */}
        <div className="order-first lg:order-none">
          <div className="relative mx-auto aspect-square w-40 sm:w-52 lg:w-60">
            {heroImage ? (
              <Image
                src={heroImage}
                alt=""
                fill
                sizes="(max-width: 1024px) 208px, 240px"
                className="object-contain drop-shadow-xl"
              />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-full bg-cream-200 font-display text-5xl font-bold text-cocoa-400">
                日
              </div>
            )}
          </div>
        </div>

        {/* ---------- Kanan: cara pesan ---------- */}
        <div className="text-center lg:text-left">
          <h2 className="font-display text-2xl leading-tight font-bold text-cocoa-900 sm:text-3xl">
            {t.home.howTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-cocoa-600 lg:mx-0">
            {t.home.howDesc}
          </p>
          <p className="mt-2 text-xs font-bold text-cocoa-500">
            {lang === "en" ? "No account needed" : "Tanpa perlu akun"}
          </p>
          <Link
            href="/order"
            className="btn-primary mt-5 !rounded-full !px-6 !py-2.5 text-sm"
          >
            {t.home.howCta}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}