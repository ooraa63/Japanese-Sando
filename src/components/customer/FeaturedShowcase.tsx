import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { formatIDR } from "@/lib/utils";
import type { Language } from "@/lib/types";

interface FeaturedFlavor {
  id: number;
  name_id: string;
  name_en: string;
  desc_id: string;
  desc_en: string;
  image_url: string | null;
  price: number;
  slug: string;
}

/**
 * Strip showcase 3 rasa paling populer. Render server-side.
 * Pakai `aspect-[5/3]` di mobile & `aspect-[4/3]` di desktop supaya foto
 * sando tetap kebaca di HP tanpa crop berlebihan.
 */
export function FeaturedShowcase({
  flavors,
  lang,
  ctaLabel,
}: {
  flavors: FeaturedFlavor[];
  lang: Language;
  ctaLabel: string;
}) {
  const items = flavors.slice(0, 3);
  if (items.length === 0) return null;

  return (
    <section className="border-y border-cocoa-200/60 bg-cocoa-950 py-12 text-cream-50 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold tracking-[0.3em] text-honey-400 uppercase">
              {lang === "en" ? "Most loved" : "Paling dicari"}
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
              {lang === "en" ? "Best sellers this month" : "Paling laris bulan ini"}
            </h2>
          </div>
          <Link
            href="/order"
            className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cream-50/30 bg-cream-50/10 px-4 py-2 text-xs font-bold text-cream-50 transition hover:bg-cream-50/20"
          >
            {ctaLabel}
            <Star className="size-3.5 fill-honey-400 text-honey-400" />
          </Link>
        </div>

        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:pb-0">
          {items.map((f, i) => (
            <Link
              key={f.id}
              href="/order"
              className={`group relative shrink-0 snap-center overflow-hidden rounded-2xl border border-cream-50/10 bg-cream-50/5 transition hover:border-cream-50/30 hover:bg-cream-50/10 sm:shrink ${
                i === 0 ? "sm:col-span-2 sm:row-span-2" : ""
              }`}
            >
              <div
                className={`relative w-[260px] overflow-hidden sm:w-auto ${
                  i === 0 ? "aspect-[5/3] sm:aspect-[4/5]" : "aspect-[5/3] sm:aspect-[4/3]"
                }`}
              >
                {f.image_url ? (
                  <Image
                    src={f.image_url}
                    alt={lang === "en" ? f.name_en : f.name_id}
                    fill
                    sizes="(max-width: 768px) 80vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-cocoa-700 to-cocoa-900">
                    <span className="font-display text-7xl font-bold text-cream-50/15 select-none">
                      {(lang === "en" ? f.name_en : f.name_id).charAt(0)}
                    </span>
                  </div>
                )}
                <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-honey-400/95 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-cocoa-900 uppercase shadow">
                  #{i + 1}
                </span>
              </div>
              <div
                className={`flex flex-col gap-1 p-4 ${
                  i === 0 ? "sm:absolute sm:inset-x-0 sm:bottom-0 sm:bg-gradient-to-t sm:from-cocoa-950/95 sm:to-transparent sm:p-5" : ""
                }`}
              >
                <p className="font-display text-base font-bold sm:text-lg">
                  {lang === "en" ? f.name_en : f.name_id}
                </p>
                <p className="line-clamp-2 text-xs text-cream-300/85">
                  {lang === "en" ? f.desc_en : f.desc_id}
                </p>
                <p className="mt-1 font-mono text-sm font-extrabold text-honey-400 tabular-nums">
                  {formatIDR(f.price, lang)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}