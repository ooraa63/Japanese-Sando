"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Banknote,
  Calendar,
  Download,
  Filter,
  Loader2,
  Package,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import type { SalesSummary, SalesTransaction } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatFullDateTime, formatIDR, paymentLabel, statusLabel } from "@/lib/utils";
import { getMutasiAction } from "@/app/admin/actions";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface FlavorLite {
  id: number;
  name_id: string;
  name_en: string;
  is_active: boolean;
}

interface SalesFilters {
  fromDate: string;
  toDate: string;
  search: string;
}

const EMPTY_SUMMARY: SalesSummary = {
  revenue_total: 0,
  orders_count: 0,
  pcs_sold: 0,
  revenue_today: 0,
  orders_today: 0,
  top_flavors: [],
};

export function SalesClient({
  initialSummary,
  initialTransactions,
  initialTotal,
  flavors,
  initialFilters,
}: {
  initialSummary: SalesSummary;
  initialTransactions: SalesTransaction[];
  initialTotal: number;
  flavors: FlavorLite[];
  initialFilters: SalesFilters;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [summary, setSummary] = useState<SalesSummary>(initialSummary);
  const [transactions, setTransactions] = useState<SalesTransaction[]>(initialTransactions);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<SalesFilters>(initialFilters);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  const applyFilters = useCallback(
    (next: SalesFilters) => {
      setFilters(next);
      const params = new URLSearchParams();
      if (next.fromDate) params.set("from", next.fromDate);
      if (next.toDate) params.set("to", next.toDate);
      if (next.search) params.set("q", next.search);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname]
  );

  function resetFilters() {
    applyFilters({ fromDate: "", toDate: "", search: "" });
  }

  function reload() {
    startTransition(async () => {
      const res = await getMutasiAction({
        fromDate: filters.fromDate || null,
        toDate: filters.toDate || null,
        search: filters.search,
        limit: 50,
        offset: 0,
      });
      if (res.ok && res.data) {
        setSummary(res.data.summary);
        setTransactions(res.data.transactions);
        setTotal(res.data.total);
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  // Reload otomatis setiap filter berubah.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportCsv() {
    if (transactions.length === 0) return;
    const header = [
      t.admin.sales.csv.code,
      t.admin.sales.csv.date,
      t.admin.sales.csv.customer,
      t.admin.sales.csv.phone,
      t.admin.sales.csv.items,
      t.admin.sales.csv.subtotal,
      t.admin.sales.csv.delivery,
      t.admin.sales.csv.total,
      t.admin.sales.csv.payment,
      t.admin.sales.csv.status,
    ];
    const rows = transactions.map((tr) => {
      const items = tr.items.map((i) => `${i.flavor_name} x${i.quantity}`).join(" | ");
      return [
        tr.order_code,
        new Date(tr.created_at).toISOString(),
        tr.customer_name,
        tr.phone,
        items,
        tr.subtotal,
        tr.delivery_fee,
        tr.total_price,
        paymentLabel(tr.payment_method, lang),
        statusLabel(tr.status, lang),
      ];
    });

    // Export ke .xlsx (Excel native). Library exceljs adalah pure JS —
    // jalan di browser tanpa server-side dependency.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Japanese Sando Admin";
    wb.created = new Date();
    const ws = wb.addWorksheet("Mutasi", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.columns = [
      { header: header[0], key: "code", width: 18 },
      { header: header[1], key: "date", width: 22 },
      { header: header[2], key: "customer", width: 28 },
      { header: header[3], key: "phone", width: 16 },
      { header: header[4], key: "items", width: 50 },
      { header: header[5], key: "subtotal", width: 12, style: { numFmt: "#,##0" } },
      { header: header[6], key: "delivery", width: 12, style: { numFmt: "#,##0" } },
      { header: header[7], key: "total", width: 14, style: { numFmt: "#,##0" } },
      { header: header[8], key: "payment", width: 18 },
      { header: header[9], key: "status", width: 16 },
    ];
    // Tulis header manual (style bold + fill)
    ws.getRow(1).values = header;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFE5DA" },
    };
    rows.forEach((r) => ws.addRow(r));
    // Auto-filter biar enak di Excel
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: header.length },
    };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mutasi-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summaryBlocks = [
    {
      key: "total",
      icon: TrendingUp,
      label: t.admin.sales.summaryRevenue,
      value: formatIDR(summary.revenue_total, lang),
      tone: "bg-matcha-100 text-matcha-700",
    },
    {
      key: "today",
      icon: Sparkles,
      label: t.admin.sales.summaryToday,
      value: formatIDR(summary.revenue_today, lang),
      sub: t.admin.sales.summaryTodayOrders.replace(
        "{n}",
        String(summary.orders_today)
      ),
      tone: "bg-honey-100 text-honey-700",
    },
    {
      key: "orders",
      icon: Package,
      label: t.admin.sales.summaryOrders,
      value: String(summary.orders_count),
      tone: "bg-cocoa-100 text-cocoa-700",
    },
    {
      key: "pcs",
      icon: Banknote,
      label: t.admin.sales.summaryPcs,
      value: String(summary.pcs_sold),
      tone: "bg-cream-200 text-cocoa-800",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-cocoa-900">
          {t.admin.sales.title}
        </h1>
        <p className="text-sm text-cocoa-500">{t.admin.sales.subtitle}</p>
      </header>

      {/* Summary cards */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryBlocks.map((b) => {
          const Icon = b.icon;
          return (
            <div
              key={b.key}
              className="rounded-2xl border border-cocoa-200 bg-cream-50 p-4 shadow-sm"
            >
              <div
                className={`mb-2 inline-flex size-9 items-center justify-center rounded-xl ${b.tone}`}
              >
                <Icon className="size-4.5" />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-cocoa-500">
                {b.label}
              </p>
              <p className="mt-1 font-display text-xl font-bold text-cocoa-900">
                {b.value}
              </p>
              {b.sub ? (
                <p className="mt-1 text-xs font-semibold text-cocoa-500">{b.sub}</p>
              ) : null}
            </div>
          );
        })}
      </section>

      {/* Top flavors */}
      <section className="rounded-2xl border border-cocoa-200 bg-cream-50 p-4">
        <h2 className="mb-3 text-sm font-bold text-cocoa-700">
          {t.admin.sales.topFlavors}
        </h2>
        {summary.top_flavors.length === 0 ? (
          <p className="text-sm text-cocoa-400">{t.admin.sales.topFlavorsEmpty}</p>
        ) : (
          <ol className="space-y-2">
            {summary.top_flavors.map((f, i) => {
              const max = Math.max(...summary.top_flavors.map((x) => x.qty), 1);
              const pct = Math.round((f.qty / max) * 100);
              return (
                <li key={f.flavor_name} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-xs font-bold text-cocoa-400">
                    #{i + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-semibold text-cocoa-800">
                    {f.flavor_name}
                  </span>
                  <span className="font-mono text-xs text-cocoa-500">{pct}%</span>
                  <span className="w-20 text-right font-mono text-sm font-bold text-cocoa-900">
                    {f.qty}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Filters */}
      <section className="rounded-2xl border border-cocoa-200 bg-cream-50 p-4">
        <div className="flex items-center gap-2 mb-3 text-sm font-bold text-cocoa-700">
          <Filter className="size-4" />
          {t.admin.sales.filtersLabel}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-cocoa-500">
              <Calendar className="mr-1 inline size-3" />
              {t.admin.sales.filterDateFrom}
            </span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={(e) =>
                applyFilters({ ...filters, fromDate: e.target.value })
              }
              className="w-full rounded-lg border border-cocoa-200 bg-cream-100 px-3 py-2 text-sm focus:border-matcha-600 focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-cocoa-500">
              <Calendar className="mr-1 inline size-3" />
              {t.admin.sales.filterDateTo}
            </span>
            <input
              type="date"
              value={filters.toDate}
              onChange={(e) =>
                applyFilters({ ...filters, toDate: e.target.value })
              }
              className="w-full rounded-lg border border-cocoa-200 bg-cream-100 px-3 py-2 text-sm focus:border-matcha-600 focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-cocoa-500">
              <Search className="mr-1 inline size-3" />
              {t.admin.sales.searchLabel}
            </span>
            <input
              type="search"
              value={filters.search}
              onChange={(e) =>
                applyFilters({ ...filters, search: e.target.value })
              }
              placeholder={t.admin.sales.searchPlaceholder}
              className="w-full rounded-lg border border-cocoa-200 bg-cream-100 px-3 py-2 text-sm focus:border-matcha-600 focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cocoa-200 px-3 py-1.5 text-xs font-semibold text-cocoa-700 hover:bg-cocoa-100"
          >
            <RotateCcw className="size-3.5" />
            {t.admin.sales.filterReset}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={transactions.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cocoa-800 px-3 py-1.5 text-xs font-bold text-cream-50 hover:bg-cocoa-900 disabled:opacity-40"
          >
            <Download className="size-3.5" />
            {t.admin.sales.exportCsv}
          </button>
        </div>
      </section>

      {/* Transactions table */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-cocoa-700">
            {t.admin.sales.tableHeader}
          </h2>
          <span className="text-xs text-cocoa-500">
            {t.admin.sales.showingOf
              .replace("{n}", String(transactions.length))
              .replace("{total}", String(total))}
          </span>
        </div>

        {pending && transactions.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-cocoa-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-8 text-center text-sm text-cocoa-500">
            {t.admin.sales.empty}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50">
            <div className="hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-cocoa-500 lg:grid lg:grid-cols-[120px_140px_1fr_140px_120px_100px]">
              <div>{t.admin.sales.colDate}</div>
              <div>{t.admin.sales.colCode}</div>
              <div>{t.admin.sales.colCustomer}</div>
              <div>{t.admin.sales.colItems}</div>
              <div className="text-right">{t.admin.sales.colTotal}</div>
              <div>{t.admin.sales.colPayment}</div>
            </div>
            <ul className="divide-y divide-cocoa-200">
              {transactions.map((tr) => {
                const isExpanded = expanded.has(tr.id);
                return (
                  <li key={tr.id} className="text-sm">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(tr.id)}
                      className="grid w-full grid-cols-1 gap-1 px-4 py-3 text-left hover:bg-cocoa-100/40 lg:grid-cols-[120px_140px_1fr_140px_120px_100px] lg:items-center lg:gap-3"
                    >
                      <div className="font-mono text-xs text-cocoa-500">
                        {formatFullDateTime(tr.created_at, lang)}
                      </div>
                      <div className="font-mono text-xs font-bold text-cocoa-900">
                        {tr.order_code}
                      </div>
                      <div className="truncate text-sm text-cocoa-800">
                        {tr.customer_name}
                      </div>
                      <div className="text-xs text-cocoa-500">
                        {tr.items.length === 0
                          ? "—"
                          : tr.items
                              .slice(0, 2)
                              .map((i) => `${i.flavor_name} ×${i.quantity}`)
                              .join(", ") +
                            (tr.items.length > 2
                              ? ` +${tr.items.length - 2}`
                              : "")}
                      </div>
                      <div className="text-right font-bold text-cocoa-900">
                        {formatIDR(tr.total_price, lang)}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={tr.status} label={statusLabel(tr.status, lang)} size="sm" />
                        <span className="text-[10px] uppercase tracking-wider text-cocoa-500">
                          {paymentLabel(tr.payment_method, lang)}
                        </span>
                      </div>
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-cocoa-200/60 bg-cream-100/40 px-4 py-3 text-xs">
                        <ul className="space-y-1">
                          {tr.items.map((i, idx) => (
                            <li
                              key={idx}
                              className="flex items-center justify-between"
                            >
                              <span className="text-cocoa-700">
                                {i.flavor_name}{" "}
                                <span className="text-cocoa-400">×{i.quantity}</span>
                              </span>
                              <span className="font-mono text-cocoa-500">
                                {formatIDR(i.line_total, lang)}
                              </span>
                            </li>
                          ))}
                          <li className="flex items-center justify-between border-t border-cocoa-200/70 pt-1 font-bold text-cocoa-900">
                            <span>{t.admin.sales.itemSubtotal}</span>
                            <span className="font-mono">
                              {formatIDR(tr.subtotal, lang)}
                            </span>
                          </li>
                          {tr.delivery_fee > 0 ? (
                            <li className="flex items-center justify-between text-cocoa-600">
                              <span>{t.admin.sales.itemDelivery}</span>
                              <span className="font-mono">
                                {formatIDR(tr.delivery_fee, lang)}
                              </span>
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}