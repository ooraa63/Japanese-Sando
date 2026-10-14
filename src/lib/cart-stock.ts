import type { CartBundleEntry, Category } from "@/lib/types";

/**
 * Sisa stok per kategori setelah isi keranjang diperhitungkan.
 *
 * Kenapa perlu helper ini? Stok di database ada di `categories.stock` dan
 * `create_order` juga yang menguranginya — tiap SLOT bundle dihitung 1 pcs
 * fisik. Jadi ketika menghitung "Tersedia N" di UI, kita HARUS mengurangi:
 *
 *   1. item biasa di keranjang (`quantities`)
 *   2. slot bundle yang SUDAH ada di keranjang (`bundles`)
 *   3. slot bundle yang SEDANG dipilih di modal (belum masuk keranjang)
 *
 * Awalnya poin (2) hanya dihitung di `OrderBundleModal`, sehingga kartu rasa
 * biasa di halaman /order tetap menampilkan stok penuh walau keranjang sudah
 * berisi bundle. persis bug yang Steven laporkan: "stok 10, pilih bundle
 * harusnya 8, tapi di non-bundle masih 10".
 *
 * Mengembalikan `Map<categoryId, sisa>`; bernilai `null` kalau kategori itu
 * `stock_enabled = false` (stok tidak dibatasi).
 *
 * @param extraSlots slot bundle yang sedang dipilih di modal (masih lokal).
 * @param stockOverride sisa stok per kategori dari batch PO yang dipilih
 *   pembeli. Kalau diisi, angka ini yang jadi sumber kebenaran untuk
 *   SELURUH kategori — bukan cuma kategori yang ada di map. Kategori yang
 *   tidak ada di map berarti stok batch-nya 0, persis seperti yang dihitung
 *   `create_order` (`coalesce(v_batch_stock, 0) < v_cat_pcs`).
 *
 *   Migration-56: sebelumnya kategori yang tidak ada di map jatuh ke
 *   `categories.stock` (stok global lama, mis. 20). Akibatnya pembeli diberi
 *   angka sisa untuk menu yang tidak diproduksi di batch itu, bisa menambah
 *   ke keranjang, lalu DITOLAK backend saat submit dengan pesan
 *   `insufficient_stock` yang membingungkan. Sekarang angka "20" itu tidak
 *   pernah muncul kalau batch sudah dipilih.
 */
export function remainingStockByCategory(
  categories: Category[],
  quantities: Record<string, number>,
  bundles: CartBundleEntry[] = [],
  extraSlots: Array<number | null> = [],
  stockOverride?: Map<number, number> | null
): Map<number, number | null> {
  // Peta flavorId -> categoryId, dibangun sekali supaya tidak searching ulang
  // tiap slot (sebelumnya pakai `flatMap().find()` di dalam loop).
  const catByFlavorId = new Map<number, number | null>();
  for (const c of categories) {
    for (const f of c.flavors ?? []) {
      catByFlavorId.set(f.id, f.category_id ?? c.id ?? null);
    }
  }

  const used = new Map<number, number>();
  const bump = (catId: number | null | undefined, n: number) => {
    if (catId == null) return;
    used.set(catId, (used.get(catId) ?? 0) + n);
  };

  // 1. Item biasa.
  for (const [flavorIdStr, qty] of Object.entries(quantities ?? {})) {
    const flavorId = Number(flavorIdStr);
    bump(catByFlavorId.get(flavorId), qty);
  }

  // 2. Slot bundle yang sudah ada di keranjang.
  for (const entry of bundles ?? []) {
    for (const flavorId of entry.slots ?? []) {
      if (flavorId == null) continue;
      bump(catByFlavorId.get(flavorId), 1);
    }
  }

  // 3. Slot bundle yang sedang dipilih di modal.
  for (const flavorId of extraSlots) {
    if (flavorId == null) continue;
    bump(catByFlavorId.get(flavorId), 1);
  }

  const out = new Map<number, number | null>();
  for (const c of categories) {
    const usedHere = used.get(c.id) ?? 0;

    if (stockOverride) {
      // Batch sudah dipilih: batch yang jadi sumber kebenaran untuk semua
      // kategori. Tidak ada baris untuk kategori ini = 0 pcs di batch ini.
      out.set(c.id, Math.max(0, (stockOverride.get(c.id) ?? 0) - usedHere));
      continue;
    }

    // Tanpa batch: perilaku lama, `categories.stock` + `stock_enabled`.
    out.set(c.id, c.stock_enabled ? Math.max(0, (c.stock ?? 0) - usedHere) : null);
  }
  return out;
}