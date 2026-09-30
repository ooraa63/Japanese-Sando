import { Suspense } from "react";
import type { Metadata } from "next";
import { getActiveFlavors, getSettings } from "@/lib/data";
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
  const [settings, flavors, dicts] = await Promise.all([
    getSettings(),
    getActiveFlavors(),
    getI18nDict(),
  ]);

  // Pengaturan belum dibuat di database — jangan sampai pembeli melihat form rusak
  if (!settings) {
    return (
      <>
        <SiteHeader />
        <main className="mx-auto max-w-lg px-4 py-20 text-center">
          <p className="card p-10 text-cocoa-500">{dicts.errors.settings_missing}</p>
        </main>
        <SiteFooter settings={null} />
      </>
    );
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
            {dicts.order.title}
          </h1>
          <p className="mt-2 text-[15px] text-cocoa-500">{dicts.order.subtitle}</p>
        </div>

        <Suspense fallback={<OrderSkeleton />}>
          <OrderFlow flavors={flavors} settings={settings as StoreSettings} />
        </Suspense>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}

function OrderSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="card h-80 animate-pulse bg-cocoa-100/50" />
      <div className="card h-56 animate-pulse bg-cocoa-100/50" />
    </div>
  );
}
