"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { PriceTag } from "./PriceTag";

/**
 * Section "favorit pelanggan" ala UIUX 1: judul di tengah, kartu
 * produk bernomor, lalu titik carousel di bawah. Kalau rasa-nya lebih
 * dari 3, sisanya bisa diakses lewat titik-titiknya.
 */
export function BestSellers({ flavors }: { flavors: Flavor[] }) {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(0);

  if (flavors.length === 0) return null;

  const perPage = 3;
  const pages = Math.ceil(flavors.length / perPage);
  const shown = flavors.slice(page * perPage, page * perPage + perPage);

  return (
    <section className="bg-cream-100">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="text-center">
          <h2 className="font-display text-2xl leading-tight font-bold text-balance text-cocoa-900 sm:text-3xl">
            {t.home.bestTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-cocoa-600">
            {t.home.bestDesc}
          </p>
        </div>

        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
          {shown.map((f, i) => {
            const name = lang === "en" ? f.name_en : f.name_id;
            const number = page * perPage + i + 1;
            return (
              <li key={f.id}>
                <Link
                  href="#menu"
                  className="group flex h-full flex-col overflow-hidden rounded-2xl border border-cocoa-200/70 bg-white transition hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-cream-100">
                    {f.image_url ? (
                      <Image
                        src={f.image_url}
                        alt={name}
                        fill
                        sizes="(max-width: 640px) 90vw, 33vw"
                        className="object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-grain font-display text-5xl font-bold text-cocoa-300">
                        {name.charAt(0)}
                      </div>
                    )}
                    <span className="absolute left-3 top-3 inline-grid size-7 place-items-center rounded-full bg-cocoa-800/90 text-[11px] font-bold text-cream-50 tabular">
                      {number}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="font-display text-base leading-tight font-bold text-cocoa-900">
                      {name}
                    </h3>
                    <div className="mt-2">
                      <PriceTag
                        price={f.price}
                        comparePrice={f.compare_price}
                        lang={lang}
                        size="md"
                      />
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Titik carousel — hanya muncul kalau memang ada lebih dari 1 halaman */}
        {pages > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPage(i)}
                aria-label={`Halaman ${i + 1}`}
                aria-current={i === page}
                className={`size-2.5 rounded-full transition ${
                  i === page ? "w-7 bg-cocoa-800" : "bg-cocoa-300 hover:bg-cocoa-500"
                }`}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-8 text-center">
          <Link
            href="/order"
            className="btn-primary !rounded-full !px-6 !py-2.5 text-sm"
          >
            {t.menu.orderNow}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}