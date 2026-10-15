import type { Category, Flavor } from "@/lib/types";

/**
 * Index semua rasa berdasarkan id.
 *
 * Keranjang di localStorage hanya menyimpan `flavorId -> jumlah`, jadi untuk
 * menampilkan nama, harga, dan foto di dalam keranjang kita perlu mencocokkan
 * id itu ke data rasa. Daftar rasa sudah ada di memori (kategori + `flavors`
 * dari `public_menu()`), jadi tidak perlu query tambahan.
 *
 * Rasa yang tidak ada lagi di daftar (mis. dinonaktifkan admin setelah pembeli
 * menaruhnya di keranjang) sengaja DILEWATI — lihat `cartLinesFrom()`.
 */
export function indexFlavors(categories: Category[] | null | undefined): Map<number, Flavor> {
  const map = new Map<number, Flavor>();
  for (const category of categories ?? []) {
    for (const flavor of category.flavors ?? []) {
      map.set(flavor.id, flavor);
    }
  }
  return map;
}

export interface CartFlavorLine {
  flavor: Flavor;
  qty: number;
  note: string;
}

/**
 * Baris keranjang yang SIAP tampil: rasa satuan saja, sudah dibersihkan dari
 * id yang tidak dikenal.
 *
 * `quantities` datang dari localStorage dan bisa berisi rasa yang sudah tidak
 * dijual. Kalau id-nya tidak ketemu, barisnya dibuang di sini supaya tampilan
 * tidakshowing "undefined" dan subtotal tidak ikut menghitung harga yang tidak
 * ada. Baris seperti itu akan kembali muncul kalau admin aktifkan lagi.
 */
export function cartLinesFrom(
  quantities: Record<string, number>,
  flavorById: Map<number, Flavor>,
  notes: Record<string, string> = {},
): CartFlavorLine[] {
  const out: CartFlavorLine[] = [];
  for (const [id, rawQty] of Object.entries(quantities)) {
    const qty = Number(rawQty);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const flavor = flavorById.get(Number(id));
    if (!flavor) continue;
    out.push({ flavor, qty, note: notes[id] ?? "" });
  }
  // Urutan stabil supaya baris tidak lompat-lompat setiap kali qty berubah.
  return out.sort((a, b) => a.flavor.id - b.flavor.id);
}

/**
 * Daftar rasa datar, bukan per kategori.
 *
 * `public_menu()` mengembalikan kategori yang masing-masing bringing `flavors`.
 * Keranjang cuma butuh satu daftar datar, jadi diratakan di sini satu kali
 * dan dipakai bersama oleh `CartSheet`, `CartDock`, dan `CartRail` - supaya
 * tidak ada layar yang melihat daftar rasa berbeda.
 */
export function flatFlavors(categories: Category[] | null | undefined): Flavor[] {
  const out: Flavor[] = [];
  for (const category of categories ?? []) {
    for (const flavor of category.flavors ?? []) out.push(flavor);
  }
  return out;
}

/**
 * Subtotal = harga satuan x jumlah + harga paket x jumlah paket.
 *
 * Rumus ini HARUS sama dengan yang dipakai `OrderFlow` (dan `create_order` di
 * database), jadi subtotal yang tampil di keranjang tidak pernah beda dengan
 * yang ditagih di akhir.
 */
export function cartSubtotal(
  lines: CartFlavorLine[],
  bundles: { bundle: { price: number } }[],
): number {
  const fromLines = lines.reduce((sum, l) => sum + l.flavor.price * l.qty, 0);
  const fromBundles = bundles.reduce((sum, b) => sum + b.bundle.price, 0);
  return fromLines + fromBundles;
}