import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCustomersAction,
  getMutasiAction,
  getOrdersAction,
  getPoBatchDetailAction,
} from "@/app/admin/actions";
import { PoBatchDetailClient } from "@/components/admin/PoBatchDetailClient";
import { getI18nDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Batch PO", robots: { index: false, follow: false } };
}

/**
 * Detail satu batch pre-order (Steven 14-10-2026).
 *
 * "Setelah kita buat batch kita bisa click itu, lalu di dalamnya ada beberapa
 * sidebar yang sama seperti mutasi, stok, pesanan, pelanggan — khusus untuk
 * batch itu aja."
 *
 * Semua tab di-sidebar membaca data yang SUDAH disaring per batch:
 *   - Stok      -> `admin_list_po_batch_detail` (sisa / terjual / stok awal)
 *   - Pesanan   -> `admin_list_orders(p_po_batch_id)`
 *   - Pelanggan -> `admin_list_customers(p_po_batch_id)`
 *   - Mutasi    -> `admin_list_mutasi(p_po_batch_id)`
 *
 * Params `p_po_batch_id` itu masuk di migration-51. Semuanya NULL kalau id
 * batch tidak valid, jadi halaman ini tidak bisa bocorin data batch lain.
 */
export default async function AdminPoBatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const batchId = Number.parseInt(id, 10);
  if (!Number.isInteger(batchId) || batchId <= 0) notFound();

  const [detailRes, dicts, ordersRes, mutasiRes, customersRes] = await Promise.all([
    getPoBatchDetailAction(batchId),
    getI18nDict(),
    getOrdersAction(null, "", 100, 0, batchId),
    getMutasiAction({ limit: 100, offset: 0, poBatchId: batchId }),
    getCustomersAction(batchId),
  ]);

  // Batch hilang (dihapus admin) -> 404, bukan halaman kosong yang menyesatkan.
  if (!detailRes.ok || !detailRes.data) notFound();

  return (
    <PoBatchDetailClient
      initial={detailRes.data}
      orders={ordersRes.ok ? (ordersRes.data?.orders ?? []) : []}
      ordersFailed={!ordersRes.ok}
      mutasi={
        mutasiRes.ok && mutasiRes.data
          ? {
              summary: mutasiRes.data.summary,
              transactions: mutasiRes.data.transactions,
              total: mutasiRes.data.total,
            }
          : null
      }
      mutasiFailed={!mutasiRes.ok}
      customers={customersRes.ok ? (customersRes.data ?? []) : []}
      customersFailed={!customersRes.ok}
      labels={dicts.admin.po.detail}
    />
  );
}