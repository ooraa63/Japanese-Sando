import type { Metadata } from "next";
import { getI18nDict } from "@/lib/i18n-server";
import { getAllFlavors } from "@/lib/data";
import { MenuClient } from "@/components/admin/MenuClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Menu & stock", robots: { index: false, follow: false } };
}

export default async function AdminMenuPage() {
  const dicts = await getI18nDict();
  const flavors = await getAllFlavors();

  return <MenuClient initialFlavors={flavors} labels={{ title: dicts.admin.nav.menu }} />;
}
