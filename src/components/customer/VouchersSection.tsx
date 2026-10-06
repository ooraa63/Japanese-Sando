"use client";

import { useState } from "react";
import { Check, Copy, Ticket } from "lucide-react";
import type { Voucher, VoucherList, VoucherType } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatDate } from "@/lib/utils";

function describe(
  type: VoucherType,
  value: Record<string, unknown>,
  d: ReturnType<typeof useI18n>["t"]["account"]["vouchers"],
  lang: "id" | "en"
) {
  const n = Number(value.percent ?? value.amount ?? 0);
  const fmt = lang === "en" ? "en-US" : "id-ID";
  switch (type) {
    case "percent":
      return d.typePercent.replace("{n}", String(n));
    case "amount":
      return d.typeAmount.replace("{n}", n.toLocaleString(fmt));
    case "free_shipping":
      return d.typeFreeShipping;
    case "free_item":
      return d.typeFreeItem;
    default:
      return type;
  }
}

function VoucherCard({
  voucher,
  variant,
}: {
  voucher: Voucher;
  variant: "active" | "used" | "expired";
}) {
  const { t, lang } = useI18n();
  const d = t.account.vouchers;
  const [copied, setCopied] = useState(false);
  const tone =
    variant === "active"
      ? "border-matcha-300 bg-matcha-50"
      : variant === "used"
        ? "border-cocoa-200 bg-cream-50 opacity-70"
        : "border-cocoa-200 bg-cream-50 opacity-60";
  const labelName = lang === "en" ? voucher.label_en : voucher.label_id;

  async function copy() {
    try {
      await navigator.clipboard.writeText(voucher.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border ${tone} p-4 sm:p-5`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ticket
            className={`size-4 ${variant === "active" ? "text-matcha-600" : "text-cocoa-400"}`}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-cocoa-600">
            {describe(voucher.type, voucher.value, d, lang)}
          </span>
        </div>
      </div>
      <p className="font-display text-base font-bold text-cocoa-900">
        {labelName}
      </p>
      <div className="flex items-center justify-between gap-2">
        <code className="rounded-md bg-cream-100 px-2.5 py-1 font-mono text-sm font-extrabold tracking-wider text-cocoa-900">
          {voucher.code}
        </code>
        {variant === "active" ? (
          <button
            type="button"
            onClick={copy}
            aria-label={d.copyCode}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-cocoa-800 px-2.5 py-1.5 text-xs font-bold text-cream-50 hover:bg-cocoa-900"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? d.copied : d.copyCode}
          </button>
        ) : null}
      </div>
      {voucher.expires_at && variant === "active" ? (
        <p className="text-[11px] text-cocoa-500">
          {d.expiresLabel.replace(
            "{date}",
            formatDate(voucher.expires_at, lang)
          )}
        </p>
      ) : null}
    </div>
  );
}

export function VouchersSection({ vouchers }: { vouchers: VoucherList }) {
  const { t } = useI18n();
  const d = t.account.vouchers;
  const total = vouchers.active.length + vouchers.used.length + vouchers.expired.length;

  if (total === 0) {
    return (
      <section className="card p-6 sm:p-7">
        <h2 className="text-lg font-bold text-cocoa-900">{d.title}</h2>
        <p className="mt-3 text-sm text-cocoa-500">{d.empty}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-lg font-bold text-cocoa-900">{d.title}</h2>
        <span className="text-xs text-cocoa-400">
          {vouchers.active.length} {d.active.toLowerCase()}
        </span>
      </div>

      {vouchers.active.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {vouchers.active.map((v) => (
            <VoucherCard key={v.id} voucher={v} variant="active" />
          ))}
        </div>
      ) : null}

      {vouchers.used.length > 0 ? (
        <details className="rounded-2xl border border-cocoa-200 bg-cream-50 p-4">
          <summary className="cursor-pointer text-sm font-bold text-cocoa-700">
            {d.used} ({vouchers.used.length})
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {vouchers.used.map((v) => (
              <VoucherCard key={v.id} voucher={v} variant="used" />
            ))}
          </div>
        </details>
      ) : null}

      {vouchers.expired.length > 0 ? (
        <details className="rounded-2xl border border-cocoa-200 bg-cream-50 p-4">
          <summary className="cursor-pointer text-sm font-bold text-cocoa-700">
            {d.expired} ({vouchers.expired.length})
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {vouchers.expired.map((v) => (
              <VoucherCard key={v.id} voucher={v} variant="expired" />
            ))}
          </div>
        </details>
      ) : null}

      <p className="text-xs text-cocoa-500">{d.hint}</p>
    </section>
  );
}