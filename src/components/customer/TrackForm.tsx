"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Star, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatIDR } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrderStatusTimeline } from "@/components/customer/OrderStatusTimeline";
import { ReviewModal } from "@/components/customer/ReviewModal";

export function TrackForm({
  initialCode = "",
}: {
  initialCode?: string;
}) {
  const { t, lang } = useI18n();

  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<{
    order_code: string;
    status: string;
    delivery_method: string;
    delivery_zone: string;
    subtotal: number;
    delivery_fee: number;
    total: number;
    item_count: number;
    created_at: string;
    updated_at: string;
    note: string;
    flat_items: Array<{
      flavor_name: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }>;
    bundles: Array<{
      bundle_id: number;
      bundle_name: string;
      slots: Array<{
        slot: number;
        flavor_name: string;
        flavor_id: number;
      }>;
    }>;
  } | null>(null);
  const [error, setError] = useState<"notFound" | "code" | null>(null);
  // Auto-open review modal ketika status delivered & belum ada review.
  const [reviewOpen, setReviewOpen] = useState(false);
  // Supaya pop-up tidak muncul lagi kalau user sudah menutup (ditrack this session).
  const [reviewDismissed, setReviewDismissed] = useState<Set<string>>(new Set());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOrder(null);

    if (!code.trim()) {
      setError("code");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("track_by_code", {
        p_code: code.trim(),
      });

      if (rpcError || !data) {
        setError("notFound");
      } else {
        setOrder(data as typeof order);
        window.localStorage.setItem(
          "js_track",
          JSON.stringify({ code: code.trim() })
        );
      }
    } catch {
      setError("notFound");
    } finally {
      setBusy(false);
    }
  }

  // Cek apakah order delivered + belum pernah di-review. Buka modal otomatis.
  useEffect(() => {
    if (!order) return;
    if (order.status !== "delivered") return;
    if (reviewDismissed.has(order.order_code)) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("has_review", {
        p_order_code: order.order_code,
      });
      if (cancelled) return;
      if (!data) setReviewOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [order, reviewDismissed]);

  function closeReview() {
    if (order) {
      setReviewDismissed((prev) => new Set(prev).add(order.order_code));
    }
    setReviewOpen(false);
  }

  return (
    <div className="card p-6 sm:p-8">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="code" className="label">
            {t.track.code}
          </label>
          <input
            id="code"
            className={`input font-mono tracking-wider uppercase ${
              error === "code" ? "input-error" : ""
            }`}
            placeholder={t.track.codePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {t.track.submit}
        </button>
      </form>

      {error === "notFound" ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-berry-500/10 p-3.5 text-sm font-semibold text-berry-600">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          {t.track.notFound}
        </p>
      ) : null}

      {order ? (
        <div className="mt-6 border-t border-cocoa-100 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-extrabold text-cocoa-900">
                {order.order_code}
              </p>
              <p className="text-xs text-cocoa-400">
                {t.track.placedOn} {formatDateTime(order.created_at, lang)}
              </p>
            </div>
            <StatusBadge
              status={order.status as "pending"}
              label={t.status[order.status as "pending"] ?? order.status}
            />
          </div>

          <OrderStatusTimeline status={order.status as "pending"} />

          {order.flat_items.length > 0 ? (
            <ul className="mt-5 divide-y divide-cocoa-100 rounded-2xl border border-cocoa-200">
              {order.flat_items.map((it, i) => (
                <li
                  key={i}
                  className="flex justify-between gap-4 px-4 py-2.5 text-sm"
                >
                  <span className="text-cocoa-700">
                    {it.quantity}× {it.flavor_name}
                  </span>
                  <span className="tabular text-cocoa-500">
                    {formatIDR(it.line_total, lang)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-4 bg-cocoa-50 px-4 py-2.5 text-sm font-bold text-cocoa-800">
                <span>{t.common.total}</span>
                <span className="tabular">{formatIDR(order.total, lang)}</span>
              </li>
            </ul>
          ) : null}

          <dl className="mt-4 grid gap-2.5 text-sm">
            <Row
              label={t.track.placedOn}
              value={formatDateTime(order.created_at, lang)}
            />
            <Row
              label={t.track.updatedOn}
              value={formatDateTime(order.updated_at, lang)}
            />
          </dl>

          {order.status === "delivered" ? (
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="btn-primary mt-5 w-full"
            >
              <Star className="size-4" />
              {t.reviews.writeYour}
            </button>
          ) : null}
        </div>
      ) : null}

      {order && reviewOpen ? (
        <ReviewModal
          orderCode={order.order_code}
          initialOpen={reviewOpen}
          onClose={closeReview}
        />
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-cocoa-400">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words text-cocoa-800">
        {value}
      </dd>
    </div>
  );
}