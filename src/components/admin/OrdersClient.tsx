"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Check,
  CheckCheck,
  ChevronDown,
  ClipboardList,
  Download,
  ImageOff,
  Loader2,
  MessageCircle,
  Package,
  RefreshCw,
  RotateCcw,
  Search,
  StickyNote,
  X,
} from "lucide-react";
import type { Order, OrderStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import {
  ADMIN_TRANSITIONS,
  deliveryLabel,
  formatFullDateTime,
  formatIDR,
  formatPhone,
  paymentLabel,
  statusLabel,
  waOrderLink,
} from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { getOrdersAction, updateOrderStatusAction } from "@/app/admin/actions";
import { ProofViewer } from "@/components/admin/ProofViewer";
import { OrderRow } from "@/components/admin/OrderRow";

const FILTERS: Array<{ key: OrderStatus | "all"; labelId: string; labelEn: string }> = [
  { key: "all", labelId: "Semua", labelEn: "All" },
  { key: "pending", labelId: "Menunggu", labelEn: "Pending" },
  { key: "accepted", labelId: "Diterima", labelEn: "Accepted" },
  { key: "ready", labelId: "Siap", labelEn: "Ready" },
  { key: "delivered", labelId: "Selesai", labelEn: "Done" },
  { key: "rejected", labelId: "Ditolak", labelEn: "Rejected" },
];

export function OrdersClient({
  initialOrders,
  initialStatus,
  focusId,
}: {
  initialOrders: Order[];
  initialStatus: OrderStatus | null;
  focusId: number | null;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();

  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<OrderStatus | "all">(initialStatus ?? "all");
  const [search, setSearch] = useState("");
  // Pesanan yang difokuskan dari dashboard langsung terbuka (tanpa efek).
  const [selected, setSelected] = useState<Order | null>(
    () => initialOrders.find((o) => o.id === focusId) ?? null
  );
  const [note, setNote] = useState(() => initialOrders.find((o) => o.id === focusId)?.admin_note ?? "");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [pending, startPending] = useTransition();
  const [viewingProof, setViewingProof] = useState<Order | null>(null);

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

  const counts = useMemo(() => {
    const map: Record<string, number> = { all: orders.length };
    for (const o of orders) map[o.status] = (map[o.status] ?? 0) + 1;
    return map;
  }, [orders]);

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

  function saveNote() {
    if (!selected) return;
    startPending(async () => {
      const res = await updateOrderStatusAction(
        selected.id,
        selected.status,
        note
      );
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === selected.id ? { ...o, admin_note: note } : o))
        );
        setSelected((prev) => (prev ? { ...prev, admin_note: note } : prev));
        toast.success(t.admin.orders.noteSaved);
      } else {
        toast.error(t.errors.generic);
      }
    });
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

  const statusActionMeta: Partial<
    Record<OrderStatus, { key: string; icon: React.ReactNode; tone: string; confirm: string }>
  > = {
    accepted: {
      key: "accept",
      icon: <Check className="size-4" />,
      tone: "btn-matcha",
      confirm: t.admin.orders.acceptConfirm,
    },
    ready: {
      key: "ready",
      icon: <Package className="size-4" />,
      tone: "btn-primary",
      confirm: t.admin.orders.readyConfirm,
    },
    delivered: {
      key: "deliver",
      icon: <CheckCheck className="size-4" />,
      tone: "btn-matcha",
      confirm: t.admin.orders.deliverConfirm,
    },
    rejected: {
      key: "reject",
      icon: <X className="size-4" />,
      tone: "btn-danger",
      confirm: t.admin.orders.rejectConfirm,
    },
    pending: {
      key: "undo",
      icon: <RotateCcw className="size-4" />,
      tone: "btn-ghost",
      confirm: t.admin.orders.undoConfirm,
    },
  };

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
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            const count = counts[f.key] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`chip shrink-0 transition ${
                  active
                    ? "bg-cocoa-800 text-cream-50"
                    : "border border-cocoa-200 bg-white text-cocoa-500 hover:border-cocoa-300"
                }`}
              >
                {lang === "en" ? f.labelEn : f.labelId}
                {count > 0 ? (
                  <span
                    className={`rounded-full px-1.5 py-px text-[10px] tabular ${
                      active ? "bg-cream-50/20" : "bg-cocoa-100"
                    }`}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

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
        <ul className="space-y-3">
          {orders.map((o) => {
            const open = expanded.has(o.id);
            const actions = ADMIN_TRANSITIONS[o.status];
            const busy = busyId === o.id;

            return (
              <li
                key={o.id}
                className={`card overflow-hidden transition ${
                  o.status === "pending" ? "ring-2 ring-honey-300/60" : ""
                }`}
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4">
                  {/* Info utama */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(o);
                      setNote(o.admin_note ?? "");
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-cocoa-900">
                        {o.order_code}
                      </span>
                      <StatusBadge
                        status={o.status}
                        label={statusLabel(o.status, lang)}
                        size="sm"
                      />
                      {o.status === "pending" ? (
                        <span className="chip bg-berry-500/10 !px-1.5 !py-0 !text-[9px] text-berry-600">
                          {t.admin.orders.newBadge}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-1 text-sm font-bold text-cocoa-700">
                      {o.customer_name}{" "}
                      <span className="font-normal text-cocoa-400" dir="ltr">
                        · {formatPhone(o.phone)}
                      </span>
                    </p>

                    <p className="mt-1 line-clamp-2 text-[13px] text-cocoa-500">
                      {o.items.map((i) => `${i.quantity}× ${i.flavor_name}`).join(", ")}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-cocoa-400">
                      {/* Hari, tanggal, dan jam lengkap */}
                      <span className="font-semibold text-cocoa-500" title={t.admin.orders.createdFull}>
                        {formatFullDateTime(o.created_at, lang)}
                      </span>
                      <span>·</span>
                      <span>{paymentLabel(o.payment_method, lang)}</span>
                      <span>·</span>
                      <span className={o.delivery_method === "delivery" ? "text-honey-500" : ""}>
                        {deliveryLabel(o.delivery_method, lang)}
                      </span>
                      {o.batch_label ? (
                        <>
                          <span>·</span>
                          <span className="font-semibold text-matcha-600">
                            {o.batch_label}
                          </span>
                        </>
                      ) : null}
                      {o.payment_proof_path ? (
                        <>
                          <span>·</span>
                          <span className="text-matcha-600">{t.admin.orders.viewProof}</span>
                        </>
                      ) : null}
                    </div>
                  </button>

                  {/* Harga + aksi */}
                  <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-56 sm:items-end">
                    <p className="font-display text-xl font-extrabold text-cocoa-900 tabular">
                      {formatIDR(o.total_price, lang)}
                    </p>

                    <div className="flex flex-wrap justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setViewingProof(o)}
                        disabled={!o.payment_proof_path}
                        className="rounded-lg border border-cocoa-200 p-2 text-cocoa-500 transition hover:bg-cocoa-50 disabled:opacity-30"
                        title={o.payment_proof_path ? t.admin.orders.viewProof : t.admin.orders.noProof}
                        aria-label={t.admin.orders.viewProof}
                      >
                        {o.payment_proof_path ? (
                          <Search className="size-3.5" />
                        ) : (
                          <ImageOff className="size-3.5" />
                        )}
                      </button>

                      <a
                        href={waOrderLink(o.phone, o, lang)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg border border-matcha-300 bg-matcha-50 p-2 text-matcha-600 transition hover:bg-matcha-100"
                        title={t.admin.orders.callCustomer}
                        aria-label={t.admin.orders.callCustomer}
                      >
                        <MessageCircle className="size-3.5" />
                      </a>

                      {actions.map((next) => {
                        const meta = statusActionMeta[next];
                        if (!meta) return null;
                        return (
                          <button
                            key={next}
                            type="button"
                            disabled={busy}
                            onClick={() => changeStatus(o, next)}
                            className={`${meta.tone} !px-3 !py-2 !text-[12px]`}
                            title={t.admin.orders[meta.key as keyof typeof t.admin.orders] as string}
                          >
                            {busy ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <>
                                {meta.icon}
                                <span className="hidden sm:inline">
                                  {t.admin.orders[meta.key as keyof typeof t.admin.orders]}
                                </span>
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(o.id)) next.delete(o.id);
                          else next.add(o.id);
                          return next;
                        })
                      }
                      className="inline-flex items-center justify-center gap-1 text-[11px] font-bold text-cocoa-400 transition hover:text-cocoa-700"
                    >
                      {open ? t.admin.orders.hideItems : t.admin.orders.showItems}
                      <ChevronDown className={`size-3 transition ${open ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Rincian */}
                {open ? (
                  <div className="border-t border-cocoa-100 bg-cocoa-50/60 px-4 py-3.5">
                    <OrderRow order={o} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------- Detail ---------- */}
      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? selected.order_code : ""}
        size="lg"
        footer={
          selected ? (
            <>
              <a
                href={waOrderLink(selected.phone, selected, lang)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                <MessageCircle className="size-4" />
                {t.admin.orders.callCustomer}
              </a>
              <div className="flex-1" />
              {ADMIN_TRANSITIONS[selected.status].map((next) => {
                const meta = statusActionMeta[next];
                if (!meta) return null;
                return (
                  <button
                    key={next}
                    type="button"
                    disabled={busyId === selected.id}
                    onClick={() => changeStatus(selected, next)}
                    className={`${meta.tone} !px-4 !py-2.5`}
                  >
                    {meta.icon}
                    {t.admin.orders[meta.key as keyof typeof t.admin.orders]}
                  </button>
                );
              })}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={selected.status} label={statusLabel(selected.status, lang)} />
              <p className="text-[11px] text-cocoa-400">
                {t.track.placedOn} {formatFullDateTime(selected.created_at, lang)}
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label={t.order.review.nameLabel} value={selected.customer_name} />
              <Field
                label={t.order.review.phoneLabel}
                value={<span dir="ltr">{formatPhone(selected.phone)}</span>}
              />
              <Field
                label={t.order.review.paymentLabel}
                value={
                  paymentLabel(selected.payment_method, lang) +
                  (selected.transfer_method ? ` · ${selected.transfer_method}` : "")
                }
              />
              <Field
                label={t.order.review.deliveryLabel}
                value={deliveryLabel(selected.delivery_method, lang)}
              />
              {selected.batch_label ? (
                <Field label={t.admin.nav.batch} value={selected.batch_label} />
              ) : null}
              {selected.address ? (
                <Field label={t.order.payment.address} value={selected.address} full />
              ) : null}
              {selected.note ? <Field label={t.common.note} value={selected.note} full /> : null}
            </dl>

            {/* Bukti bayar */}
            <div>
              <h3 className="mb-2 text-sm font-bold text-cocoa-800">
                {t.admin.orders.viewProof}
              </h3>
              {selected.payment_proof_path ? (
                <button
                  type="button"
                  onClick={() => setViewingProof(selected)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-cocoa-200 bg-white p-3.5 text-left transition hover:border-matcha-400 hover:bg-matcha-50/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-matcha-100 text-matcha-600">
                    <Search className="size-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-cocoa-800">
                      {t.admin.orders.viewProof}
                    </span>
                    <span className="block truncate text-[11px] text-cocoa-400">
                      {selected.payment_proof_path}
                    </span>
                  </span>
                </button>
              ) : (
                <p className="flex items-center gap-2 rounded-xl bg-cocoa-50 p-3.5 text-sm text-cocoa-400">
                  <ImageOff className="size-4" />
                  {t.admin.orders.noProof}
                </p>
              )}
            </div>

            {/* Rincian item */}
            <div>
              <h3 className="mb-2 text-sm font-bold text-cocoa-800">
                {t.order.review.itemsLabel}
              </h3>
              <ul className="divide-y divide-cocoa-100 rounded-2xl border border-cocoa-200 bg-white">
                {selected.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <span className="text-cocoa-700">
                      {i.quantity}× {i.flavor_name}
                    </span>
                    <span className="tabular text-cocoa-500">
                      {formatIDR(i.line_total, lang)}
                    </span>
                  </li>
                ))}
                {selected.delivery_fee > 0 ? (
                  <li className="flex justify-between gap-4 px-4 py-2.5 text-sm text-cocoa-600">
                    <span>{t.order.review.deliveryFee}</span>
                    <span className="tabular">{formatIDR(selected.delivery_fee, lang)}</span>
                  </li>
                ) : null}
                <li className="flex justify-between gap-4 bg-cocoa-50 px-4 py-2.5 text-sm font-bold text-cocoa-900">
                  <span>{t.common.total}</span>
                  <span className="tabular">{formatIDR(selected.total_price, lang)}</span>
                </li>
              </ul>
            </div>

            {/* Catatan internal */}
            <div>
              <label htmlFor="admin-note" className="label flex items-center gap-1.5">
                <StickyNote className="size-3.5" />
                {t.admin.orders.adminNote}
              </label>
              <textarea
                id="admin-note"
                rows={2}
                className="input resize-none"
                placeholder={t.admin.orders.adminNotePlaceholder}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
              <button
                type="button"
                onClick={saveNote}
                disabled={pending || note === (selected.admin_note ?? "")}
                className="btn-outline mt-2 !py-2 !text-[13px]"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {t.common.save}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ProofViewer order={viewingProof} onClose={() => setViewingProof(null)} />
    </div>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold break-words text-cocoa-800">{value}</dd>
    </div>
  );
}
