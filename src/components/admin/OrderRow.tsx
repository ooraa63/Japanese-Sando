"use client";

import type { Order } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { deliveryLabel, formatDateTime, formatIDR, formatPhone, paymentLabel } from "@/lib/utils";

/** Rincian ringkas pesanan yang bisa dibuka-tutup di daftar. */
export function OrderRow({ order }: { order: Order }) {
  const { t, lang } = useI18n();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ul className="space-y-1.5">
        {order.items.map((i, idx) => (
          <li key={idx} className="flex justify-between gap-3 text-[13px]">
            <span className="text-cocoa-700">
              {i.quantity}× {i.flavor_name}
            </span>
            <span className="tabular text-cocoa-500">{formatIDR(i.line_total, lang)}</span>
          </li>
        ))}
        {order.delivery_fee > 0 ? (
          <li className="flex justify-between gap-3 border-t border-cocoa-200 pt-1.5 text-[13px] text-cocoa-600">
            <span>{t.order.review.deliveryFee}</span>
            <span className="tabular">{formatIDR(order.delivery_fee, lang)}</span>
          </li>
        ) : null}
        <li className="flex justify-between gap-3 border-t border-cocoa-200 pt-1.5 text-sm font-bold text-cocoa-900">
          <span>{t.common.total}</span>
          <span className="tabular">{formatIDR(order.total_price, lang)}</span>
        </li>
      </ul>

      <dl className="space-y-1.5 text-[12px] text-cocoa-500">
        <div className="flex justify-between gap-3">
          <dt>{t.order.review.phoneLabel}</dt>
          <dd dir="ltr" className="font-semibold text-cocoa-700">
            {formatPhone(order.phone)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{t.order.review.paymentLabel}</dt>
          <dd className="font-semibold text-cocoa-700">
            {paymentLabel(order.payment_method, lang)}
            {order.transfer_method ? ` · ${order.transfer_method}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{t.order.review.deliveryLabel}</dt>
          <dd className="font-semibold text-cocoa-700">
            {deliveryLabel(order.delivery_method, lang)}
          </dd>
        </div>
        {order.address ? (
          <div className="flex justify-between gap-3">
            <dt>{t.order.payment.address}</dt>
            <dd className="max-w-[60%] text-right font-semibold text-cocoa-700">
              {order.address}
            </dd>
          </div>
        ) : null}
        {order.note ? (
          <div className="flex justify-between gap-3">
            <dt>{t.common.note}</dt>
            <dd className="max-w-[60%] text-right font-semibold text-cocoa-700">
              {order.note}
            </dd>
          </div>
        ) : null}
        {order.admin_note ? (
          <div className="flex justify-between gap-3">
            <dt>{t.admin.orders.adminNote}</dt>
            <dd className="max-w-[60%] text-right font-semibold text-honey-500">
              {order.admin_note}
            </dd>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <dt>{t.common.date}</dt>
          <dd className="font-semibold text-cocoa-700">
            {formatDateTime(order.created_at, lang)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
