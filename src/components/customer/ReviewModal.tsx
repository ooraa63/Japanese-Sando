"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Star, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Modal } from "@/components/ui/Modal";
import { submitReviewAction } from "@/app/review-actions";

/**
 * Pop-up review yang muncul ketika pembeli mengecek order berstatus
 * "delivered" dan belum pernah review. Setelah submit, modal menutup
 * dengan pesan terima kasih.
 */
export function ReviewModal({
  orderCode,
  initialOpen = true,
  onClose,
}: {
  orderCode: string;
  initialOpen?: boolean;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setOpen(initialOpen);
  }, [initialOpen]);

  function close() {
    setOpen(false);
    onClose?.();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (rating < 1) {
      setError(t.reviews.ratingRequired);
      return;
    }
    if (!comment.trim()) {
      setError(t.reviews.commentRequired);
      return;
    }
    setSubmitting(true);
    const res = await submitReviewAction(orderCode, rating, comment);
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(
        res.error === "already_reviewed"
          ? t.reviews.alreadyReviewed
          : res.error === "order_not_delivered"
            ? t.reviews.notDelivered
            : t.reviews.errorGeneric
      );
    }
  }

  return (
    <Modal open={open} onClose={close} title={t.reviews.writeYour}>
      <div className="relative max-h-[90vh] overflow-y-auto p-6 sm:p-8">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100"
        >
          <X className="size-5" />
        </button>

        {done ? (
          <div className="text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-matcha-100 text-matcha-700">
              <CheckCircle2 className="size-7" />
            </span>
            <h2 className="mt-4 font-display text-xl font-bold text-cocoa-900">
              {t.reviews.success}
            </h2>
            <p className="mt-2 text-sm text-cocoa-500">
              {t.reviews.successDesc}
            </p>
            <button
              type="button"
              onClick={close}
              className="btn-primary mt-6 w-full"
            >
              OK
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-center">
              <h2 className="font-display text-xl font-bold text-cocoa-900">
                {t.reviews.writeYour}
              </h2>
              <p className="mt-1 text-xs font-mono tracking-wider text-cocoa-400">
                {orderCode}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-center text-sm font-bold text-cocoa-700">
                {t.reviews.ratingLabel}
              </p>
              <div className="flex justify-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    aria-label={`${n} star${n > 1 ? "s" : ""}`}
                    className="rounded-md p-1 transition hover:scale-110"
                  >
                    <Star
                      className={`size-8 ${
                        n <= rating
                          ? "fill-honey-400 text-honey-500"
                          : "text-cocoa-200"
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-cocoa-700">
                {t.reviews.commentLabel}
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder={t.reviews.commentPlaceholder}
                className="w-full resize-none rounded-lg border border-cocoa-200 bg-cream-100 px-3 py-2 text-sm focus:border-matcha-600 focus:outline-none"
              />
              <span className="mt-1 block text-right text-[10px] text-cocoa-400">
                {comment.length}/1000
              </span>
            </label>

            {error ? (
              <p className="rounded-lg bg-berry-500/10 p-2.5 text-center text-xs font-semibold text-berry-600">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                className="flex-1 rounded-lg border border-cocoa-200 px-4 py-2 text-sm font-semibold text-cocoa-700 hover:bg-cocoa-100"
              >
                {t.reviews.skip}
              </button>
              <button
                type="submit"
                disabled={submitting || rating < 1 || !comment.trim()}
                className="btn-primary flex-1"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t.reviews.submitting}
                  </>
                ) : (
                  t.reviews.submit
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}