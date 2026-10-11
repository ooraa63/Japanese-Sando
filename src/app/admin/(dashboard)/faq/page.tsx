import type { Metadata } from "next";
import { listFaqAction } from "@/app/admin/actions";
import { FaqClient } from "@/components/admin/FaqClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "FAQ", robots: { index: false, follow: false } };
}

/**
 * Kelola isi FAQ yang tampil di halaman /faq dan section FAQ di /contact.
 *
 * Data diambil lewat RPC admin (`admin_list_faq`) supaya aturan "hanya admin"
 * ditegakkan di database, bukan cuma disembunyikan di UI. Migration-46.
 */
export default async function AdminFaqPage() {
  const res = await listFaqAction();

  // Kalau RPC gagal, tetap render halaman dengan daftar kosong supaya
  // dashboard tidak ikut blank.
  return <FaqClient initialItems={res.ok ? (res.data ?? []) : []} />;
}