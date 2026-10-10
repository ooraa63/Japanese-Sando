import type { Metadata } from "next";
import { listProfileMenuItemsAction } from "@/app/admin/actions";
import { ProfileMenuClient } from "@/components/admin/ProfileMenuClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Menu Profil", robots: { index: false, follow: false } };
}

/**
 * Kelola bar menu sheet "Profil" yang muncul di aplikasi pembeli.
 * Data diambil lewat RPC admin (bukan select langsung) supaya aturan
 * "hanya admin" ditegakkan di database, bukan cuma di UI.
 */
export default async function AdminProfileMenuPage() {
  const res = await listProfileMenuItemsAction();

  // Kalau RPC gagal, tetap render halaman dengan daftar kosong supaya
  // dashboard tidak ikut blank; toast di sisi klien akan menjelaskan.
  return <ProfileMenuClient initialItems={res.ok ? (res.data ?? []) : []} />;
}