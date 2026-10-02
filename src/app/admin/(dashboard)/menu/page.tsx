import type { Metadata } from "next";
import { getAllFlavors, getSettings } from "@/lib/data";
import { getCategoriesAction } from "@/app/admin/actions";
import { MenuClient } from "@/components/admin/MenuClient";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Menu & stock", robots: { index: false, follow: false } };
}

export default async function AdminMenuPage() {
  const [flavors, settings, categoriesRes] = await Promise.all([
    getAllFlavors(),
    getSettings(),
    getCategoriesAction(),
  ]);

  return (
    <MenuClient
      initialFlavors={flavors}
      initialCategories={categoriesRes.data ?? []}
      initialSettings={settings as StoreSettings | null}
    />
  );
}
