import Image from "next/image";
import { Star } from "lucide-react";
import { listReviewsAction } from "@/app/review-actions";
import { formatDateTime } from "@/lib/utils";
import { reviewPhotoUrl } from "@/lib/reviews";
import type { Language, ReviewSort } from "@/lib/types";
import { ReviewSortTabs } from "@/components/customer/ReviewSortTabs";

/**
 * Section publik yang menampilkan ringkasan + daftar ulasan dari pembeli.
 * Render server-side (no client JS) supaya SEO-friendly.
 *
 * Migration-58:
 * - urutan ulasan dari `sort` (query string homepage), lewat tab
 *   `ReviewSortTabs` yang melakukan navigasi ke `?sort=...`;
 * - ulasan boleh punya satu foto. Datanya `photo_path` (path di bucket
 *   publik), URL-nya dibuat di sini saat render.
 *
 * Foto ditampilkan sebagai tautan ke ukuran penuh, bukan lightbox. Alasannya
 * lightbox butuh client component + state + handler keyboard; untuk satu foto
 * per ulasan, tautan ke file aslinya cukup dan tetap jalan tanpa JavaScript.
 * Kalau nanti lightbox benar-benar diperlukan, itu perubahan kecil di satu
 * tempat.
 */
export async function ReviewsSection({
  lang,
  sort,
}: {
  lang: Language;
  sort: ReviewSort;
}) {
  const data = await listReviewsAction(sort);
  const isEmpty = data.total_count === 0;

  return (
    // `id="reviews"` sengaja TIDAK di sini: section pembungkusnya di
    // `src/app/page.tsx` yang punya id itu, supaya tidak ada dua elemen dengan
    // id yang sama di satu halaman.
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-display text-2xl font-bold text-cocoa-900 sm:text-3xl">
          {lang === "en" ? "What people say" : "Kata Mereka"}
        </h2>
        <p className="mt-2 text-sm text-cocoa-500">
          {lang === "en"
            ? "Real reviews from buyers after their order was delivered."
            : "Ulasan asli dari pembeli setelah pesanan diterima."}
        </p>
      </div>

      {isEmpty ? (
        <p className="mx-auto max-w-md rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-8 text-center text-sm text-cocoa-500">
          {lang === "en"
            ? "No reviews yet. Order now and be the first!"
            : "Belum ada ulasan. Pesan dulu, nanti jadi yang pertama!"}
        </p>
      ) : (
        <>
          {/* Aggregate */}
          <div className="mx-auto flex max-w-md items-center justify-center gap-4 rounded-2xl border border-cocoa-200 bg-cream-50 px-6 py-4">
            <div className="text-center">
              <p className="font-display text-4xl font-extrabold text-cocoa-900">
                {data.avg_rating.toFixed(1)}
              </p>
              <div className="mt-1 flex justify-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`size-4 ${
                      n <= Math.round(data.avg_rating)
                        ? "fill-matcha-500 text-matcha-500"
                        : "text-cocoa-200"
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="h-12 w-px bg-cocoa-200" />
            <div>
              <p className="text-2xl font-bold text-cocoa-900">
                {data.total_count}
              </p>
              <p className="text-xs uppercase tracking-wider text-cocoa-500">
                {lang === "en" ? "reviews" : "ulasan"}
              </p>
            </div>
          </div>

          {/* Migration-58: tab pengurutan */}
          <ReviewSortTabs current={sort} />

          {/* Reviews grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.reviews.slice(0, 6).map((r) => {
              const foto = reviewPhotoUrl(r.photo_path);
              return (
                <article
                  key={r.id}
                  className="flex flex-col gap-2 rounded-2xl border border-cocoa-200 bg-cream-50 p-5"
                >
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`size-3.5 ${
                          n <= r.rating
                            ? "fill-honey-400 text-honey-500"
                            : "text-cocoa-200"
                        }`}
                      />
                    ))}
                  </div>

                  {/* Foto opsional: rating + komentar tetap terbaca walau
                      tidak ada foto sama sekali. */}
                  {foto ? (
                    <a
                      href={foto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block overflow-hidden rounded-xl border border-cocoa-200"
                    >
                      <div className="relative aspect-[4/3] w-full bg-cocoa-50">
                        <Image
                          src={foto}
                          alt={
                            lang === "en"
                              ? `Photo from ${r.customer_name}`
                              : `Foto dari ${r.customer_name}`
                          }
                          fill
                          sizes="(max-width: 640px) 100vw, 340px"
                          className="object-cover transition group-hover:opacity-90"
                          unoptimized
                        />
                      </div>
                    </a>
                  ) : null}

                  <p className="line-clamp-4 text-sm text-cocoa-700">
                    &ldquo;{r.comment}&rdquo;
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-cocoa-500">
                    <span className="truncate text-xs font-bold">
                      {r.customer_name}
                    </span>
                    <span className="shrink-0 text-[10px]">
                      {formatDateTime(r.created_at, lang)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}