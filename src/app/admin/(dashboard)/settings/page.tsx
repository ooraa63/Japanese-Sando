import type { Metadata } from "next";
import { getSettingsAction } from "@/app/admin/actions";
import { getSettings } from "@/lib/data";
import { SettingsClient } from "@/components/admin/SettingsClient";
import type { StoreSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Settings", robots: { index: false, follow: false } };
}

export default async function AdminSettingsPage() {
  // Daftar produk TIDAK lagi diambil di sini. Tab "Beranda" dulu memakai
  // pemilih produk untuk section Populer & Terlaris; keduanya sudah dihapus
  // dari beranda (permintaan Steven 12-10-2026), jadi pemicunya ikut dibuang.
  const [res, fallback] = await Promise.all([
    getSettingsAction(),
    getSettings(),
  ]);
  const settings = (res.data ?? fallback ?? null) as StoreSettings | null;

  // Blok "Zona Pengiriman" TIDAK lagi ada di sini — sudah pindah ke menu
  // "Catatan Pengambilan & Pengiriman" (/admin/pickup-delivery) sesuai item 10
  // dokumen "Perbaikan Ruma Komugi 2".
  return <SettingsClient initialSettings={settings} />;
}
