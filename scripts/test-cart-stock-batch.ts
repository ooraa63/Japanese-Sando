/**
 * Uji logika remainingStockByCategory untuk kasus yang Steven laporkan.
 *
 * Fokus: batch PO SEDANG dibuka (stockOverride terisi) tapi satu kategori TIDAK
 * punya baris di po_batch_stock. Before-fix kategori itu ikut menampilkan
 * categories.stock (=20); setelah fix harus 0 -> tampil "Habis".
 *
 * Murni fungsi — tidak menyentuh database sama sekali.
 *
 * File ini sengaja DIKECUALIKAN dari type-check project (lihat `exclude` di
 * tsconfig.json): skrip di folder ini adalah tooling yang dijalankan manual
 * dengan `node --experimental-strip-types`, yang mewajibkan import berakhiran
 * `.ts` — sedangkan `tsc` menolak ekstensi itu tanpa
 * `allowImportingTsExtensions`. Selain itu semua skrip lain di sini masih
 * `.js`/`.mjs` dan memang tidak pernah ikut di-type-check.
 *
 * Jalankan: node --experimental-strip-types scripts/test-cart-stock-batch.ts
 */
import { remainingStockByCategory } from "../src/lib/cart-stock.ts";
import type { Category, Flavor, CartBundleEntry } from "../src/lib/types";

function flavor(id: number, categoryId: number): Flavor {
  return {
    id,
    slug: `flavor-${id}`,
    name_id: `Rasa ${id}`,
    name_en: `Flavor ${id}`,
    desc_id: "",
    desc_en: "",
    price: 18000,
    image_url: null,
    is_active: true,
    is_featured: false,
    is_new: false,
    stock_enabled: true,
    stock: 0,
    sort_order: id,
    likes_count: 0,
    category_id: categoryId,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

function category(id: number, name: string, flavors: Flavor[]): Category {
  return {
    id,
    slug: `kategori-${id}`,
    name_id: name,
    name_en: name,
    desc_id: "",
    desc_en: "",
    image_url: null,
    is_active: true,
    is_featured: false,
    sort_order: id,
    stock_enabled: true,
    stock: 20,
    flavors,
  };
}

const categories: Category[] = [
  category(30, "Sando Sandwich", [flavor(1, 30), flavor(2, 30)]),
  category(31, "Menu Kedua", [flavor(3, 31)]),
];

let ok = 0;
let fail = 0;
const t = (name: string, pass: boolean, extra = "") => {
  if (pass) ok++;
  else fail++;
  console.log((pass ? "OK   " : "GAGAL") + "  " + name + (extra ? "  -> " + extra : ""));
};

// 1. Tanpa batch (stockOverride null) -> perilaku lama, pakai categories.stock.
const legacy = remainingStockByCategory(categories, {}, [], [], null);
t("tanpa batch: kat 30 = 20 (stok global)", legacy.get(30) === 20, String(legacy.get(30)));
t("tanpa batch: kat 31 = 20 (stok global)", legacy.get(31) === 20, String(legacy.get(31)));

// 2. Batch terbuka, HANYA kategori 30 yang punya stok di batch.
const batchOnly30 = new Map([[30, 5]]);
const withBatch = remainingStockByCategory(categories, {}, [], [], batchOnly30);
t("batch: kat 30 = 5 (stok batch)", withBatch.get(30) === 5, String(withBatch.get(30)));
t(
  "batch: kat 31 = 0 BUKAN 20 (inti laporan Steven)",
  withBatch.get(31) === 0,
  String(withBatch.get(31))
);

// 3. Batch terbuka + isi keranjang mengurangi sisa.
const withCart = remainingStockByCategory(categories, { "2": 2 }, [], [], batchOnly30);
t("batch + keranjang 2 pcs: kat 30 = 3", withCart.get(30) === 3, String(withCart.get(30)));

// 4. Slot bundle di keranjang juga memotong (tiap slot = 1 pcs fisik).
const bundleEntry = {
  bundle: { id: 1 } as CartBundleEntry["bundle"],
  slots: [1, 2],
  note: null,
} as CartBundleEntry;
const withBundle = remainingStockByCategory(categories, {}, [bundleEntry], [], batchOnly30);
t("batch + bundle 2 slot: kat 30 = 3", withBundle.get(30) === 3, String(withBundle.get(30)));

// 5. Batch terbuka tapi stoknya habis -> 0.
const emptyBatch = new Map([
  [30, 0],
  [31, 0],
]);
const soldOut = remainingStockByCategory(categories, {}, [], [], emptyBatch);
t("batch habis: kat 30 = 0", soldOut.get(30) === 0, String(soldOut.get(30)));

// 6. Map kosong (batch ada tapi belum ada baris stok) -> semua 0.
const emptyMap = remainingStockByCategory(categories, {}, [], [], new Map());
t(
  "batch tanpa baris stok: semua 0",
  emptyMap.get(30) === 0 && emptyMap.get(31) === 0,
  `30=${emptyMap.get(30)} 31=${emptyMap.get(31)}`
);

// 7. stock_enabled = false tanpa batch tetap null (stok tidak dibatasi).
const unlimited: Category[] = [{ ...categories[0], stock_enabled: false, stock: 0 }];
const unlimitedOut = remainingStockByCategory(unlimited, {}, [], [], null);
t(
  "stock_enabled=false tanpa batch: null (tanpa batas)",
  unlimitedOut.get(30) === null,
  String(unlimitedOut.get(30))
);

// 8. Sisa tidak pernah negatif walau keranjang melebihi stok.
const overshoot = remainingStockByCategory(categories, { "1": 99 }, [], [], batchOnly30);
t("keranjang melebihi stok: tidak negatif", (overshoot.get(30) ?? 0) === 0, String(overshoot.get(30)));

console.log(`\n=== ${ok} OK, ${fail} GAGAL ===`);
process.exit(fail === 0 ? 0 : 1);