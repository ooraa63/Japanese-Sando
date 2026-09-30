import type { Metadata } from "next";
import { getSettings } from "@/lib/data";
import { getDashboardStatsAction, getOrdersAction } from "@/app/admin/actions";
import { DashboardClient } from "@/components/admin/DashboardClient";
import type { DashboardStats, Order } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Dashboard", robots: { index: false, follow: false } };
}

export default async function AdminDashboardPage() {
  const [statsRes, ordersRes, settings] = await Promise.all([
    getDashboardStatsAction(),
    getOrdersAction(null, "", 8, 0),
    getSettings(),
  ]);

  const stats: DashboardStats = statsRes.data ?? {
    pending_orders: 0,
    accepted_orders: 0,
    ready_orders: 0,
    total_orders: 0,
    revenue_today: 0,
    orders_today: 0,
    revenue_month: 0,
    flavor_count: 0,
    low_stock: [],
    sales_by_flavor: [],
  };
  const orders: Order[] = ordersRes.data?.orders ?? [];

  return (
    <DashboardClient
      initialStats={stats}
      initialOrders={orders}
      isPreorderOpen={settings?.is_preorder_open ?? true}
    />
  );
}
