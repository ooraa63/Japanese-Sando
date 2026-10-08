"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { PriceTag } from "./PriceTag";

/**
 * Baris produk unggulan ala UIUX 1: beberapa kartu berjajar, tiap kartu
 * punya nomor kecil di atas, foto, nama, dan harga. Tampilan saja —
 * pembelian tetap lewat halaman pre-order.
 */
export function FeaturedStrip({
  flavors,
}: {
  flavors: Flavor[];
}) {
  const { t, lang } = useI18n();
  if (flavors.length === 0) return null;

  return (
    <section className="bg-cream-100">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="text-center">
          <p className="text-xs font-bold tracking-[0.25em] text-cocoa-500 uppercase">
            {t.home.featuredEyebrow}
          </p>
          <h2 className="mt-3 font-display text-2xl leading-tight font-bold text-balance text-cocoa-900 sm:text-3xl">
            {t.home.featuredTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-cocoa-600">
            {t.home.featuredDesc}
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          {flavors.map((f, i) => {
            const name = lang === "en" ? f.name_en : f.name_id;
            return (
              <li key={f.id} className="group text-center">
                {/* Nomor urut — detail kecil dari referensi */}
                <span className="inline-grid size-7 place-items-center rounded-full bg-cocoa-200 text-[11px] font-bold text-cocoa-700 tabular">
                  {i + 1}
                </span>

                <Link
                  href="#menu"
                  className="mt-3 block focus-visible:rounded-2xl"
                  aria-label={name}
                >
                  <div className="relative mx-auto aspect-square w-full max-w-[180px]">
                    {f.image_url ? (
                      <Image
                        src={f.image_url}
                        alt={name}
                        fill
                        sizes="(max-width: 640px) 45vw, 200px"
                        className="object-contain drop-shadow-lg transition duration-300 group-hover:-translate-y-1 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center rounded-full bg-cream-200 font-display text-4xl font-bold text-cocoa-300">
                        {name.charAt(0)}
                      </div>
                    )}
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm font-bold text-cocoa-900">
                    {name}
                  </p>
                  <div className="mt-1.5 flex justify-center">
                    <PriceTag
                      price={f.price}
                      comparePrice={f.compare_price}
                      lang={lang}
                      size="md"
                      align="center"
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-10 text-center">
          <Link
            href="#menu"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-cocoa-700 transition hover:text-cocoa-900"
          >
            {t.home.viewAll}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}