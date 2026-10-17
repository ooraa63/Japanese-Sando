import type { Metadata } from "next";
import { listPoBatchesAction } from "@/app/admin/actions";
import { PoBatchesClient } from "@/components/admin/PoBatchesClient";
import { PO_TABS, type PoTab } from "@/lib/admin-nav";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Batch PO", robots: { index: false, follow: false } };
}

/**
 * `?tab=` harus salah satu dari `PO_TABS`. Nilai lain (termasuk tidak ada)
 * jatuh ke mode pertama — sama seperti yang dilakukan `AdminShell` untuk
 * menandai menu aktif, jadi sidebar dan isi halaman tidak pernah berbeda.
 */
function tabDariSearch(nilai: string | undefined): PoTab {
  return PO_TABS.includes(nilai as PoTab) ? (nilai as PoTab) : PO_TABS[0];
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
 *
 * Sidebar app Batch PO punya DUA menu (Steven 18-10-2026): batch yang sedang
 * berlangsung (beserta tombol tambah) dan batch yang sudah berlalu. Keduanya
 * halaman yang sama, dipisahkan `?tab=` supaya sidebar bisa menandai yang
 * aktif — lihat `PO_TABS` di `src/lib/admin-nav.ts`.
 */
export default async function AdminPoPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [res, sp] = await Promise.all([listPoBatchesAction(), searchParams]);
  const tab = tabDariSearch(sp.tab);

  // Kalau RPC gagal, tetap render dengan daftar kosong supaya dashboard tidak
  // ikut blank.
  const data = res.ok && res.data ? res.data : { batches: [], kategori: [] };
  return <PoBatchesClient initial={data} loadFailed={!res.ok} tab={tab} />;
}