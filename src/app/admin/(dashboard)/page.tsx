import type { Metadata } from "next";
import { getSettings } from "@/lib/data";
import { getDashboardStatsAction, getOrdersAction } from "@/app/admin/actions";
import { DashboardClient } from "@/components/admin/DashboardClient";
import type { DashboardStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Dashboard", robots: { index: false, follow: false } };
}

const EMPTY_STATS: DashboardStats = {
  pending_orders: 0,
  accepted_orders: 0,
  ready_orders: 0,
  total_orders: 0,
  revenue_today: 0,
  orders_today: 0,
  revenue_month: 0,
  flavor_count: 0,
  sales_by_flavor: [],
};

export default async function AdminDashboardPage() {
  const [statsRes, ordersRes, settings] = await Promise.all([
    getDashboardStatsAction(),
    getOrdersAction(null, "", 8, 0),
    getSettings(),
  ]);

  return (
    <DashboardClient
      initialStats={statsRes.data ?? EMPTY_STATS}
      initialOrders={ordersRes.data?.orders ?? []}
      isPreorderOpen={settings?.is_preorder_open ?? true}
    />
  );
}
