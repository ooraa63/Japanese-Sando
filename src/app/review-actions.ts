"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { OrderReview, ReviewListResult } from "@/lib/types";

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
  ];
  return known.includes(error.trim()) ? error.trim() : "generic";
}

/**
 * Kirim review untuk pesanan yang sudah delivered. Idempoten: kalau order
 * sudah pernah di-review, return error 'already_reviewed'.
 */
export async function submitReviewAction(
  orderCode: string,
  rating: number,
  comment: string
): Promise<ReviewActionResult<OrderReview>> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "invalid_rating" };
  }
  const trimmedComment = comment.trim();
  if (!trimmedComment) return { ok: false, error: "empty_comment" };
  if (trimmedComment.length > 1000) {
    return { ok: false, error: "comment_too_long" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_review", {
    p_order_code: orderCode.trim(),
    p_rating: rating,
    p_comment: trimmedComment,
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

export async function listReviewsAction(): Promise<ReviewListResult> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("list_reviews", {
    p_limit: 12,
    p_offset: 0,
  });
  return (data as ReviewListResult) ?? { avg_rating: 0, total_count: 0, reviews: [] };
}