import type { Metadata } from "next";
import { getPublicMenu, getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { OrderFlow } from "@/components/customer/OrderFlow";
import type { StoreSettings } from "@/lib/types";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return {
    title: dicts.order.title,
    description: dicts.order.subtitle,
    robots: { index: false, follow: true },
  };
}

export default async function OrderPage() {
  const [settings, categories, dicts] = await Promise.all([
    getSettings(),
    getPublicMenu(),
    getI18nDict(),
  ]);

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
          <p className="mt-2 text-[15px] text-cocoa-500">{dicts.order.subtitle}</p>
        </div>

        <OrderFlow
          categories={categories}
          settings={settings as StoreSettings}
        />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
