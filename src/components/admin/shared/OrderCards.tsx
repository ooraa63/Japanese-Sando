"use client";

import { useState, useTransition } from "react";
import {
  Check,
  CheckCheck,
  ImageOff,
  Loader2,
  MessageCircle,
  Package,
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
  formatPickupDate,
  paymentLabel,
  statusLabel,
  waOrderLink,
} from "@/lib/utils";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { updateOrderStatusAction } from "@/app/admin/actions";
import { ProofViewer } from "@/components/admin/ProofViewer";

/**
 * Potongan tampilan "Pesanan" yang dipakai BERSAMA oleh dua tempat
 * (Steven 14-10-2026):
 *
 *   - `/admin/orders` (halaman Pesanan di sidebar)
 *   - tab Pesanan di `/admin/po/[id]` (detail batch)
 *
 *
 * Sebelumnya tiap tab batch menulis ulang tabel sendiri yang jauh lebih
 * sulit dibaca (text 11px, tombol ikon tanpa label). Steven minta "saya mau
 * seperti yang gambar 3" — jadi sekarang dua-duanya render komponen yang
 * sama, dan perbedaannya cuma sumber datanya (semua pesanan vs satu batch).
 */

/** Chip filter status, sama persis dengan yang di halaman Pesanan. */
export const ORDER_FILTERS: Array<{
  key: OrderStatus | "all";
  labelId: string;
  labelEn: string;
}> = [
  { key: "all", labelId: "Semua", labelEn: "All" },
  { key: "pending", labelId: "Menunggu", labelEn: "Pending" },
  { key: "accepted", labelId: "Diterima", labelEn: "Accepted" },
  { key: "ready", labelId: "Siap", labelEn: "Ready" },
  { key: "delivered", labelId: "Selesai", labelEn: "Done" },
  { key: "rejected", labelId: "Ditolak", labelEn: "Rejected" },
];

/** Ikon + warna tombol untuk tiap perpindahan status. */
export function useOrderActionMeta(): Record<
  string,
  { key: string; icon: React.ReactNode; tone: string; confirm: string }
