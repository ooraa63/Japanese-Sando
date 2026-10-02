"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  LockOpen,
  Printer,
  Loader2,
} from "lucide-react";
import type { Batch, BatchSummary } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatFullDateTime, formatIDR } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { closeBatchAction, reopenBatchAction } from "@/app/admin/actions";

export function BatchClient({
  initialBatches,
  initialSummary,
  initialBatchId,
}: {
  initialBatches: Batch[];
  initialSummary: BatchSummary | null;
  initialBatchId: number | null;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [batches, setBatches] = useState(initialBatches);
  const [summary] = useState(initialSummary);
  const [busy, startBusy] = useTransition();

  async function toggle(id: number, close: boolean) {
    startBusy(async () => {
      const res = close ? await closeBatchAction(id) : await reopenBatchAction(id);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      setBatches((prev) =>
        prev.map((b) =>
          b.id === id
            ? { ...b, status: close ? "closed" : "open", is_open: !close }
            : close
              ? { ...b, is_open: false }
              : b
        )
      );
      toast.success(close ? t.admin.batch.closeBatch : t.admin.batch.reopen);
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
          {t.admin.batch.title}
        </h1>
        <p className="mt-1 text-sm text-cocoa-500">{t.admin.batch.subtitle}</p>
      </div>

      {initialBatchId === null ? (
        <div className="card p-14 text-center text-sm text-cocoa-400">
          {t.admin.dash.noBatch}
        </div>
      ) : (
        <>
          {/* Ringkasan batch terbuka */}
          {summary?.batch ? (
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cocoa-100 bg-cocoa-50 px-5 py-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-extrabold text-cocoa-900">
                      {summary.batch.label}
                    </h2>
                    {summary.batch.status === "open" ? (
                      <span className="chip bg-matcha-100 text-matcha-700">
                        {t.admin.batch.open}
                      </span>
                    ) : (
                      <span className="chip bg-cocoa-100 text-cocoa-500">
                        {t.admin.batch.closed}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-cocoa-400">
                    {formatFullDateTime(summary.batch.created_at, lang)}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="btn-ghost !px-3.5 !py-2 !text-[12px]"
                  >
                    <Printer className="size-3.5" />
                    {t.admin.batch.print}
                  </button>
                  {summary.batch.status === "open" ? (
                    <button
                      type="button"
                      onClick={() => toggle(summary.batch!.id, true)}
                      disabled={busy}
                      className="btn-outline !px-3.5 !py-2 !text-[12px]"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Lock className="size-3.5" />
                      )}
                      {t.admin.batch.closeBatch}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(summary.batch!.id, false)}
                      disabled={busy}
                      className="btn-primary !px-3.5 !py-2 !text-[12px]"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <LockOpen className="size-3.5" />
                      )}
                      {t.admin.batch.reopen}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 px-5 py-5 sm:grid-cols-3">
                <StatBox
                  label={t.admin.dash.orders}
                  value={summary.total_orders}
                  sub={`${summary.total_items} ${t.admin.dash.pcsLeft.replace("tersisa", "pcs")}`}
                />
                <StatBox
                  label={t.common.total}
                  value={formatIDR(summary.revenue, lang)}
                  sub={t.admin.batch.revenueNote}
                />
                <StatBox
                  label={t.admin.batch.method}
                  value={`${summary.by_delivery.pickup ?? 0} / ${summary.by_delivery.delivery ?? 0}`}
                  sub={`${t.order.payment.pickup} / ${t.order.payment.delivery}`}
                />
              </div>
            </div>
          ) : null}

          {/* Daftar produksi per rasa */}
          {summary && summary.by_flavor.length > 0 ? (
            <div className="card">
              <div className="border-b border-cocoa-100 px-5 py-4">
                <h2 className="text-base font-bold text-cocoa-800">
                  {t.admin.batch.productionList}
                </h2>
                <p className="mt-0.5 text-[13px] text-cocoa-500">
                  {t.admin.batch.productionHint}
                </p>
              </div>
              <ul className="divide-y divide-cocoa-100">
                {summary.by_flavor.map((f, i) => (
                  <li
                    key={f.flavor_name}
                    className="flex items-center justify-between gap-4 px-5 py-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-cocoa-800 text-[11px] font-bold text-cream-50">
                        {i + 1}
                      </span>
                      <span className="text-sm font-bold text-cocoa-800">
                        {f.flavor_name}
                      </span>
                    </div>
                    <span className="font-display text-lg font-extrabold text-cocoa-900 tabular">
                      {f.qty}
                      <span className="ml-1 text-xs font-bold text-cocoa-400">
                        pcs
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-cocoa-100 bg-cocoa-50 px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-cocoa-700">
                    {t.common.total}
                  </span>
                  <span className="font-display text-lg font-extrabold text-cocoa-900 tabular">
                    {summary.total_items} pcs
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Riwayat batch */}
          <div className="card">
            <div className="border-b border-cocoa-100 px-5 py-4">
              <h2 className="text-base font-bold text-cocoa-800">
                {t.admin.batch.history}
              </h2>
              <p className="mt-0.5 text-[13px] text-cocoa-500">
                {t.admin.batch.historyHint}
              </p>
            </div>
            <ul className="divide-y divide-cocoa-100">
              {batches.map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-cocoa-800">
                        {b.label}
                      </span>
                      {b.is_open ? (
                        <span className="chip bg-matcha-100 !px-1.5 !py-0 text-[9px] text-matcha-700">
                          {t.admin.batch.open}
                        </span>
                      ) : (
                        <span className="chip bg-cocoa-100 !px-1.5 !py-0 text-[9px] text-cocoa-500">
                          {t.admin.batch.closed}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-cocoa-400">
                      {formatFullDateTime(b.created_at, lang)}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-bold text-cocoa-800 tabular">
                      {b.order_count} {t.admin.dash.orders.toLowerCase()} · {b.item_count} pcs
                    </p>
                    <p className="text-[11px] text-cocoa-400 tabular">
                      {formatIDR(b.revenue, lang)}
                    </p>
                  </div>

                  {b.is_open ? (
                    <CheckCircle2 className="size-4.5 shrink-0 text-matcha-500" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(b.id, false)}
                      disabled={busy}
                      className="shrink-0 rounded-lg border border-cocoa-200 px-2.5 py-1.5 text-[11px] font-bold text-cocoa-600 transition hover:bg-cocoa-50"
                    >
                      {t.admin.batch.makeOpen}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/admin/orders"
            className="btn-outline w-full sm:w-auto"
          >
            {t.admin.batch.goToOrders}
            <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-cocoa-200 p-4 text-center">
      <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-extrabold text-cocoa-900 tabular">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-cocoa-400">{sub}</p>
    </div>
  );
}
