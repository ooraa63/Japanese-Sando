"use client";

import { useState } from "react";
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
import type { SalesSummary, SalesTransaction } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatDateTimeParts, formatIDR, paymentLabel, statusLabel } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * Template grid kolom tabel "Daftar transaksi".
 *
 * Dipakai PERSIS oleh header dan setiap baris data. Semua kolom lebar tetap —
 * tidak ada `auto` — supaya tepi kanan tiap kolom sama persis di semua baris.
 * Sisa ruang (1fr) diberikan ke kolom PELANGGAN.
 *
 * Nilai ini HARUS ditulis sebagai string class literal yang lengkap. Kalau
 * dirangkai saat runtime (`lg:${TX_COLS}`), scanner Tailwind tidak pernah
 * melihat class utuhnya sehingga tidak tergenerate dan tabelnya diam-diam
 * kehilangan kolom.
 */
const TX_COLS =
  "lg:grid-cols-[104px_150px_minmax(0,1fr)_minmax(0,220px)_112px_210px]";

/**
 * Bagian "Daftar transaksi" + filter untuk halaman Mutasi.
 *
 * Dipakai bersama oleh:
 *   - `/admin/sales` (Mutasi di sidebar)
 *   - tab Mutasi di `/admin/po/[id]` (detail batch, Steven 14-10-2026)
 *
 * Dua perubahan Steven di gambar 6:
 *
 * 1. FILTER JADI RINGKAS. Sebelumnya filter ada di kartu besar sendiri di atas
 *    daftar — tiga input selebar layar penuh plus tombol reset dan ekspor, jadi
 *    memakan hampir seperempat halaman sebelum Steven sempat sampai ke daftar
 *    transaksinya. Sekarang filter jadi satu baris tombol kecil di KEPALA
 *    daftar transaksi; isinya baru keluar saat diklik.
 * 2. TEKS DI TABEL DILEBIHKAN. Header kolom masih `text-[11px]`, nama item
 *    `text-xs`, nama pembayaran `text-[10px]` — di monitor admin itu praktis
 *    tidak terbaca. Semua sekarang minimal `text-[13px]`.
 */

export interface SalesFilterValues {
  fromDate: string;
  toDate: string;
  search: string;
}

