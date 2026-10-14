"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ClipboardList, Download, RefreshCw, Search } from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { getOrdersAction, updateOrderStatusAction } from "@/app/admin/actions";
import {
  OrderCards,
  OrderDetailModal,
  OrderStatusChips,
  orderCounts,
} from "@/components/admin/shared/OrderCards";

export function OrdersClient({
  initialOrders,
  initialStatus,
  focusId,
}: {
  initialOrders: Order[];
  initialStatus: OrderStatus | null;
  focusId: number | null;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<OrderStatus | "all">(initialStatus ?? "all");
  const [search, setSearch] = useState("");
  // Pesanan yang difokuskan dari dashboard langsung terbuka (tanpa efek).
  const [selected, setSelected] = useState<Order | null>(
    () => initialOrders.find((o) => o.id === focusId) ?? null
  );
  // `expanded` dihapus 13-10-2026 bersama tombol "Lihat pesanan".
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const load = useCallback(
    async (nextFilter: OrderStatus | "all", nextSearch: string) => {
      const res = await getOrdersAction(
        nextFilter === "all" ? null : nextFilter,
        nextSearch,
        100,
        0
      );
      if (res.ok && res.data) setOrders(res.data.orders);
    },
    []
  );

  // Pencarian dengan tundaan supaya tidak spam query
  useEffect(() => {
    const id = setTimeout(() => {
      void load(filter, search);
    }, 350);
    return () => clearTimeout(id);
  }, [search, filter, load]);

  function refresh() {
    startRefresh(async () => {
      await load(filter, search);
      toast.info(t.common.loading);
    });
  }

  const counts = useMemo(() => orderCounts(orders), [orders]);

  async function changeStatus(order: Order, next: OrderStatus) {
    setBusyId(order.id);
    const res = await updateOrderStatusAction(order.id, next, undefined);
    setBusyId(null);

    if (!res.ok) {
      const key = res.error as keyof typeof t.errors;
      toast.error(t.errors[key] ?? t.errors.generic);
      return;
    }

    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    setSelected((prev) => (prev && prev.id === order.id ? { ...prev, status: next } : prev));
    toast.success(t.admin.orders.actionDone);
  }

  function exportCsv() {
    const rows = orders;
    const header = [
      "order_code",
      "created_at",
      "status",
      "customer_name",
      "phone",
      "items",
      "payment_method",
      "delivery_method",
      "subtotal",
      "delivery_fee",
      "total_price",
      "note",
    ];
    const body = rows.map((o) =>
      [
        o.order_code,
        o.created_at,
        o.status,
        o.customer_name,
        o.phone,
        o.items.map((i) => `${i.quantity}x ${i.flavor_name}`).join(" | "),
        o.payment_method,
        o.delivery_method,
        o.subtotal,
        o.delivery_fee,
        o.total_price,
        `"${(o.note ?? "").replace(/"/g, "'")}"`,
      ].join(",")
    );

    const blob = new Blob([`﻿${[header.join(","), ...body].join("\n")}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pesanan-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.orders.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{t.admin.orders.subtitle}</p>
        </div>
        <div className="flex gap-2">
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
            onClick={exportCsv}
            disabled={orders.length === 0}
            className="btn-outline !px-4 !py-2.5"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">{t.admin.orders.exportCsv}</span>
          </button>
        </div>
      </div>

      {/* ---------- Filter ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <OrderStatusChips counts={counts} value={filter} onChange={setFilter} />

        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
          <input
            className="input !py-2.5 pl-10"
            placeholder={t.admin.orders.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
          />
        </div>
      </div>

      {/* ---------- Daftar pesanan ---------- */}
      {orders.length === 0 ? (
        <div className="card p-14 text-center">
          <ClipboardList className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">
            {search || filter !== "all" ? t.admin.orders.empty : t.admin.orders.noOrders}
          </p>
        </div>
      ) : (
        <OrderCards
          orders={orders}
          busyId={busyId}
          onChangeStatus={changeStatus}
          onOpen={setSelected}
        />
      )}

      <OrderDetailModal
        order={selected}
        busyId={busyId}
        onChangeStatus={changeStatus}
        onClose={() => setSelected(null)}
        onSaved={(orderId, patch) => {
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o))
          );
          setSelected((prev) => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
        }}
      />
    </div>
  );
}