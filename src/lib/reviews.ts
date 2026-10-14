import { REVIEW_SORTS, type ReviewSort } from "@/lib/types";

/**
 * Baca `?sort=` dari query string homepage jadi nilai yang aman.
 *
 * Nilai diambil langsung dari URL, jadi HARUS divalidasi di sini sebelum
 * dipakai. `list_reviews` juga memvalidasi ulang di sisi database (nilai yang
 * tidak dikenal jatuh ke 'newest'), tapi cukup satu sumber kebenaran di
 * frontend supaya tab yang aktif dan isi daftar tidak pernah berbeda.
 */
export function parseReviewSort(value: unknown): ReviewSort {
  if (typeof value !== "string") return "newest";
  const v = value.trim().toLowerCase();
  return (REVIEW_SORTS as readonly string[]).includes(v) ? (v as ReviewSort) : "newest";
}

/** Bucket storage foto ulasan (migration-58). Publik — foto ditampilkan di homepage. */
export const REVIEW_PHOTO_BUCKET = "review-photos";

/**
 * Bucket + path -> URL publik.
 *
 * Disimpan di database sebagai PATH, bukan URL, supaya bucket bisa diganti
 * tanpa migrate data. Bucket-nya `public: true`, jadi tidak perlu signed URL
 * yang harus di-refresh.
 */
export function reviewPhotoUrl(photoPath: string | null | undefined): string | null {
  if (!photoPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const encoded = photoPath
    .split("/")
    .map((bagian) => encodeURIComponent(bagian))
    .join("/");
  return `${base}/storage/v1/object/public/${REVIEW_PHOTO_BUCKET}/${encoded}`;
}