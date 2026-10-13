"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  ChartNoAxesColumn,
  Package,
  TrendingUp,
  Users,
} from "lucide-react";
import type {
  AdminCustomerRow,
  PoBatchDetail,
} from "@/app/admin/actions";
import type { Order, SalesSummary, SalesTransaction } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  deliveryLabel,
  formatFullDateTime,
  formatIDR,
  formatPhone,
  formatPickupDate,
  paymentLabel,
  statusLabel,
} from "@/lib/utils";

/**
 * Detail satu batch pre-order (Steven 14-10-2026).
 *
 * "Setelah kita buat batch kita bisa click itu, lalu di dalamnya ada beberapa
 * sidebar yang sama seperti mutasi, stok, pesanan, pelanggan — khusus untuk
 * batch itu aja."
 *
 * Yang dipisah dari halaman utama admin:
 *   - Sidebar di dalam kartu batch adalah NAVIGASI TAB, bukan filter. Isinya
 *     hanya data batch itu; tidak ada tombol "lihat semua".
 *   - Semua data sudah disaring di server lewat `p_po_batch_id`, jadi tab
 *     ini tidak bisa menampilkan pesanan/pelanggan dari batch lain walau
 *     dipanggil ulang lewat URL.
 *   - Kolom "Stok awal" DITURUNKAN dari `sisa + terjual`, bukan angka yang
 *     disimpan. Alasannya tidak ada kolom stok awal di database, dan sisa
 *     hanya pernah turun karena penjualan lalu naik lagi saat pesanan
 *     dibatalkan — jadi `sisa + terjual` selalu sama dengan yang Steven
 *     setting di awal.
 *
 * Data tidak dimuat ulang dari klien: satu klik dari daftar batch sudah
 * memuat keempat tab sekaligus, jadi pindah tab terasa instan dan tidak
 * ada permintaan yang bolak-balik.
 */

type TabKey = "stock" | "orders" | "customers" | "mutasi";

export interface PoDetailLabels {
  back: string;
  subtitle: string;
  tabs: { stock: string; orders: string; customers: string; mutasi: string };
  stock: {
    title: string;
    colName: string;
    colInitial: string;
    colSold: string;
    colLeft: string;
    empty: string;
    initialHint: string;
  };
  orders: { empty: string; failed: string };
  customers: { empty: string; failed: string };
  mutasi: { empty: string; failed: string };
  summary: {
    terjual: string;
    pcs: string;
    revenue: string;
    pending: string;
    done: string;
    rejected: string;
  };
}

