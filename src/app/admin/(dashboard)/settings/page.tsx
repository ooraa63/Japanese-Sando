import type { Metadata } from "next";
import { getSettingsAction } from "@/app/admin/actions";
import { getSettings } from "@/lib/data";
import { SettingsClient } from "@/components/admin/SettingsClient";
import { DeliveryZonesClient } from "@/components/admin/DeliveryZonesClient";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Settings", robots: { index: false, follow: false } };
}

export default async function AdminSettingsPage() {
  const [res, fallback] = await Promise.all([getSettingsAction(), getSettings()]);
  const settings = (res.data ?? fallback ?? null) as StoreSettings | null;

  return (
    <div className="space-y-8">
      <SettingsClient initialSettings={settings} />
      <DeliveryZonesClient />
    </div>
  );
}
