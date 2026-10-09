import type { Metadata } from "next";
import { getSettingsAction } from "@/app/admin/actions";
import { getActiveFlavors, getSettings } from "@/lib/data";
import { SettingsClient } from "@/components/admin/SettingsClient";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Settings", robots: { index: false, follow: false } };
}

export default async function AdminSettingsPage() {
  // Daftar produk ikut diambil karena tab "Beranda" memakai pemilih produk
  // untuk section Populer & Terlaris (maksimal 3 per section).
  const [res, fallback, flavors] = await Promise.all([
    getSettingsAction(),
    getSettings(),
    getActiveFlavors(),
  ]);
  const settings = (res.data ?? fallback ?? null) as StoreSettings | null;

  // Blok "Zona Pengiriman" TIDAK lagi ada di sini — sudah pindah ke menu
  // "Catatan Pengambilan & Pengiriman" (/admin/pickup-delivery) sesuai item 10
  // dokumen "Perbaikan Ruma Komugi 2".
  return <SettingsClient initialSettings={settings} flavors={flavors} />;
}
