import type { Metadata } from "next";
import { getPublicMenu, getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { OrderFlow } from "@/components/customer/OrderFlow";
import type { DeliveryZone, StoreSettings } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return {
    title: dicts.order.title,
    description: dicts.order.subtitle,
    robots: { index: false, follow: true },
  };
}

async function loadDeliveryZones(): Promise<DeliveryZone[]> {
  // Baca zona delivery terbaru dari tabel delivery_zones.
  // Kalau error/kosong, fallback ke zona default (Vihara, UVERS, Antar).
  const fallback: DeliveryZone[] = [
    {
      id: "vihara",
      name_id: "Vihara Tian En",
      name_en: "Vihara Tian En",
      fee: 10000,
      lat: -6.917,
      lng: 107.7,
      radius_km: 0.5,
      requires_address: false,
      sort_order: 1,
      is_active: true,
    },
    {
      id: "uvers",
      name_id: "UVERS",
      name_en: "UVERS",
      fee: 10000,
      lat: -6.917,
      lng: 107.6,
      radius_km: 0.5,
      requires_address: false,
      sort_order: 2,
      is_active: true,
    },
    {
      id: "antar",
      name_id: "Antar ke alamatmu",
      name_en: "Deliver to your location",
      fee: 5000,
      lat: null,
      lng: null,
      radius_km: null,
      requires_address: true,
      sort_order: 3,
      is_active: true,
    },
  ];
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc("list_active_zones");
    if (!data) return fallback;
    return (data as Array<{
      id: string;
      name_id: string;
      name_en: string;
      fee: number;
      lat: string | null;
      lng: string | null;
      radius_km: string | null;
      requires_address: boolean;
    }>).map((z) => ({
      id: z.id,
      name_id: z.name_id,
      name_en: z.name_en,
      fee: Number(z.fee),
      lat: z.lat ? Number(z.lat) : null,
      lng: z.lng ? Number(z.lng) : null,
      radius_km: z.radius_km ? Number(z.radius_km) : null,
      requires_address: z.requires_address,
    }));
  } catch {
    return fallback;
  }
}

export default async function OrderPage() {
  const [settings, menu, dicts, deliveryZones] = await Promise.all([
    getSettings(),
    getPublicMenu(),
    getI18nDict(),
    loadDeliveryZones(),
  ]);
  const categories = menu.categories;
  const bundles = menu.bundles;

  // Selalu mulai dari langkah identitas (nama + telepon), apa pun URL-nya.
  // Pembeli tidak bisa melompat ke langkah pembayaran/konfirmasi.

  const storeName = settings?.store_name ?? "Rumakomugi";
  const logoUrl = settings?.logo_url ?? null;
  const brandLine = settings?.brand_line ?? "";

  // Pengaturan belum dibuat di database — jangan sampai pembeli melihat form rusak
  if (!settings) {
    return (
      <>
        <SiteHeader storeName={storeName} logoUrl={logoUrl} brandLine={brandLine} />
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <p className="card p-10 text-cocoa-500">{dicts.errors.settings_missing}</p>
        </main>
        <SiteFooter settings={null} />
      </>
    );
  }

  return (
    <>
      <SiteHeader storeName={storeName} logoUrl={logoUrl} brandLine={brandLine} />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
            {dicts.order.title}
          </h1>
          <p className="mt-2 text-base text-cocoa-500">{dicts.order.subtitle}</p>
        </div>

        <OrderFlow
          categories={categories}
          bundles={bundles}
          settings={settings as StoreSettings}
          deliveryZones={deliveryZones}
          midtransReady={Boolean(process.env.MIDTRANS_SERVER_KEY)}
        />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
