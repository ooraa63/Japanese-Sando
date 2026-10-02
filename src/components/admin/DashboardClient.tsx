"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  Layers,
  PackageCheck,
  Power,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Batch, DashboardStats, Order } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatFullDateTime, formatIDR, formatRelative, statusLabel } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import {
  getBatchesAction,
  getDashboardStatsAction,
  getOrdersAction,
  saveSettingsAction,
} from "@/app/admin/actions";

export function DashboardClient({
  initialStats,
  initialOrders,
  initialBatches,
  isPreorderOpen,
}: {
  initialStats: DashboardStats;
  initialOrders: Order[];
  initialBatches: Batch[];
  isPreorderOpen: boolean;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [stats, setStats] = useState(initialStats);
  const [orders, setOrders] = useState(initialOrders);
  const [batches, setBatches] = useState(initialBatches);
  const [open, setOpen] = useState(isPreorderOpen);
  const [refreshing, startRefresh] = useTransition();
  const [toggling, startToggle] = useTransition();

  const openBatch = batches.find((b) => b.is_open) ?? null;

  function refresh() {
    startRefresh(async () => {
      const [statsRes, ordersRes, batchesRes] = await Promise.all([
        getDashboardStatsAction(),
        getOrdersAction(null, "", 8, 0),
        getBatchesAction(),
      ]);
      if (statsRes.ok && statsRes.data) setStats(statsRes.data);
      if (ordersRes.ok && ordersRes.data) setOrders(ordersRes.data.orders);
      if (batchesRes.ok && batchesRes.data) setBatches(batchesRes.data);
    });
  }

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    startToggle(async () => {
      const res = await saveSettingsAction({ is_preorder_open: next });
      if (res.ok) {
        toast.success(next ? t.admin.dash.openStore : t.admin.dash.closeStore);
      } else {
        setOpen(!next);
        toast.error(t.errors.generic);
      }
    });
  }

  const cards = [
    {
      label: t.admin.dash.pending,
      value: stats.pending_orders,
      icon: Clock,
      tone: "bg-honey-300/25 text-honey-500",
      href: "/admin/orders?status=pending",
    },
    {
      label: t.admin.dash.accepted,
      value: stats.accepted_orders,
      icon: ChefHat,
      tone: "bg-blue-100 text-blue-600",
      href: "/admin/orders?status=accepted",
    },
    {
      label: t.admin.dash.ready,
      value: stats.ready_orders,
      icon: PackageCheck,
      tone: "bg-violet-100 text-violet-600",
      href: "/admin/orders?status=ready",
    },
    {
      label: t.admin.dash.today,
      value: formatIDR(stats.revenue_today, lang),
      sub: t.admin.dash.todayOrders.replace("{n}", String(stats.orders_today)),
      icon: Wallet,
      tone: "bg-matcha-100 text-matcha-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.dash.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">
            {t.admin.dash.totalOrders.replace("{n}", String(stats.total_orders))}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="btn-ghost !px-3.5 !py-2.5"
            aria-label="Refresh"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          <button
            type="button"
            onClick={toggleOpen}
            disabled={toggling}
            className={`btn !px-4 !py-2.5 ${
              open
                ? "border border-berry-500/30 bg-berry-500/10 text-berry-600 hover:bg-berry-500/15"
                : "border border-matcha-300 bg-matcha-100 text-matcha-700 hover:bg-matcha-200/70"
            }`}
          >
            <Power className="size-4" />
            {open ? t.admin.dash.closeStore : t.admin.dash.openStore}
          </button>
        </div>
      </div>

      {/* ---------- Status pre-order ---------- */}
      <div
        className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
          open
            ? "border-matcha-300 bg-matcha-50 text-matcha-700"
            : "border-berry-500/30 bg-berry-500/5 text-berry-600"
        }`}
      >
        {open ? (
          <CheckCircle2 className="size-5 shrink-0" />
        ) : (
          <AlertTriangle className="size-5 shrink-0" />
        )}
        <p className="text-sm font-bold">
          {open ? t.admin.dash.storeOpen : t.admin.dash.storeClosed}
        </p>
      </div>

      {/* ---------- Kartu statistik ---------- */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon;
          const inner = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] leading-tight font-bold tracking-wide text-cocoa-400 uppercase">
                  {c.label}
                </p>
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${c.tone}`}>
                  <Icon className="size-4.5" />
                </span>
              </div>
              <p className="mt-3 font-display text-3xl font-extrabold text-cocoa-900 tabular">
                {c.value}
              </p>
              {c.sub ? <p className="mt-0.5 text-[11px] text-cocoa-400">{c.sub}</p> : null}
            </>
          );

          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="card p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              {inner}
            </Link>
          ) : (
            <div key={c.label} className="card p-4">
              {inner}
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* ---------- Pesanan terbaru ---------- */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between gap-3 border-b border-cocoa-100 px-5 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-cocoa-800">
              <ShoppingBag className="size-4.5 text-cocoa-400" />
              {t.admin.dash.recentOrders}
            </h2>
            <Link
              href="/admin/orders"
              className="inline-flex items-center gap-1 text-xs font-bold text-matcha-600 transition hover:text-matcha-700"
            >
              {t.admin.dash.viewAll}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {orders.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-cocoa-400">
              {t.admin.orders.noOrders}
            </p>
          ) : (
            <ul className="divide-y divide-cocoa-100">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/admin/orders?focus=${o.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-cocoa-50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-bold text-cocoa-800">
                          {o.order_code}
                        </span>
                        {o.status === "pending" ? (
                          <span className="chip bg-berry-500/10 !px-1.5 !py-0 !text-[9px] text-berry-600">
                            {t.admin.orders.newBadge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-cocoa-600">
                        {o.customer_name} ·{" "}
                        {o.items
                          .map((it) => `${it.quantity}× ${it.flavor_name}`)
                          .join(", ")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-cocoa-400">
                        {/* Tanggal, hari, dan jam lengkap */}
                        {formatFullDateTime(o.created_at, lang)}
                      </p>
                    </div>

                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-sm font-bold text-cocoa-800 tabular">
                        {formatIDR(o.total_price, lang)}
                      </p>
                      <p className="text-[11px] text-cocoa-400">
                        {formatRelative(o.created_at, lang)}
                      </p>
                    </div>

                    <StatusBadge
                      status={o.status}
                      label={statusLabel(o.status, lang)}
                      size="sm"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---------- Sisi kanan ---------- */}
        <div className="space-y-6">
          {/* Batch pre-order */}
          <div className="card">
            <div className="flex items-center gap-2 border-b border-cocoa-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-cocoa-800">
                <Layers className="size-4.5 text-matcha-600" />
                {t.admin.dash.batchTitle}
              </h2>
            </div>

            {openBatch ? (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-lg font-extrabold text-cocoa-900">
                    {openBatch.label}
                  </p>
                  <span className="chip bg-matcha-100 text-matcha-700">
                    {t.admin.dash.batchOpen}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-cocoa-50 p-2.5">
                    <dt className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {t.admin.dash.orders}
                    </dt>
                    <dd className="mt-0.5 text-lg font-extrabold text-cocoa-900 tabular">
                      {openBatch.order_count}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-cocoa-50 p-2.5">
                    <dt className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {t.common.qty}
                    </dt>
                    <dd className="mt-0.5 text-lg font-extrabold text-cocoa-900 tabular">
                      {openBatch.item_count}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-cocoa-50 p-2.5">
                    <dt className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {t.common.total}
                    </dt>
                    <dd className="mt-0.5 text-sm font-extrabold text-cocoa-900 tabular">
                      {formatIDR(openBatch.revenue, lang)}
                    </dd>
                  </div>
                </dl>
                <Link
                  href="/admin/batch"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-matcha-600 transition hover:text-matcha-700"
                >
                  {t.admin.dash.viewBatch}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-cocoa-400">
                {t.admin.dash.noBatch}
              </p>
            )}
          </div>

          {/* Stok global */}
          <div className="card">
            <div className="flex items-center gap-2 border-b border-cocoa-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-cocoa-800">
                <PackageCheck className="size-4.5 text-cocoa-400" />
                {t.admin.dash.stockTitle}
              </h2>
            </div>
            <div className="px-5 py-4">
              {stats.stock_enabled ? (
                <>
                  <p className="font-display text-3xl font-extrabold text-cocoa-900 tabular">
                    {stats.total_stock}
                    <span className="ml-1.5 text-sm font-bold text-cocoa-400">
                      {t.admin.dash.pcsLeft}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-cocoa-400">
                    {t.admin.dash.stockUsed.replace("{n}", String(stats.stock_used))}
                  </p>
                  <p className="mt-2 text-xs text-cocoa-500">
                    {t.admin.dash.stockAllFlavors}
                  </p>
                  <div className="mt-3">
                    <Link
                      href="/admin/menu"
                      className="text-xs font-bold text-matcha-600 transition hover:text-matcha-700"
                    >
                      {t.admin.dash.manageStock} →
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-matcha-700">
                    {t.admin.menu.noStock}
                  </p>
                  <p className="mt-1 text-xs text-cocoa-400">
                    {t.admin.dash.stockUnlimited}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Pendapatan bulan ini + terlaris */}
          <div className="card">
            <div className="border-b border-cocoa-100 px-5 py-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-cocoa-800">
                <TrendingUp className="size-4.5 text-matcha-600" />
                {t.admin.dash.month}
              </h2>
              <p className="mt-1 font-display text-2xl font-extrabold text-cocoa-900 tabular">
                {formatIDR(stats.revenue_month, lang)}
              </p>
            </div>

            <div className="px-5 py-4">
              <h3 className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                {t.admin.dash.topSellers}
              </h3>
              {stats.sales_by_flavor.length === 0 ? (
                <p className="mt-2 text-sm text-cocoa-400">
                  {t.admin.dash.topSellersEmpty}
                </p>
              ) : (
                <ul className="mt-3 space-y-2.5">
                  {stats.sales_by_flavor.slice(0, 5).map((s) => {
                    const max = stats.sales_by_flavor[0]?.qty || 1;
                    return (
                      <li key={s.flavor_name}>
                        <div className="flex items-center justify-between gap-3 text-[13px]">
                          <span className="min-w-0 truncate font-semibold text-cocoa-700">
                            {s.flavor_name}
                          </span>
                          <span className="shrink-0 font-bold text-cocoa-800 tabular">
                            {s.qty}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cocoa-100">
                          <div
                            className="h-full rounded-full bg-matcha-500 transition-all"
                            style={{ width: `${Math.max(6, (s.qty / max) * 100)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
