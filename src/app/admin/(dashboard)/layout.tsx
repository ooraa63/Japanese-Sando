import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAdmin, getIsAdmin } from "@/lib/supabase/server";
import { getI18nDict } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { AdminShell } from "@/components/admin/AdminShell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const isAdmin = await getIsAdmin();
  if (!isAdmin) redirect("/admin/login");

  const [admin, dicts, settings] = await Promise.all([
    getCurrentAdmin(),
    getI18nDict(),
    getSettings(),
  ]);

  return (
    <AdminShell
      email={admin?.email ?? ""}
      fullName={admin?.full_name ?? ""}
      storeName={settings?.store_name || "Rumakomugi"}
      logoUrl={settings?.logo_url ?? null}
      labels={{
        dashboard: dicts.admin.nav.dashboard,
        orders: dicts.admin.nav.orders,
        menu: dicts.admin.nav.menu,
        customers: dicts.admin.nav.customers,
        announcements: dicts.admin.nav.announcements,
        settings: dicts.admin.nav.settings,
        sales: dicts.admin.nav.sales,
        vouchers: dicts.admin.nav.vouchers,
        viewSite: dicts.admin.nav.viewSite,
        signOut: dicts.admin.login.signOut,
      }}
    >
      {children}
    </AdminShell>
  );
}
