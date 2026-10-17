/**
 * Mode paket (bundle) — dipakai untuk MENAMPILKAN teks yang tepat di kartu
 * paket dan di popup pembeli.
 *
 * Ada tiga mode, dan ketiganya punya kalimat yang berbeda untuk
 * pembeli:
 *
 *  - `choice` (migration-59): tiap pilihan punya daftar rasa sendiri,
 *    pembeli ambil satu rasa dari tiap pilihan.
 *  - `fixed`  (migration-54): isi paket sudah ditentukan penjual, pembeli
 *    tidak memilih apa-apa.
 *  - `biasa`: pembeli memilih sendiri `required_qty` rasa.
 *
 * PENTING: versi lama memakai `t.menu.bundleIncludes` ("Pilih {n} rasa
 * untuk paket ini") untuk SEMUA mode. Untuk paket terkunci kalimat itu
 * menipu — pembeli dikira memilih padahal isinya sudah ditentukan. Semua
 * tempat yang menulis kalimat mode paket harus lewat `bundleModeSubtitle`.
 */

import type { Bundle } from "./types";

export type BundleMode = "choice" | "fixed" | "biasa";

/** Mode paket dari data bundle. `slots` yang terisi = mode pilihan. */
export function bundleMode(b: Pick<Bundle, "is_fixed" | "slots"> | null | undefined): BundleMode {
  if (!b) return "biasa";
  if ((b.slots ?? []).length > 0) return "choice";
  if (b.is_fixed) return "fixed";
  return "biasa";
}

/**
 * Kalimat pendek di bawah nama paket pada kartu.
 *
 * `biasa`  → "Pilih {n} rasa untuk paket ini"   (pembeli yang memilih)
 * `choice` → "Pilih {n} rasa dari paket ini"    (satu rasa per pilihan)
 * `fixed`  → "Isi paket sudah ditentukan"       (pembeli TIDAK memilih)
 */
export function bundleModeSubtitle(
  mode: BundleMode,
  requiredQty: number,
  t: { menu: Record<string, string> },
): string {
  const fill = (key: string) => t.menu[key].replace("{n}", String(requiredQty));
  if (mode === "choice") return fill("bundleChoiceTitle");
  if (mode === "fixed") return t.menu.bundleFixedContents;
  return fill("bundleIncludes");
}

/**
 * Petunjuk saat kartu paket sudah ada di keranjang.
 *
 * `fixed` → pembeli tidak bisa ganti rasa, jadi jangan tulis "ubah rasa".
 */
export function bundleModeEditHint(
  mode: BundleMode,
  t: { menu: Record<string, string> },
): string {
  return mode === "fixed" ? t.menu.bundleFixedEditHint : t.menu.bundleEditHint;
}