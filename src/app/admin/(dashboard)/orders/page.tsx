import type { Metadata } from "next";
import { getOrdersAction } from "@/app/admin/actions";
import { OrdersClient } from "@/components/admin/OrdersClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Orders", robots: { index: false, follow: false } };
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; focus?: string }>;
}) {
  const { status: rawStatus, focus } = await searchParams;

  // "cancelled" tidak lagi dipakai penjual, tapi pesanan lama berstatus itu
  // masih bisa dibuka lewat URL supaya tidak hilang jejaknya.
  const validStatuses = [
    "pending",
    "accepted",
    "ready",
    "delivered",
    "rejected",
    "cancelled",
  ] as const;
  const status = validStatuses.includes(rawStatus as (typeof validStatuses)[number])
    ? (rawStatus as (typeof validStatuses)[number])
    : null;

  const ordersRes = await getOrdersAction(status, "", 100, 0);

  return (
    <OrdersClient
      initialOrders={ordersRes.data?.orders ?? []}
      initialStatus={status}
      focusId={focus ? Number(focus) : null}
    />
  );
}
