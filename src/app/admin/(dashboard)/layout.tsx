import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAdmin, getIsAdmin } from "@/lib/supabase/server";
import { getI18nDict } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { AdminShell } from "@/components/admin/AdminShell";
import { DEFAULT_STORE_NAME } from "@/lib/brand";

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
      storeName={settings?.store_name || DEFAULT_STORE_NAME}
      logoUrl={settings?.logo_url ?? null}
      labels={{
        dashboard: dicts.admin.nav.dashboard,
        // Steven 13-10-2026: bar "Batch" di sidebar menunjuk ke /admin/po.
        batch: dicts.admin.po.title,
        orders: dicts.admin.nav.orders,
        menu: dicts.admin.nav.menu,
        customers: dicts.admin.nav.customers,
        settings: dicts.admin.nav.settings,
        sales: dicts.admin.nav.sales,
        pickupDelivery: dicts.admin.nav.pickupDelivery,
        announcements: dicts.admin.announcements.title,
        profileMenu: dicts.admin.settings.profileMenuTitle,
        faq: dicts.admin.faq.title,
        terms: dicts.admin.terms.title,
        viewSite: dicts.admin.nav.viewSite,
        signOut: dicts.admin.login.signOut,
      }}
    >
      {children}
    </AdminShell>
  );
}
