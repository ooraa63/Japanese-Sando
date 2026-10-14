import type { Metadata } from "next";
import { listAnnouncementsAction } from "@/app/admin/actions";
import { AnnouncementsClient } from "@/components/admin/AnnouncementsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Pengumuman",
    robots: { index: false, follow: false },
  };
}

/**
 * Kelola pengumuman/promo yang muncul di lonceng notifikasi pembeli.
 *
 * Steven 14-10-2026: "di admin bisa set pemberitahuan, seperti mungkin ada
 * promo atau apa langsung muncul untuk semua".
 *
 * Data diambil lewat RPC admin (`admin_list_announcements`) supaya aturan
 * "hanya admin" ditegakkan di database, bukan cuma disembunyikan di UI.
 * Tabelnya sudah ada sejak migration-13.
 */
export default async function AdminAnnouncementsPage() {
  const res = await listAnnouncementsAction();

  // Kalau RPC gagal, tetap render halaman dengan daftar kosong supaya
  // dashboard tidak ikut blank.
  return <AnnouncementsClient initialItems={res.ok ? (res.data ?? []) : []} />;
}