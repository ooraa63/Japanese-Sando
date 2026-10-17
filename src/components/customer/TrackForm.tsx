"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Package, Search, Star, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatIDR } from "@/lib/utils";
import { pecahPesanan } from "@/lib/order-items";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrderStatusTimeline } from "@/components/customer/OrderStatusTimeline";
import { ReviewModal } from "@/components/customer/ReviewModal";
import type { InvoiceBundleEntry, InvoiceFlatItem } from "@/lib/types";

export function TrackForm({
  initialCode = "",
  initialPhone = "",
}: {
  initialCode?: string;
  initialPhone?: string;
}) {
  const { t, lang } = useI18n();

  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState(initialPhone);
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
    flat_items: InvoiceFlatItem[];
    bundles: InvoiceBundleEntry[];
  } | null>(null);
  const [error, setError] = useState<"notFound" | "code" | "phone" | null>(null);

  /* Nama item dari database masih membawa sufiks slot internal
     ("Cookies & Cream (Sando 2 #1)"). `pecahPesanan` membuang sufiks itu dan
     sekaligus mengelompokkan baris paket di bawah satu kepala "Bundle", jadi
     pembeli tidak salah mengira "(Sando 2 #1)" bagian dari nama rasa. */
  const rincian = useMemo(
    () =>
      order
        ? pecahPesanan(order.flat_items, order.bundles)
        : { biasa: [], paket: [] },
    [order]
  );
  // Auto-open review modal ketika status delivered & belum ada review.
  const [reviewOpen, setReviewOpen] = useState(false);
  // Supaya pop-up tidak muncul lagi kalau user sudah menutup (ditrack this session).
  const [reviewDismissed, setReviewDismissed] = useState<Set<string>>(new Set());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOrder(null);

    // Dua identitas wajib: kode pesanan + nomor telepon. Menyorot kolom yang
    // kosong lebih membantu daripada langsung bilang "tidak ditemukan".
    if (!code.trim()) {
      setError("code");
      return;
    }
    if (!phone.trim()) {
      setError("phone");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      // Normalisasi format di sisi server (`normalize_phone`) yang menentukan
      // kecocokan, jadi di sini cukup kirim apa adanya yang diketik pembeli.
      const { data, error: rpcError } = await supabase.rpc("track_by_code", {
        p_code: code.trim(),
        p_phone: phone.trim(),
      });

      if (rpcError || !data) {
        setError("notFound");
      } else {
        setOrder(data as typeof order);
        window.localStorage.setItem(
          "js_track",
          JSON.stringify({ code: code.trim(), phone: phone.trim() })
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
        <div>
          <label htmlFor="phone" className="label">
            {t.track.phone}
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="tel"
            className={`input tabular ${
              error === "phone" ? "input-error" : ""
            }`}
            placeholder={t.track.phonePlaceholder}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
          <p className="mt-1.5 text-xs text-cocoa-400">{t.track.phoneHint}</p>
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {t.track.submit}
        </button>
      </form>

      {error === "code" ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-berry-500/10 p-3.5 text-sm font-semibold text-berry-600">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          {t.track.codeRequired}
        </p>
      ) : null}

      {error === "phone" ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-berry-500/10 p-3.5 text-sm font-semibold text-berry-600">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          {t.track.phoneRequired}
        </p>
      ) : null}

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
              {rincian.biasa.map((it, i) => (
                <li
                  key={`b-${i}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0 text-cocoa-700">
                    {it.quantity}× {it.name}
                  </span>
                  {/* `shrink-0` + `whitespace-nowrap`: tanpa itu harga ikut
                      terpotong jadi dua baris kalau nama rasa-nya panjang
                      (keluhan Steven 17-10-2026, "angka tidak rapi"). */}
                  <span className="shrink-0 whitespace-nowrap tabular text-cocoa-500">
                    {formatIDR(it.line_total, lang)}
                  </span>
                </li>
              ))}

              {rincian.paket.map((p) => (
                <li key={`p-${p.bundleId ?? p.bundleName}`} className="bg-matcha-50/70 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Package className="size-3.5 shrink-0 text-matcha-700" />
                      <span className="text-[10px] font-extrabold tracking-wide text-matcha-700 uppercase">
                        {t.menu.bundleLabel}
                      </span>
                      <span className="truncate text-sm font-bold text-cocoa-800">
                        {p.bundleName}
                      </span>
                    </span>
                    {p.total != null ? (
                      <span className="shrink-0 whitespace-nowrap text-sm font-extrabold tabular text-cocoa-900">
                        {formatIDR(p.total, lang)}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-1.5 space-y-1">
                    {p.rows.map((r, j) => (
                      <li
                        key={`${p.bundleId ?? p.bundleName}-${j}`}
                        className="flex items-baseline justify-between gap-4 pl-5 text-sm"
                      >
                        <span className="min-w-0 text-cocoa-700">
                          {r.quantity}× {r.name}
                        </span>
                        <span className="shrink-0 whitespace-nowrap tabular text-cocoa-500">
                          {formatIDR(r.line_total, lang)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}

              <li className="flex items-baseline justify-between gap-4 bg-cocoa-50 px-4 py-2.5 text-sm font-bold text-cocoa-800">
                <span>{t.common.total}</span>
                <span className="shrink-0 whitespace-nowrap tabular">
                  {formatIDR(order.total, lang)}
                </span>
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