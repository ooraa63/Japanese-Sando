import type { Metadata } from "next";
import { getI18nDict } from "@/lib/i18n-server";
import { PickupDeliveryTabs } from "@/components/admin/PickupDeliveryTabs";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Pickup & Delivery",
    robots: { index: false, follow: false },
  };
}

/**
 * Menu admin "Catatan Pengambilan & Pengiriman".
 *
 * Dipisah dari `/admin/settings` sesuai item 10 dokumen "Perbaikan Ruma
 * Komugi 2". Dua tab: Ambil di toko (titik pengambilan + jam ambil) dan
 * Pengantaran (zona antaran + ongkir).
 */
export default async function AdminPickupDeliveryPage() {
  const dicts = await getI18nDict();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-cocoa-900">
          {dicts.admin.deliveryZones.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-cocoa-500">
          {dicts.admin.deliveryZones.pageSubtitle}
        </p>
      </header>

      <PickupDeliveryTabs />
    </div>
  );
}