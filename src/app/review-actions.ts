"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_PHOTO_MAX, parseReviewSort } from "@/lib/reviews";
import type {
  OrderReview,
  ReviewListResult,
  ReviewSort,
} from "@/lib/types";

export interface ReviewActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

function humanize(error: string | undefined): string {
  if (!error) return "generic";
  const known = [
    "order_not_found",
    "invalid_rating",
    "empty_comment",
    "comment_too_long",
    "order_not_delivered",
    "already_reviewed",
    "invalid_photo_path",
    "too_many_photos",
  ];
  return known.includes(error.trim()) ? error.trim() : "generic";
}

/**
 * Kirim review untuk pesanan yang sudah delivered. Idempoten: kalau order
 * sudah pernah di-review, return error 'already_reviewed'.
 *
 * `photoPaths` opsional (migration-58), maksimal 3 path di bucket
 * `review-photos` pada folder `reviews/`. Aturan yang sama diverifikasi ulang di
 * dalam `submit_review`, jadi pemeriksaan di sini cuma untuk umpan balik yang
 * lebih cepat, bukan penjaga.
 */
export async function submitReviewAction(
  orderCode: string,
  rating: number,
  comment: string,
  photoPaths: string[] = []
): Promise<ReviewActionResult<OrderReview>> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "invalid_rating" };
  }
  const trimmedComment = comment.trim();
  if (!trimmedComment) return { ok: false, error: "empty_comment" };
  if (trimmedComment.length > 1000) {
    return { ok: false, error: "comment_too_long" };
  }
  if (photoPaths.length > REVIEW_PHOTO_MAX) {
    return { ok: false, error: "too_many_photos" };
  }
  // Samakan dengan validasi di submit_review supaya error yang muncul sama
  // dengan yang akan ditolak database.
  if (photoPaths.some((p) => !p.startsWith("reviews/"))) {
    return { ok: false, error: "invalid_photo_path" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_order_code: orderCode.trim(),
    p_rating: rating,
    p_comment: trimmedComment,
    p_photo_paths: photoPaths,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  // Refresh homepage supaya review baru langsung muncul.
  revalidatePath("/");
  return { ok: true, data: data as OrderReview };
}

export async function hasReviewAction(orderCode: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("has_review", {
    p_order_code: orderCode.trim(),
  });
  return Boolean(data);
}

/**
 * Daftar ulasan publik.
 *
 * `sort` datang dari query string homepage, jadi divalidasi di sini lewat
 * `parseReviewSort`. Nilai yang tidak dikenal jadi 'newest', bukan error --
 * URL yang diketik tangan tidak boleh membuat halaman kosong.
 */
export async function listReviewsAction(
  sort: ReviewSort = "newest"
): Promise<ReviewListResult> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_reviews", {
    p_limit: 12,
    p_offset: 0,
    p_sort: parseReviewSort(sort),
  });
  return (
    (data as ReviewListResult) ?? { avg_rating: 0, total_count: 0, reviews: [] }
  );
}