export function PoBatchDetailClient({
  initial,
  orders,
  ordersFailed,
  mutasi,
  mutasiFailed,
  customers,
  customersFailed,
  labels,
}: {
  initial: PoBatchDetail;
  orders: Order[];
  ordersFailed: boolean;
  mutasi: { summary: SalesSummary; transactions: SalesTransaction[]; total: number } | null;
  mutasiFailed: boolean;
  customers: AdminCustomerRow[];
  customersFailed: boolean;
  labels: PoDetailLabels;
}) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<TabKey>("stock");

  const { batch, stok, ringkasan } = initial;
  const statusKey = {
    buka: "statusBuka",
    akan_dibuka: "statusAkan",
    selesai: "statusSelesai",
    nonaktif: "statusNonaktif",
  } as const;

  const statusBadge =
    batch.status === "buka"
      ? "bg-matcha-100 text-matcha-700"
      : batch.status === "akan_dibuka"
        ? "bg-honey-300/25 text-honey-500"
        : batch.status === "selesai"
          ? "bg-cocoa-100 text-cocoa-500"
          : "bg-berry-500/10 text-berry-600";

  const TABS = useMemo(
    () =>
      [
        { key: "stock" as const, label: labels.tabs.stock, icon: Boxes },
        { key: "orders" as const, label: labels.tabs.orders, icon: Package },
        { key: "customers" as const, label: labels.tabs.customers, icon: Users },
        { key: "mutasi" as const, label: labels.tabs.mutasi, icon: TrendingUp },
      ] satisfies Array<{ key: TabKey; label: string; icon: typeof Boxes }>,
    [labels]
  );

  return (
    <div className="space-y-5 pb-24">
      <Link
        href="/admin/po"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-cocoa-600 transition hover:text-cocoa-900"
      >
        <ArrowLeft className="size-4" />
        {labels.back}
      </Link>

      <header className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold text-cocoa-900">
            {batch.label}
          </h1>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadge}`}
          >
            {t.admin.po[statusKey[batch.status]]}
          </span>
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-cocoa-500">
          <CalendarDays className="size-3.5" />
          <span>
            {t.admin.po.openAt}: {formatPickupDate(batch.open_at, lang)}
          </span>
          <span>·</span>
          <span>
            {t.admin.po.closeAt}: {formatPickupDate(batch.close_at, lang)}
          </span>
          <span>·</span>
          <span className="font-semibold text-cocoa-700">
            {t.admin.po.pickupDate}: {formatPickupDate(batch.pickup_date, lang)}
          </span>
        </p>

        <p className="mt-2 text-sm text-cocoa-500">{labels.subtitle}</p>

        <dl className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={labels.summary.terjual} value={String(ringkasan.terjual)} />
          <Stat label={labels.summary.pcs} value={String(ringkasan.pcs_terjual)} />
          <Stat
            label={labels.summary.revenue}
            value={formatIDR(ringkasan.pendapatan, lang)}
          />
          <Stat label={labels.summary.pending} value={String(ringkasan.pending)} />
          <Stat label={labels.summary.done} value={String(ringkasan.selesai)} />
          <Stat label={labels.summary.rejected} value={String(ringkasan.ditolak)} />
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        {/* ---------- Sidebar tab ---------- */}
        <nav
          aria-label={labels.tabs.stock}
          className="flex gap-1.5 overflow-x-auto rounded-2xl border border-cocoa-200 bg-cream-50 p-1.5 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible"
        >
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                  active
                    ? "bg-cocoa-900 text-cream-50"
                    : "text-cocoa-600 hover:bg-white"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-5">
          {/* ---------- STOK ---------- */}
          {tab === "stock" ? (
            <section className="card p-5">
              <h2 className="text-lg font-extrabold text-cocoa-900">
                {labels.stock.title}
              </h2>
              <p className="mt-1 text-[13px] text-cocoa-500">
                {labels.stock.initialHint}
              </p>

              {stok.length === 0 ? (
                <p className="mt-5 text-sm text-cocoa-400">{labels.stock.empty}</p>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-cocoa-200">
                  <div className="hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-cocoa-500 sm:grid sm:grid-cols-[minmax(0,1fr)_110px_110px_110px] sm:gap-3">
                    <div>{labels.stock.colName}</div>
                    <div className="text-right">{labels.stock.colInitial}</div>
                    <div className="text-right">{labels.stock.colSold}</div>
                    <div className="text-right">{labels.stock.colLeft}</div>
                  </div>
                  <ul className="divide-y divide-cocoa-200">
                    {stok.map((row) => (
                      <li
                        key={row.category_id}
                        className="grid grid-cols-3 gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_110px_110px_110px] sm:items-center"
                      >
                        <div className="col-span-3 font-bold text-cocoa-900 sm:col-span-1">
                          {row.nama}
                        </div>
                        <div className="text-right text-cocoa-600 tabular">
                          {row.stok_awal}
                        </div>
                        <div className="text-right text-cocoa-600 tabular">
                          {row.terjual}
                        </div>
                        <div
                          className={`text-right font-bold tabular ${
                            row.sisa <= 0 ? "text-berry-600" : "text-matcha-700"
                          }`}
                        >
                          {row.sisa}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : null}

          {/* ---------- PESANAN ---------- */}
          {tab === "orders" ? (
            <section className="card p-5">
              <h2 className="text-lg font-extrabold text-cocoa-900">
                {labels.tabs.orders}
              </h2>
              {ordersFailed ? (
                <p className="mt-4 text-sm text-cocoa-500">{labels.orders.failed}</p>
              ) : orders.length === 0 ? (
                <p className="mt-4 text-sm text-cocoa-400">{labels.orders.empty}</p>
              ) : (
                <ul className="mt-4 space-y-2.5">
                  {orders.map((o) => (
                    <li
                      key={o.id}
                      className="rounded-2xl border border-cocoa-200 p-3.5"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <Link
                          href={`/admin/orders?q=${encodeURIComponent(o.order_code)}`}
                          className="font-mono text-sm font-bold text-cocoa-900 hover:underline"
                        >
                          {o.order_code}
                        </Link>
                        <StatusBadge
                          status={o.status}
                          label={statusLabel(o.status, lang)}
                          size="sm"
                        />
                        <span className="text-[13px] text-cocoa-500">
                          {o.customer_name} ·{" "}
                          <span dir="ltr">{formatPhone(o.phone)}</span>
                        </span>
                        <span className="ml-auto text-sm font-bold text-cocoa-900 tabular">
                          {formatIDR(o.total_price, lang)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-[12px] text-cocoa-500">
                        {formatFullDateTime(o.created_at, lang)} ·{" "}
                        {deliveryLabel(o.delivery_method, lang)} ·{" "}
                        {paymentLabel(o.payment_method, lang)} ·{" "}
                        {o.items
                          .slice(0, 3)
                          .map((i) => `${i.quantity}× ${i.flavor_name}`)
                          .join(", ")}
                        {o.items.length > 3 ? ` +${o.items.length - 3}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {/* ---------- PELANGGAN ---------- */}
          {tab === "customers" ? (
            <section className="card p-5">
              <h2 className="text-lg font-extrabold text-cocoa-900">
                {labels.tabs.customers}
              </h2>
              {customersFailed ? (
                <p className="mt-4 text-sm text-cocoa-500">
                  {labels.customers.failed}
                </p>
              ) : customers.length === 0 ? (
                <p className="mt-4 text-sm text-cocoa-400">
                  {labels.customers.empty}
                </p>
              ) : (
                <ul className="mt-4 space-y-2.5">
                  {customers.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-cocoa-200 p-3.5"
                    >
                      <span className="text-sm font-bold text-cocoa-900">
                        {c.customer_name}
                      </span>
                      <a
                        href={`https://wa.me/${c.phone_normalized}`}
                        target="_blank"
                        rel="noreferrer"
                        dir="ltr"
                        className="text-[13px] text-cocoa-600 hover:underline"
                      >
                        {formatPhone(c.phone)}
                      </a>
                      {c.instagram ? (
                        <span className="text-[13px] text-cocoa-500">
                          @{c.instagram}
                        </span>
                      ) : null}
                      <span className="ml-auto text-sm text-cocoa-600">
                        {c.order_count}× ·{" "}
                        <span className="font-bold text-cocoa-900 tabular">
                          {formatIDR(c.total_spent, lang)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {/* ---------- MUTASI ---------- */}
          {tab === "mutasi" ? (
            <section className="card p-5">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-900">
                <ChartNoAxesColumn className="size-5" />
                {labels.tabs.mutasi}
              </h2>
              {mutasiFailed || !mutasi ? (
                <p className="mt-4 text-sm text-cocoa-500">
                  {labels.mutasi.failed}
                </p>
              ) : mutasi.transactions.length === 0 ? (
                <p className="mt-4 text-sm text-cocoa-400">{labels.mutasi.empty}</p>
              ) : (
                <>
                  <dl className="mt-4 grid grid-cols-3 gap-2.5">
                    <Stat
                      label={labels.summary.revenue}
                      value={formatIDR(mutasi.summary.revenue_total, lang)}
                    />
                    <Stat
                      label={labels.summary.terjual}
                      value={String(mutasi.summary.orders_count)}
                    />
                    <Stat
                      label={labels.summary.pcs}
                      value={String(mutasi.summary.pcs_sold)}
                    />
                  </dl>
                  <ul className="mt-4 divide-y divide-cocoa-200 border-y border-cocoa-200">
                    {mutasi.transactions.map((tr) => (
                      <li key={tr.id} className="py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className="font-mono text-xs text-cocoa-500">
                            {formatFullDateTime(tr.created_at, lang)}
                          </span>
                          <span className="font-mono text-xs font-bold text-cocoa-900">
                            {tr.order_code}
                          </span>
                          <span className="text-[13px] text-cocoa-600">
                            {tr.customer_name}
                          </span>
                          <span className="ml-auto text-sm font-bold text-cocoa-900 tabular">
                            {formatIDR(tr.total_price, lang)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-cocoa-500">
                          {tr.items.length === 0
                            ? "—"
                            : tr.items
                                .map((i) => `${i.quantity}× ${i.flavor_name}`)
                                .join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cocoa-50 px-3 py-2.5">
      <dt className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-extrabold text-cocoa-900 tabular">
        {value}
      </dd>
    </div>
  );
}