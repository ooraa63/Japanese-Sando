import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAdmin, getIsAdmin } from "@/lib/supabase/server";
import { getI18nDict } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { AdminShell } from "@/components/admin/AdminShell";
import { DEFAULT_STORE_NAME } from "@/lib/brand";
import { labelPerMenu } from "@/lib/admin-labels";

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
        viewSite: dicts.admin.nav.viewSite,
        signOut: dicts.admin.login.signOut,
      }}
      appLabels={dicts.admin.apps}
      sectionLabels={dicts.admin.sections}
      itemLabels={labelPerMenu(dicts)}
      allAppsLabel={dicts.admin.launcher.allApps}
    >
      {children}
    </AdminShell>
  );
}