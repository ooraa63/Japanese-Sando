import type { Metadata } from "next";
import { listPoBatchesAction } from "@/app/admin/actions";
import { PoBatchesClient } from "@/components/admin/PoBatchesClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Batch PO", robots: { index: false, follow: false } };
}

/**
 * Kelola batch pre-order (Steven 13-10-2026).
 *
 * Menggantikan tombol "Tutup/Buka pre-order" yang ada di dashboard. Tiap batch
 * punya jendela pemesanan sendiri, satu tanggal pengambilan, dan stok sendiri
 * per jenis menu. Pembeli hanya melihat tanggal pengambilannya, tidak pernah
 * nama batch.
 *
 * Data lewat RPC admin `admin_list_po_batches` (supabase/migration-49.sql)
 * supaya aturan "hanya admin" ditegakkan di database.
 */
export default async function AdminPoPage() {
  const res = await listPoBatchesAction();

  // Kalau RPC gagal, tetap render dengan daftar kosong supaya dashboard tidak
  // ikut blank.
  const data = res.ok && res.data ? res.data : { batches: [], kategori: [] };
  return <PoBatchesClient initial={data} loadFailed={!res.ok} />;
}