export function SalesTransactionsSection({
  transactions,
  total,
  filters,
  onChangeFilters,
  onReset,
  onExport,
  loading,
}: {
  transactions: SalesTransaction[];
  total: number;
  filters: SalesFilterValues;
  onChangeFilters: (next: SalesFilterValues) => void;
  onReset: () => void;
  onExport?: () => void;
  loading?: boolean;
}) {
  const { t, lang } = useI18n();
  const [filterOpen, setFilterOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const activeCount =
    (filters.fromDate ? 1 : 0) + (filters.toDate ? 1 : 0) + (filters.search ? 1 : 0);

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section>
      {/* ---------- Kepala daftar: judul + filter ringkas ---------- */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-sm font-bold text-cocoa-700">{t.admin.sales.tableHeader}</h2>
        <span className="text-xs text-cocoa-500">
          {t.admin.sales.showingOf
            .replace("{n}", String(transactions.length))
            .replace("{total}", String(total))}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            aria-expanded={filterOpen}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
              filterOpen || activeCount > 0
                ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-300"
            }`}
          >
            <Filter className="size-3.5" />
            {t.admin.sales.filtersLabel}
            {activeCount > 0 ? (
              <span className="rounded-full bg-cream-50/20 px-1.5 py-px text-[10px] tabular">
                {activeCount}
              </span>
            ) : null}
          </button>

          {onExport ? (
            <button
              type="button"
              onClick={onExport}
              disabled={transactions.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cocoa-200 bg-white px-2.5 py-1.5 text-xs font-bold text-cocoa-600 transition hover:border-cocoa-300 disabled:opacity-40"
            >
              <Download className="size-3.5" />
              {t.admin.sales.exportCsv}
            </button>
          ) : null}
        </div>
      </div>

      {/* ---------- Isi filter (hanya saat dibuka) ---------- */}
      {filterOpen ? (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-cocoa-200 bg-cream-50 px-2.5 py-2">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-cocoa-500">
            <Calendar className="size-3" />
            {t.admin.sales.filterDateFrom}
          </label>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(e) => onChangeFilters({ ...filters, fromDate: e.target.value })}
            aria-label={t.admin.sales.filterDateFrom}
            className="h-8 rounded-lg border border-cocoa-200 bg-white px-2 text-[13px] text-cocoa-800 focus:border-matcha-600 focus:outline-none"
          />
          <span className="text-[11px] font-semibold text-cocoa-400">–</span>
          <label className="flex items-center gap-1 text-[11px] font-semibold text-cocoa-500">
            <Calendar className="size-3" />
            {t.admin.sales.filterDateTo}
          </label>
          <input
            type="date"
            value={filters.toDate}
            onChange={(e) => onChangeFilters({ ...filters, toDate: e.target.value })}
            aria-label={t.admin.sales.filterDateTo}
            className="h-8 rounded-lg border border-cocoa-200 bg-white px-2 text-[13px] text-cocoa-800 focus:border-matcha-600 focus:outline-none"
          />

          <label className="flex items-center gap-1 text-[11px] font-semibold text-cocoa-500">
            <Search className="size-3" />
            {t.admin.sales.searchLabel}
          </label>
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onChangeFilters({ ...filters, search: e.target.value })}
            placeholder={t.admin.sales.searchPlaceholder}
            aria-label={t.admin.sales.searchLabel}
            className="h-8 min-w-0 flex-1 rounded-lg border border-cocoa-200 bg-white px-2 text-[13px] text-cocoa-800 focus:border-matcha-600 focus:outline-none"
          />

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 rounded-lg border border-cocoa-200 bg-white px-2 py-1.5 text-xs font-semibold text-cocoa-600 transition hover:border-cocoa-300"
          >
            <RotateCcw className="size-3.5" />
            {t.admin.sales.filterReset}
          </button>
        </div>
      ) : null}

      {/* ---------- Tabel transaksi ---------- */}
      {loading && transactions.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-cocoa-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-8 text-center text-sm text-cocoa-500">
          {t.admin.sales.empty}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50">
          {/* ---------- Template kolom tabel transaksi ----------
              Steven 14-10-2026 (gambar Mutasi): "di tabelnya masih ga rapi
              banget ga sejajar semua spacingnya hancur".

              Penyebabnya ada dua, keduanya soal grid:
              1. Header dan tiap baris itu DUA `grid` terpisah, dan kolom
                 terakhir pakai `minmax(150px, auto)`. Lebar `auto` dihitung
                 sendiri-sendiri: header cuma berisi teks "BAYAR" (tipis),
                 sedangkan baris berisi badge status + label pembayaran yang
                 `whitespace-nowrap` (lebar). Selisihnya diserap kolom
                 PELANGGAN yang `1fr` — jadi tepi kanan TOTAL/BAYAR bergeser
                 antara header dan baris.
              2. Kolom TANGGAL dan KODE tidak punya `whitespace-nowrap`, dan
                 tanggalnya satu string panjang — jadi jadi tiga baris.

              Perbaikannya: SEMUA kolom lebar tetap (tidak ada `auto` lagi),
              template-nya dipindah ke satu konstanta supaya header dan baris
              MUSTAHIL berbeda, tanggal dipecah dua baris pendek, dan
              kode/kolom numerik dikunci nowrap.

              PENTING: nilai konstantanya adalah string class LITERAL yang
              lengkap (termasuk prefix `lg:`). Kalau ditulis `lg:${TX_COLS}`,
              scanner Tailwind tidak akan pernah melihat class itu sebagai
              teks utuh, jadi diam-diam tidak tergenerate sama sekali dan
              seluruh kolom jadi menumpuk — persis jebakan "kelas Tailwind
              tak dikenal = no-op senyap" di MEMORY/gotchas. */}
          <div
            className={`hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-cocoa-500 lg:grid ${TX_COLS} lg:gap-3`}
          >
            <div>{t.admin.sales.colDate}</div>
            <div>{t.admin.sales.colCode}</div>
            <div>{t.admin.sales.colCustomer}</div>
            <div>{t.admin.sales.colItems}</div>
            <div className="text-right">{t.admin.sales.colTotal}</div>
            <div className="whitespace-nowrap">{t.admin.sales.colPayment}</div>
          </div>
          <ul className="divide-y divide-cocoa-200">
            {transactions.map((tr) => {
              const isExpanded = expanded.has(tr.id);
              const parts = formatDateTimeParts(tr.created_at, lang);
              return (
                <li key={tr.id} className="text-sm">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(tr.id)}
                    className={`grid w-full grid-cols-1 gap-x-4 gap-y-1.5 px-4 py-3.5 text-left transition hover:bg-cocoa-100/40 ${TX_COLS} lg:items-center lg:gap-3`}
                  >
                    <div className="whitespace-nowrap font-mono text-[13px] text-cocoa-600">
                      <span className="block">{parts.date}</span>
                      <span className="block text-cocoa-400">{parts.time}</span>
                    </div>
                    <div className="whitespace-nowrap font-mono text-[13px] font-bold text-cocoa-900">
                      {tr.order_code}
                    </div>
                    <div className="truncate text-[14px] text-cocoa-800">{tr.customer_name}</div>
                    <div className="text-[13px] text-cocoa-600 lg:truncate">
                      {tr.items.length === 0
                        ? "—"
                        : tr.items
                            .slice(0, 2)
                            .map((i) => `${i.flavor_name} ×${i.quantity}`)
                            .join(", ") +
                          (tr.items.length > 2 ? ` +${tr.items.length - 2}` : "")}
                    </div>
                    <div className="whitespace-nowrap text-right font-bold text-cocoa-900 tabular">
                      {formatIDR(tr.total_price, lang)}
                    </div>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      <StatusBadge status={tr.status} label={statusLabel(tr.status, lang)} size="sm" />
                      <span className="text-[12px] tracking-wide text-cocoa-600">
                        {paymentLabel(tr.payment_method, lang)}
                      </span>
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="border-t border-cocoa-200/60 bg-cream-100/40 px-4 py-4 text-[13px]">
                      <ul className="space-y-2">
                        {tr.items.map((i, idx) => (
                          <li key={idx} className="flex items-center justify-between gap-4">
                            <span className="text-cocoa-700">
                              {i.flavor_name} <span className="text-cocoa-400">×{i.quantity}</span>
                            </span>
                            <span className="font-mono text-cocoa-500">
                              {formatIDR(i.line_total, lang)}
                            </span>
                          </li>
                        ))}
                        <li className="flex items-center justify-between gap-4 border-t border-cocoa-200/70 pt-2 font-bold text-cocoa-900">
                          <span>{t.admin.sales.itemSubtotal}</span>
                          <span className="font-mono">{formatIDR(tr.subtotal, lang)}</span>
                        </li>
                        {tr.delivery_fee > 0 ? (
                          <li className="flex items-center justify-between gap-4 text-cocoa-600">
                            <span>{t.admin.sales.itemDelivery}</span>
                            <span className="font-mono">{formatIDR(tr.delivery_fee, lang)}</span>
                          </li>
                        ) : null}
                        <li className="flex items-center justify-between gap-4 border-t-2 border-cocoa-300 pt-2 text-sm font-extrabold text-cocoa-900">
                          <span>{t.admin.sales.colTotal}</span>
                          <span className="font-mono">{formatIDR(tr.total_price, lang)}</span>
                        </li>
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
  );
}

/**
 * Kartu ringkasan 4 angka + daftar rasa terlaris.
 *
 * Dipindah ke sini 14-10-2026 supaya tab Mutasi di detail batch memakai angka
 * dan gaya yang sama persis dengan halaman Mutasi di sidebar.
 */
export function SalesSummaryCards({ summary }: { summary: SalesSummary }) {
  const { t, lang } = useI18n();

  const blocks = [
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
      sub: t.admin.sales.summaryTodayOrders.replace("{n}", String(summary.orders_today)),
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
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {blocks.map((b) => {
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
              <p className="mt-1 font-display text-xl font-bold text-cocoa-900">{b.value}</p>
              {b.sub ? (
                <p className="mt-1 text-xs font-semibold text-cocoa-500">{b.sub}</p>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="rounded-2xl border border-cocoa-200 bg-cream-50 p-4">
        <h2 className="mb-3 text-sm font-bold text-cocoa-700">{t.admin.sales.topFlavors}</h2>
        {summary.top_flavors.length === 0 ? (
          <p className="text-sm text-cocoa-400">{t.admin.sales.topFlavorsEmpty}</p>
        ) : (
          <ol className="space-y-2">
            {summary.top_flavors.map((f, i) => {
              const max = Math.max(...summary.top_flavors.map((x) => x.qty), 1);
              const pct = Math.round((f.qty / max) * 100);
              return (
                <li key={f.flavor_name} className="flex items-center gap-3">
                  <span className="w-6 shrink-0 text-xs font-bold text-cocoa-400">#{i + 1}</span>
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
    </div>
  );
}