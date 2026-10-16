import type { Metadata } from "next";
import { getAllFlavors, getBundleFeatures, getSettings } from "@/lib/data";
import { getBundlesAction, getCategoriesAction } from "@/app/admin/actions";
import { MenuClient } from "@/components/admin/MenuClient";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Menu & stock", robots: { index: false, follow: false } };
}

export default async function AdminMenuPage() {
  const [flavors, settings, categoriesRes, bundlesRes, features] = await Promise.all([
    getAllFlavors(),
    getSettings(),
    getCategoriesAction(),
    getBundlesAction(),
    getBundleFeatures(),
  ]);

  return (
    <MenuClient
      initialFlavors={flavors}
      initialCategories={categoriesRes.data ?? []}
      initialBundles={bundlesRes.data ?? []}
      initialSettings={settings as StoreSettings | null}
      canBundleChoices={features.choices}
    />
  );
}
