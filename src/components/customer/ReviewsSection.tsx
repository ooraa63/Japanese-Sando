import { Star } from "lucide-react";
import { listReviewsAction } from "@/app/review-actions";
import { formatDateTime } from "@/lib/utils";
import type { Language } from "@/lib/types";

/**
 * Section publik yang menampilkan ringkasan + daftar review dari pembeli.
 * Render server-side (no client JS) supaya SEO-friendly.
 */
export async function ReviewsSection({ lang }: { lang: Language }) {
  const data = await listReviewsAction();
  const isEmpty = data.total_count === 0;

  return (
    <div className="space-y-8">
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

          {/* Reviews grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.reviews.slice(0, 6).map((r) => (
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
                <p className="line-clamp-4 text-sm text-cocoa-700">
                  &ldquo;{r.comment}&rdquo;
                </p>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-cocoa-500">
                  <span className="text-xs font-bold">{r.customer_name}</span>
                  <span className="text-[10px]">
                    {formatDateTime(r.created_at, lang)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}