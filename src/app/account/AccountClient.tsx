"use client";

import { useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, LogOut, Save } from "lucide-react";
import type { CustomerOrderSummary, CustomerProfile } from "@/lib/types";
import type { Dict } from "@/lib/i18n/en";
import { useCustomerAuth } from "@/components/customer/CustomerAuthProvider";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  signOutCustomerAction,
  updateCustomerProfileAction,
  type CustomerActionResult,
} from "@/app/account/actions";
import { formatDateTime, formatIDR } from "@/lib/utils";

type AccountDict = Dict["account"];

export function AccountClient({
  initialProfile,
  initialOrders,
  dict,
}: {
  initialProfile: CustomerProfile;
  initialOrders: CustomerOrderSummary[];
  dict: AccountDict;
}) {
  const { profile: liveProfile, refresh } = useCustomerAuth();
  const profile = liveProfile ?? initialProfile;
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Pesanan dipisah dua: yang masih berjalan vs yang sudah selesai.
  const activeOrders = initialOrders.filter((o) => !isFinished(o.status));
  const historyOrders = initialOrders.filter((o) => isFinished(o.status));

  function onSubmitProfile(formData: FormData) {
    startTransition(async () => {
      const result: CustomerActionResult = await updateCustomerProfileAction(
        null,
        formData
      );
      if (result.ok) {
        toast.success(dict.toast.updated, dict.toast.updatedDesc);
        await refresh();
        router.refresh();
      } else {
        toast.error(dict.toast.generic, result.error);
      }
    });
  }

  function onSignOut() {
    startTransition(async () => {
      await signOutCustomerAction();
      // Server action akan redirect, fallback untuk memastikan.
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* ===== Profile card ===== */}
      <section className="card p-6 sm:p-7">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-cocoa-900">{dict.profile.title}</h2>
          <button
            type="button"
            onClick={onSignOut}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full bg-cocoa-100 px-3 py-1.5 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-200"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <LogOut className="size-3.5" />
            )}
            {dict.signOut}
          </button>
        </div>
        <form action={onSubmitProfile} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
              {dict.profile.emailLabel}
            </p>
            <p className="mt-1 text-sm font-semibold text-cocoa-700" dir="ltr">
              {profile.email}
            </p>
          </div>
          <div>
            <label htmlFor="fullName" className="label">
              {dict.profile.fullName}
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              minLength={2}
              maxLength={80}
              defaultValue={profile.full_name}
              className="input"
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="phone" className="label">
              {dict.profile.phone}
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              required
              defaultValue={profile.phone}
              className="input tabular"
              autoComplete="tel"
            />
          </div>
          <div>
            <label htmlFor="dateOfBirth" className="label">
              {dict.profile.dateOfBirth}
            </label>
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={profile.date_of_birth ?? ""}
              max={new Date().toISOString().slice(0, 10)}
              className="input"
              autoComplete="bday"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="instagram" className="label">
              {dict.profile.instagram}
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-bold text-cocoa-400">
                @
              </span>
              <input
                id="instagram"
                name="instagram"
                type="text"
                defaultValue={profile.instagram ?? ""}
                className="input pl-10"
                autoComplete="off"
              />
            </div>
          </div>
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            <button type="submit" disabled={pending} className="btn-primary">
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {pending ? dict.profile.saving : dict.profile.save}
            </button>
          </div>
        </form>
      </section>

      {/* ===== Pesanan =====
          Dibagi dua bagian (permintaan Steven, 10-10-2026):
          "Sedang diproses" = pre-order yang belum diterima, dan
          "Riwayat" = yang sudah selesai. Yang selesai = sudah diantar atau
          dibatalkan. */}
      <section className="space-y-8">
        <OrderGroup
          title={dict.orders.activeTitle}
          hint={dict.orders.activeHint}
          orders={activeOrders}
          emptyText={dict.orders.activeEmpty}
          dict={dict}
        />
        <OrderGroup
          title={dict.orders.historyTitle}
          hint={dict.orders.historyHint}
          orders={historyOrders}
          emptyText={dict.orders.historyEmpty}
          dict={dict}
        />
      </section>
    </div>
  );
}

/**
 * Status yang menandai pesanan sudah selesai: diterima (delivered) atau
 * dibatalkan (cancelled). Selain itu masih berjalan.
 */
function isFinished(status: string) {
  return status === "delivered" || status === "cancelled";
}

function OrderGroup({
  title,
  hint,
  orders,
  emptyText,
  dict,
}: {
  title: string;
  hint: string;
  orders: CustomerOrderSummary[];
  emptyText: string;
  dict: AccountDict;
}) {
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-lg font-bold text-cocoa-900">{title}</h2>
        <p className="mt-0.5 text-xs text-cocoa-400">{hint}</p>
      </div>

      {orders.length === 0 ? (
        <div className="card p-6 text-center text-sm text-cocoa-400">
          <p>{emptyText}</p>
          {title === dict.orders.activeTitle ? (
            <Link href="/order" className="btn-primary mt-4 inline-flex">
              {dict.orders.newOrder}
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} dict={dict} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderRow({
  order,
  dict,
}: {
  order: CustomerOrderSummary;
  dict: AccountDict;
}) {
  const t = useMemo(
    () => ({
      total: formatIDR(order.total_price, order.language),
      date: formatDateTime(order.created_at, order.language),
      method:
        order.delivery_method === "delivery"
          ? dict.orders.delivery
          : dict.orders.pickup,
      statusLabel:
        dict.statuses[order.status as keyof typeof dict.statuses] ?? order.status,
    }),
    [order, dict]
  );
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-base font-extrabold text-cocoa-900">
            {order.order_code}
          </p>
          <p className="mt-0.5 text-xs text-cocoa-400">{t.date}</p>
        </div>
        <StatusBadge status={order.status} label={t.statusLabel} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <Row label={dict.orders.items} value={`${order.item_count}`} />
        <Row label={dict.orders.method} value={t.method} />
        <Row label={dict.orders.total} value={t.total} bold />
      </dl>
      <div className="mt-4 flex justify-end">
        <Link
          href={`/track?code=${encodeURIComponent(order.order_code)}`}
          className="text-sm font-bold text-matcha-700 underline-offset-2 hover:underline"
        >
          {dict.orders.detail} →
        </Link>
      </div>
    </li>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-cocoa-400">{label}</dt>
      <dd
        className={`min-w-0 text-right break-words ${
          bold ? "font-bold text-cocoa-900" : "font-semibold text-cocoa-700"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}