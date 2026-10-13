/**
 * Isi Syarat & Ketentuan toko.
 *
 * migration-47: teksnya pindah ke database (tabel `terms_sections`) supaya
 * penjual bisa menambah / mengubah / menyembunyikan bagian dari dashboard,
 * persis seperti yang terjadi pada FAQ di migration-46. Halaman
 * `/syarat-ketentuan` membacanya lewat RPC `public_terms`.
 *
 * Berbeda dengan `faq.ts`, di sini TIDAK ada array cadangan. Alasannya: FAQ punya
 * isi lama yang harus tetap tampil kalau RPC-nya mati, sedangkan Syarat &
 * Ketentuan ini baru dibuat sekarang. Menyalin delapan bagian sekaligus antara
 * migrasi dan kode hanya menciptakan dua sumber yang harus dijaga selalu. Kalau
 * RPC gagal, `getTerms()` mengembalikan array kosong dan halaman menampilkan
 * empty state yang jujur — bukan isi karangan.
 */

export interface TermSection {
  /** Id bar di `terms_sections`. */
  id: number;
  title_id: string;
  title_en: string;
  body_id: string;
  body_en: string;
  sort_order: number;
}

/**
 * Rapikan hasil RPC jadi `TermSection[]`.
 *
 * `public_terms()` mengembalikan jsonb, jadi bentuknya tidak dijamin: bar bisa
 * `null`, `sort_order` bisa null, dan database bisa mengembalikan bukan array.
 * Semua itu ditangani di sini supaya pemanggil cukup percaya hasilnya — pola
 * yang sama dengan `normalizeFaq`.
 */
export function normalizeTerms(value: unknown): TermSection[] {
  if (!Array.isArray(value)) return [];
  const out: TermSection[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title =
      typeof r.title_id === "string" ? r.title_id.trim() : "";
    if (!title) continue;
    const num = Number(r.id);
    out.push({
      id: Number.isFinite(num) ? num : 0,
      title_id: title,
      title_en: typeof r.title_en === "string" ? r.title_en : "",
      body_id: typeof r.body_id === "string" ? r.body_id : "",
      body_en: typeof r.body_en === "string" ? r.body_en : "",
      sort_order: Number.isFinite(Number(r.sort_order))
        ? Number(r.sort_order)
        : 0,
    });
  }
  return out.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}