import { createClient } from "@/lib/supabase/client";

/**
 * Batch pre-order (PO) — sisi pembeli.
 *
 * Alurnya:
 *  1. `fetchPickupDates()` dipanggil sekali saat halaman /order dibuka.
 *     Kalau admin belum membuat batch yang sedang dibuka, hasilnya kosong
 *     dan pembeli tetap bisa memesan dengan mode lama (stok dari
 *     `categories.stock`) — supaya migrasi tidak memblokir toko.
 *  2. Setelah pembeli memilih tanggal, `fetchBatchForDate()` mengembalikan
 *     batch yang dipakai untuk tanggal itu BESERTA sisa stok per jenis
 *     menu. Kalau beberapa batch punya tanggal sama, yang dipilih adalah
 *     yang sisa stoknya paling sedikit dulu (aturan di SQL). Pembeli tidak
 *     pernah melihat nama batch.
 */

/** Satu tanggal yang bisa dipilih pembeli. */
export interface PoPickupDate {
  /** Format `YYYY-MM-DD` (hasil kolom `date`). */
  pickupDate: string;
  /** Sisa stok terbesar di tanggal itu — dipakai untuk badge "sisa N". */
  sisa: number;
}

/** Bundle (paket) yang boleh dipesan di batch ini (migration-52). */
export interface PoBatchBundle {
  bundleId: number;
  /** Harga untuk batch ini (sudah di-fallback ke harga bawaan bundle). */
  price: number;
}

/** Batch yang dipakai untuk satu tanggal + stok per kategori. */
export interface PoBatchStock {
  batchId: number;
  pickupDate: string;
  /** `categoryId` -> sisa stok pcs untuk kategori itu. */
  stockByCategory: Map<number, number>;
  /**
   * Bundle yang boleh dipesan di batch ini.
   *
   * `null` = batch ini belum pernah diset bundle, jadi semua bundle aktif
   * boleh dipakai (mode lama). `[]` yang bukan null = Steven sudah memilih
   * tapi tidak ada satu pun yang aktif, jadi tidak ada paket yang bisa dibeli.
   */
  bundles: PoBatchBundle[] | null;
}

/**
 * Tanggal pengambilan yang sedang bisa dipilih.
 *
 * Kembalikan array KOSONG (bukan throw) kalau RPC gagal — supaya halaman
 * pesanan tetap jalan dengan mode lama, bukan gagal total.
 */
export async function fetchPickupDates(): Promise<PoPickupDate[]> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("public_po_pickup_dates");
    if (error || !data) return [];

    const payload = data as {
      ada_batch?: boolean;
      tanggal?: Array<{ pickup_date?: string | null; sisa?: number | null }> | null;
    };
    if (!payload.ada_batch || !Array.isArray(payload.tanggal)) return [];

    return payload.tanggal
      .map((row) => ({
        pickupDate: String(row.pickup_date ?? "").slice(0, 10),
        sisa: Number(row.sisa ?? 0),
      }))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.pickupDate));
  } catch {
    return [];
  }
}

/**
 * Batch + stok per kategori untuk satu tanggal.
 *
 * Kembalikan `null` kalau tanggalnya sudah tidak punya batch aktif (mis.
 * batch ditutup admin saat pembeli sedang memilih) — pemanggil harus
 * memaksa pembeli memilih ulang tanggal, bukan lanjut dengan stok batch
 * yang sudah tidak berlaku.
 */
export async function fetchBatchForDate(
  pickupDate: string
): Promise<PoBatchStock | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("public_po_batch_for_date", {
      p_pickup_date: pickupDate,
    });
    if (error || !data) return null;

    const payload = data as {
      batch_id?: number | null;
      pickup_date?: string | null;
      stok?: Record<string, { sisa?: number | null }> | null;
      bundles?: Array<{ bundle_id?: number | null; price?: number | null }> | null;
    };
    if (payload.batch_id == null) return null;

    const stockByCategory = new Map<number, number>();
    for (const [key, cell] of Object.entries(payload.stok ?? {})) {
      const catId = Number(key);
      if (Number.isFinite(catId)) stockByCategory.set(catId, Number(cell?.sisa ?? 0));
    }

    const bundles =
      Array.isArray(payload.bundles)
        ? payload.bundles
            .map((b) => ({
              bundleId: Number(b.bundle_id),
              price: Number(b.price ?? 0),
            }))
            .filter((b) => Number.isInteger(b.bundleId) && b.bundleId > 0)
        : null;

    return {
      batchId: Number(payload.batch_id),
      pickupDate: String(payload.pickup_date ?? pickupDate).slice(0, 10),
      stockByCategory,
      bundles,
    };
  } catch {
    return null;
  }
}