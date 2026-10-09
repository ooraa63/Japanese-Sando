import type { Metadata } from "next";
import { getPublicMenu, getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { FavoritesClient } from "./FavoritesClient";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return {
    title: `${dicts.nav.favorites} | Ruma Komugi`,
    alternates: { canonical: "/favorites" },
  };
}

export default async function FavoritesPage() {
  const [menu, settings, dicts] = await Promise.all([
    getPublicMenu(),
    getSettings(),
    getI18nDict(),
  ]);

  return (
    <>
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main id="main" className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="font-display text-2xl font-extrabold text-cocoa-900">
          {dicts.nav.favorites}
        </h1>
        <p className="mt-1.5 mb-6 text-sm text-cocoa-500">
          {dicts.home.favSubtitle}
        </p>

        <FavoritesClient categories={menu.categories} />
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}