> {
  const { t } = useI18n();
  return {
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
}

export function OrderStatusChips({
  counts,
  value,
  onChange,
}: {
  counts: Record<string, number>;
  value: OrderStatus | "all";
  onChange: (next: OrderStatus | "all") => void;
}) {
  const { lang } = useI18n();
  return (
    <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {ORDER_FILTERS.map((f) => {
        const active = value === f.key;
        const count = counts[f.key] ?? 0;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
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
  );
}

/** Hitung jumlah pesanan per status (untuk angka di chip filter). */
export function orderCounts(orders: Order[]): Record<string, number> {
  const map: Record<string, number> = { all: orders.length };
  for (const o of orders) map[o.status] = (map[o.status] ?? 0) + 1;
  return map;
}

export function OrderCards({
  orders,
  busyId,
  onChangeStatus,
  onOpen,
}: {
  orders: Order[];
  busyId: number | null;
  onChangeStatus: (order: Order, next: OrderStatus) => void;
  onOpen: (order: Order) => void;
}) {
  const { t, lang } = useI18n();
  const actionMeta = useOrderActionMeta();

  return (
    <ul className="space-y-3">
      {orders.map((o) => {
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
              <button type="button" onClick={() => onOpen(o)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-extrabold text-cocoa-900">
                    {o.order_code}
                  </span>
                  <StatusBadge status={o.status} label={statusLabel(o.status, lang)} size="sm" />
                  {o.status === "pending" ? (
                    <span className="chip bg-berry-500/10 !px-1.5 !py-0 !text-[9px] text-berry-600">
                      {t.admin.orders.newBadge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-1.5 text-base font-bold text-cocoa-700">
                  {o.customer_name}{" "}
                  <span className="font-normal text-cocoa-500" dir="ltr">
                    · {formatPhone(o.phone)}
                  </span>
                </p>

                <p className="mt-1 line-clamp-2 text-sm text-cocoa-600">
                  {o.items.map((i) => `${i.quantity}× ${i.flavor_name}`).join(", ")}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-cocoa-500">
                  <span className="font-semibold text-cocoa-500" title={t.admin.orders.createdFull}>
                    {formatFullDateTime(o.created_at, lang)}
                  </span>
                  <span>·</span>
                  <span>{paymentLabel(o.payment_method, lang)}</span>
                  <span>·</span>
                  <span className={o.delivery_method === "delivery" ? "text-honey-500" : ""}>
                    {deliveryLabel(o.delivery_method, lang)}
                  </span>
                  {o.payment_proof_path ? (
                    <>
                      <span>·</span>
                      <span className="text-matcha-600">{t.admin.orders.viewProof}</span>
                    </>
                  ) : null}
                  {o.pickup_date ? (
                    <>
                      <span>·</span>
                      <span className="font-bold text-cocoa-700">
                        {t.admin.orders.pickupDate}:{" "}
                        {formatPickupDate(o.pickup_date, lang)}
                      </span>
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
                    const meta = actionMeta[next];
                    if (!meta) return null;
                    return (
                      <button
                        key={next}
                        type="button"
                        disabled={busy}
                        onClick={() => onChangeStatus(o, next)}
                        className={`${meta.tone} !px-3 !py-2 !text-[12px]`}
                        title={meta.confirm}
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
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Modal detail satu pesanan (klik kode / nama di kartu).
 *
 * Note state dan tombol simpan-catatan ADA DI DALAM komponen ini
 * supaya halaman sidebar dan tab batch punya perilaku yang sama persis.
 */
export function OrderDetailModal({
  order,
  busyId,
  onChangeStatus,
  onClose,
  onSaved,
}: {
  order: Order | null;
  busyId: number | null;
  onChangeStatus: (order: Order, next: OrderStatus) => void;
  onClose: () => void;
  onSaved: (orderId: number, patch: Partial<Order>) => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [viewingProof, setViewingProof] = useState<Order | null>(null);
  const [note, setNote] = useState("");
  // Sinkronkan textarea tiap kali pesanan yang dibuka berubah.
  const [noteFor, setNoteFor] = useState<number | null>(null);
  if (order && noteFor !== order.id) {
    setNoteFor(order.id);
    setNote(order.admin_note ?? "");
  }
  const actionMeta = useOrderActionMeta();

  function saveNote() {
    if (!order) return;
    startTransition(async () => {
      const res = await updateOrderStatusAction(order.id, order.status, note);
      if (res.ok) {
        onSaved(order.id, { admin_note: note });
        toast.success(t.admin.orders.noteSaved);
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  return (
    <>
      <Modal
        open={Boolean(order)}
        onClose={onClose}
        title={order ? order.order_code : ""}
        size="lg"
        footer={
          order ? (
            <>
              <a
                href={waOrderLink(order.phone, order, lang)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
              >
                <MessageCircle className="size-4" />
                {t.admin.orders.callCustomer}
              </a>
              <div className="flex-1" />
              {ADMIN_TRANSITIONS[order.status].map((next) => {
                const meta = actionMeta[next];
                if (!meta) return null;
                return (
                  <button
                    key={next}
                    type="button"
                    disabled={busyId === order.id}
                    onClick={() => onChangeStatus(order, next)}
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
        {order ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StatusBadge status={order.status} label={statusLabel(order.status, lang)} />
              <p className="text-[11px] text-cocoa-400">
                {t.track.placedOn} {formatFullDateTime(order.created_at, lang)}
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label={t.order.review.nameLabel} value={order.customer_name} />
              <Field
                label={t.order.review.phoneLabel}
                value={<span dir="ltr">{formatPhone(order.phone)}</span>}
              />
              <Field
                label={t.order.review.paymentLabel}
                value={
                  paymentLabel(order.payment_method, lang) +
                  (order.transfer_method ? ` · ${order.transfer_method}` : "")
                }
              />
              <Field
                label={t.order.review.deliveryLabel}
                value={deliveryLabel(order.delivery_method, lang)}
              />
              {order.address ? (
                <Field label={t.order.payment.address} value={order.address} full />
              ) : null}
              {order.note ? <Field label={t.common.note} value={order.note} full /> : null}
            </dl>

            {/* Bukti bayar */}
            <div>
              <h3 className="mb-2 text-sm font-bold text-cocoa-800">{t.admin.orders.viewProof}</h3>
              {order.payment_proof_path ? (
                <button
                  type="button"
                  onClick={() => setViewingProof(order)}
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
                      {order.payment_proof_path}
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
                {order.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <span className="text-cocoa-700">
                      {i.quantity}× {i.flavor_name}
                    </span>
                    <span className="tabular text-cocoa-500">{formatIDR(i.line_total, lang)}</span>
                  </li>
                ))}
                {order.delivery_fee > 0 ? (
                  <li className="flex justify-between gap-4 px-4 py-2.5 text-sm text-cocoa-600">
                    <span>{t.order.review.deliveryFee}</span>
                    <span className="tabular">{formatIDR(order.delivery_fee, lang)}</span>
                  </li>
                ) : null}
                <li className="flex justify-between gap-4 bg-cocoa-50 px-4 py-2.5 text-sm font-bold text-cocoa-900">
                  <span>{t.common.total}</span>
                  <span className="tabular">{formatIDR(order.total_price, lang)}</span>
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
                disabled={pending || note === (order.admin_note ?? "")}
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
    </>
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