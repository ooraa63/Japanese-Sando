"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Star, Trash2 } from "lucide-react";
import {
  deleteAdminReviewAction,
  listAdminReviewsAction,
  setReviewVisibilityAction,
} from "@/app/admin/actions";
import { reviewPhotoUrl } from "@/lib/reviews";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminReview } from "@/lib/types";

/**
 * Kelola ulasan pembeli (migration-58).
 *
 * Steven 15-10-2026: "untuk admin buat bisa mengatur ulasan itu, jadi kalau ada
 * orang yang asal memberi ulasan bisa kita delete atau gimana gitu lah".
 *
 * Dua aksi, bukan satu, dan itu pilihan yang disengaja:
 *   - Sembunyikan: `is_visible = false`, bisa dibalik. Ini aksi PERTAMA KALI
 *     karena ada ulasan yang review-nya tidak cocok, tapi ulasannya jujur.
 *   - Hapus permanen: baris + foto ikut hilang, tidak bisa dikembalikan.
 *
 * Kolom `is_visible` sudah ada sejak migration-21 tapi tidak pernah dipakai;
 * halaman ini yang pertama memakainya.
 */
export function ReviewsClient({
  initialReviews,
  initialCounts,
}: {
  initialReviews: AdminReview[];
  initialCounts: { total: number; visible: number; hidden: number };
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [reviews, setReviews] = useState<AdminReview[]>(initialReviews);
  const [counts, setCounts] = useState(initialCounts);
  const [onlyHidden, setOnlyHidden] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removing, setRemoving] = useState<AdminReview | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listAdminReviewsAction();
      if (res.ok && res.data) {
        setReviews(res.data.reviews);
        setCounts({
          total: res.data.total_count,
          visible: res.data.visible_count,
          hidden: res.data.hidden_count,
        });
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(r: AdminReview) {
    setBusyId(r.id);
    const next = !r.is_visible;
    const res = await setReviewVisibilityAction(r.id, next);
    setBusyId(null);
    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    toast.success(next ? t.admin.reviews.showDone : t.admin.reviews.hideDone);
    load();
  }

  async function remove() {
    if (!removing) return;
    setSaving(true);
    const res = await deleteAdminReviewAction(removing.id);
    setSaving(false);
    setRemoving(null);
    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    toast.success(t.admin.reviews.deleteDone);
    load();
  }

  const tampil = onlyHidden ? reviews.filter((r) => !r.is_visible) : reviews;

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-cocoa-900">
            {t.admin.reviews.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-cocoa-500">
            {t.admin.reviews.subtitle}
          </p>
          <p className="mt-1 text-xs font-bold text-cocoa-400">
            {t.admin.reviews.summary
              .replace("{visible}", String(counts.visible))
              .replace("{hidden}", String(counts.hidden))
              .replace("{total}", String(counts.total))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-cocoa-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setOnlyHidden(false)}
              aria-pressed={!onlyHidden}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                !onlyHidden ? "bg-cocoa-800 text-cream-50" : "text-cocoa-600"
              }`}
            >
              {t.admin.reviews.all}
            </button>
            <button
              type="button"
              onClick={() => setOnlyHidden(true)}
              aria-pressed={onlyHidden}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                onlyHidden ? "bg-cocoa-800 text-cream-50" : "text-cocoa-600"
              }`}
            >
              {t.admin.reviews.onlyHidden}
            </button>
          </div>
          <Link href="/#reviews" className="btn-ghost !text-[13px]">
            {t.admin.reviews.viewOnSite}
          </Link>
        </div>
      </header>

      {pending ? (
        <p className="flex items-center gap-2 text-xs text-cocoa-400">
          <Loader2 className="size-3.5 animate-spin" />
          {t.common.loading}
        </p>
      ) : null}

      {tampil.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-10 text-center text-sm text-cocoa-500">
          {onlyHidden ? t.admin.reviews.empty : t.admin.reviews.empty}
        </p>
      ) : (
        <ul className="space-y-3">
          {tampil.map((r) => {
            const foto = reviewPhotoUrl(r.photo_path);
            const sedang = busyId === r.id;
            return (
              <li
                key={r.id}
                data-review-row={r.id}
                className={`rounded-2xl border bg-white p-4 transition ${
                  r.is_visible
                    ? "border-cocoa-200"
                    : "border-dashed border-cocoa-300 bg-cocoa-50/60"
                }`}
              >
                <div className="flex gap-3">
                  {foto ? (
                    <a
                      href={foto}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-cocoa-200"
                    >
                      <Image
                        src={foto}
                        alt={t.admin.reviews.withPhoto}
                        fill
                        sizes="80px"
                        className="object-cover"
                        unoptimized
                      />
                    </a>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
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
                      <span className="truncate text-sm font-bold text-cocoa-800">
                        {r.customer_name}
                      </span>
                      <span className="font-mono text-[11px] text-cocoa-400">
                        {r.order_code}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          r.is_visible
                            ? "bg-matcha-100 text-matcha-700"
                            : "bg-berry-500/10 text-berry-600"
                        }`}
                      >
                        {r.is_visible
                          ? t.admin.reviews.shown
                          : t.admin.reviews.hidden}
                      </span>
                      <span className="text-[10px] text-cocoa-400">
                        {r.photo_path
                          ? t.admin.reviews.withPhoto
                          : t.admin.reviews.noPhoto}
                      </span>
                    </div>

                    <p className="mt-1.5 text-sm text-cocoa-700">{r.comment}</p>

                    <p className="mt-1.5 text-[11px] text-cocoa-400">
                      {formatDateTime(r.created_at, lang)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => void toggle(r)}
                      disabled={sedang}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cocoa-200 px-2.5 py-1.5 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-50"
                    >
                      {sedang ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : r.is_visible ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                      {r.is_visible
                        ? t.admin.reviews.hide
                        : t.admin.reviews.show}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoving(r)}
                      disabled={sedang}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-berry-500/30 px-2.5 py-1.5 text-xs font-bold text-berry-500 transition hover:bg-berry-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" />
                      {t.admin.reviews.delete}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        request={
          removing
            ? {
                title: t.admin.reviews.delete,
                body: t.admin.reviews.deleteConfirm,
              }
            : null
        }
        busy={saving}
        confirmLabel={t.admin.reviews.delete}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      >
        {removing ? (
          <div className="mt-3 rounded-xl bg-cocoa-50 p-3">
            <p className="text-sm font-bold text-cocoa-700">
              {removing.customer_name} · {removing.rating}/5
            </p>
            <p className="mt-1 text-xs text-cocoa-500">{removing.comment}</p>
          </div>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}