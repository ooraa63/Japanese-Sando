import type { Metadata } from "next";
import { listTermsAction } from "@/app/admin/actions";
import { TermsClient } from "@/components/admin/TermsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Syarat & Ketentuan",
    robots: { index: false, follow: false },
  };
}

/**
 * Kelola isi Syarat & Ketentuan yang tampil di halaman /syarat-ketentuan.
 *
 * Data diambil lewat RPC admin (`admin_list_terms`) supaya aturan "hanya admin"
 * ditegakkan di database, bukan cuma disembunyikan di UI. Migration-47.
 */
export default async function AdminTermsPage() {
  const res = await listTermsAction();

  // Kalau RPC gagal, tetap render halaman dengan daftar kosong supaya
  // dashboard tidak ikut blank.
  return <TermsClient initialItems={res.ok ? (res.data ?? []) : []} />;
}