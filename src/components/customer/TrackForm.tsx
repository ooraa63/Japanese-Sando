"use client";

import { useState } from "react";
import { Loader2, Search, XCircle } from "lucide-react";
import type { StoreSettings, TrackedOrder } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import {
  deliveryLabel,
  formatDateTime,
  formatIDR,
  formatPhone,
  paymentLabel,
  waLink,
} from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { OrderStatusTimeline } from "@/components/customer/OrderStatusTimeline";

export function TrackForm({
  settings,
  initialCode = "",
}: {
  settings: StoreSettings | null;
  initialCode?: string;
}) {
  const { t, lang } = useI18n();

  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<"notFound" | "code" | "phone" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOrder(null);

    if (!code.trim()) return setError("code");
    if (!phone.trim()) return setError("phone");

    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("track_order", {
        p_code: code.trim(),
        p_phone: phone.trim(),
      });

      if (rpcError) {
        setError("notFound");
      } else if (!data) {
        setError("notFound");
      } else {
        setOrder(data as TrackedOrder);
        // Simpan supaya bisa dibuka lagi tanpa mengetik ulang
        window.localStorage.setItem("js_track", JSON.stringify({ code, phone }));
      }
    } catch {
      setError("notFound");
    } finally {
      setBusy(false);
    }
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
          <label htmlFor="track-phone" className="label">
            {t.track.phone}
          </label>
          <input
            id="track-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            className={`input tabular ${error === "phone" ? "input-error" : ""}`}
            placeholder={t.order.identity.phonePlaceholder}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          {t.track.submit}
        </button>
      </form>

      {error && error !== "code" && error !== "phone" ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-xl bg-berry-500/10 p-3.5 text-sm font-semibold text-berry-600">
          <XCircle className="mt-0.5 size-4 shrink-0" />
          {t.track.notFound}
        </p>
      ) : null}

      {order ? (
        <div className="mt-6 border-t border-cocoa-100 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-extrabold text-cocoa-900">{order.order_code}</p>
              <p className="text-xs text-cocoa-400">
                {t.track.placedOn} {formatDateTime(order.created_at, lang)}
              </p>
            </div>
            <StatusBadge status={order.status} label={t.status[order.status]} />
          </div>

          <OrderStatusTimeline status={order.status} />

          <ul className="mt-5 divide-y divide-cocoa-100 rounded-2xl border border-cocoa-200">
            {order.items.map((it, i) => (
              <li key={i} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="text-cocoa-700">
                  {it.quantity}× {it.flavor_name}
                </span>
                <span className="tabular text-cocoa-500">{formatIDR(it.line_total, lang)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-4 bg-cocoa-50 px-4 py-2.5 text-sm font-bold text-cocoa-800">
              <span>{t.common.total}</span>
              <span className="tabular">{formatIDR(order.total_price, lang)}</span>
            </li>
          </ul>

          <dl className="mt-4 grid gap-2.5 text-sm">
            <Row label={t.order.review.nameLabel} value={order.customer_name} />
            <Row
              label={t.order.review.phoneLabel}
              value={<span dir="ltr">{formatPhone(order.phone)}</span>}
            />
            <Row
              label={t.order.review.paymentLabel}
              value={paymentLabel(order.payment_method, lang)}
            />
            <Row
              label={t.order.review.deliveryLabel}
              value={deliveryLabel(order.delivery_method, lang)}
            />
            {order.address ? <Row label={t.order.payment.address} value={order.address} /> : null}
            {order.note ? <Row label={t.common.note} value={order.note} /> : null}
            <Row label={t.track.updatedOn} value={formatDateTime(order.updated_at, lang)} />
          </dl>

          {settings?.whatsapp ? (
            <a
              href={waLink(
                settings.whatsapp,
                lang === "en"
                  ? `Hi, I want to ask about my order ${order.order_code}.`
                  : `Halo, saya mau tanya soal pesanan saya ${order.order_code}.`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline mt-5 w-full"
            >
              {t.track.waSeller}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-cocoa-400">{label}</dt>
      <dd className="min-w-0 text-right font-semibold break-words text-cocoa-800">{value}</dd>
    </div>
  );
}
