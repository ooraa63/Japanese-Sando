import type { Metadata } from "next";
import { getSettingsAction } from "@/app/admin/actions";
import { getAllFlavors, getSettings } from "@/lib/data";
import { SettingsClient } from "@/components/admin/SettingsClient";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Settings", robots: { index: false, follow: false } };
}

export default async function AdminSettingsPage() {
  const [res, fallback, flavors] = await Promise.all([
    getSettingsAction(),
    getSettings(),
    getAllFlavors(),
  ]);
  const settings = (res.data ?? fallback ?? null) as StoreSettings | null;

  return <SettingsClient initialSettings={settings} initialFlavors={flavors} />;
}
