"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { parseReviewSort } from "@/lib/reviews";
import type { ReviewSort } from "@/lib/types";

/**
 * Tab pengurutan ulasan (migration-58).
 *
 * Kenapa pakai `router.push` dan bukan `useState`: ReviewsSection dirender
 * SERVER-SIDE supaya tetap SEO-friendly. Kalau urutan disimpan di state,
 * daftar hanya berubah di browser dan tautannya tidak bisa dibagikan.
 * Dengan `?sort=` di URL, urutannya jadi bagian dari halaman.
 */
export function ReviewSortTabs({ current }: { current: ReviewSort }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const opsi: Array<{ value: ReviewSort; label: string; icon: boolean }> = [
    { value: "newest", label: t.reviews.sort.newest, icon: false },
    { value: "highest", label: t.reviews.sort.highest, icon: true },
    { value: "lowest", label: t.reviews.sort.lowest, icon: false },
    { value: "photo", label: t.reviews.sort.photo, icon: false },
  ];

  function pilih(nilai: ReviewSort) {
    const sp = new URLSearchParams(params.toString());
    if (nilai === "newest") sp.delete("sort");
    else sp.set("sort", nilai);
    const qs = sp.toString();
    // `scroll: false` supaya tab yang ditekan tidak membuat halaman melompat ke atas;
    // section ulasan tetap di posisi yang sama.
    router.push(qs ? `/?${qs}#reviews` : "/#reviews", { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-bold text-cocoa-500">
        {t.reviews.sort.label}
      </span>
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="group"
        aria-label={t.reviews.sort.label}
      >
        {opsi.map((o) => {
          const aktif = parseReviewSort(current) === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pilih(o.value)}
              aria-pressed={aktif}
              data-review-sort={o.value}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                aktif
                  ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                  : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-400"
              }`}
            >
              {o.icon ? <Star className="size-3 fill-honey-400 text-honey-500" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}