import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentAdmin, getIsAdmin } from "@/lib/supabase/server";
import { getI18nDict } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { AdminShell } from "@/components/admin/AdminShell";
import { DEFAULT_STORE_NAME } from "@/lib/brand";
import { ADMIN_APPS } from "@/lib/admin-nav";

export const dynamic = "force-dynamic";

/**
 * Label tiap menu sidebar, diindeks dengan kunci yang sama seperti di
 * `ADMIN_APPS`: `href`, ditambah `?tab=` kalau menunya salah satu tab
 * `/admin/settings`.
 *
 * Dijumlahkan dari daftar aplikasi, bukan ditulis manual satu per satu, supaya
 * kalau satu menu baru ditambah di `admin-nav.ts` nav-nya ikut muncul —
 * tanpa risiko sidebar dan launcher tidak sinkron.
 */
function labelPerMenu(dicts: Awaited<ReturnType<typeof getI18nDict>>) {
  const n = dicts.admin.nav;
  const perApp = {
    orders: { "/admin/orders": n.orders, "/admin/po": n.poBatch },
    business: { "/admin/dashboard": n.dashboard, "/admin/sales": n.salesReport },
    catalog: { "/admin/menu": n.menuCatalog, "/admin/pickup-delivery": n.pickupDelivery },
    identity: {
      "/admin/settings?tab=identity": n.identityTab,
      "/admin/settings?tab=hours": n.hoursTab,
      "/admin/profile-menu": n.profileMenu,
      "/admin/announcements": n.announcements,
    },
    customers: { "/admin/customers": n.customers, "/admin/reviews": n.reviews },
    settings: {
      "/admin/settings?tab=payment": n.paymentTab,
      "/admin/settings?tab=availability": n.availabilityTab,
      "/admin/settings?tab=home": n.homeTab,
      "/admin/settings?tab=admin": n.adminAccountTab,
    },
  } as const;

  const out: Record<string, string> = {};
  for (const app of ADMIN_APPS) {
    const peta = perApp[app.id as keyof typeof perApp] as Record<string, string>;
    for (const item of app.items) {
      const kunci = item.tab ? `${item.href}?tab=${item.tab}` : item.href;
      out[kunci] = peta[kunci] ?? kunci;
    }
  }
  return out;
}

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