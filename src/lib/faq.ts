/**
 * Isi FAQ toko.
 *
 * SEJAK migration-46 isi FAQ tinggal di database (tabel `faq_items`) supaya
 * penjual bisa menambah / mengubah / menyembunyikan pertanyaan dari
 * dashboard, sama seperti Contact dll.
 *
 * Isi di bawah ini sekarang hanya cadangan: dipakai kalau RPC `public_faq`
 * gagal (mis. DB sedang tidak terjangkau) supaya halaman /faq dan section FAQ
 * di /contact tidak pernah kosong. Isinya sama persis dengan seed di
 * `supabase/migration-46.sql`.
 */

export interface FaqEntry {
  /** Id bar di `faq_items`. Null kalau ini isi cadangan. */
  id: number | null;
  question_id: string;
  question_en: string;
  answer_id: string;
  answer_en: string;
  sort_order: number;
}

export const FAQ_FALLBACK: FaqEntry[] = [
  {
    id: null,
    question_id: "Bagaimana cara memesan?",
    question_en: "How do I place an order?",
    answer_id:
      "Pilih rasa yang kamu mau di halaman Menu, tekan “Pesan Sekarang”, lalu isi nama dan nomor WhatsApp kamu. Kamu bisa ambil di toko atau diantar, lalu pilih metode pembayaran.",
    answer_en:
      "Pick the flavors you want on the Menu page, tap “Order now”, then fill in your name and WhatsApp number. Choose pickup or delivery, then pick a payment method.",
    sort_order: 10,
  },
  {
    id: null,
    question_id: "Apakah harus pesan dari jauh-jauh hari?",
    question_en: "Do I have to order days in advance?",
    answer_id:
      "Tidak wajib. Kami tetap menerima pesanan sampai batas pre-order yang tertera di halaman utama. Kalau stok suatu rasa habis, rasanya tidak akan muncul sebagai pilihan.",
    answer_en:
      "Not necessarily. We keep taking orders until the pre-order deadline shown on the homepage. Once a flavor runs out, it disappears from the menu.",
    sort_order: 20,
  },
  {
    id: null,
    question_id: "Metode pembayaran apa saja yang tersedia?",
    question_en: "Which payment methods are available?",
    answer_id:
      "QRIS (semua e-wallet & mobile banking) dan transfer bank. Kalau kamu pilih transfer, kamu perlu upload bukti transfer supaya pesanan diproses.",
    answer_en:
      "QRIS (any e-wallet or mobile banking) and bank transfer. For bank transfer you need to upload your payment proof so we can process the order.",
    sort_order: 30,
  },
  {
    id: null,
    question_id: "Kalau QRIS saya sudah scan tapi belum masuk?",
    question_en: "What if I scanned the QRIS but it did not go through?",
    answer_id:
      "Kadang butuh beberapa detik. Halaman pesanan akan otomatis terupdate begitu pembayaran masuk. Kalau lebih dari 5 menit belum terdeteksi, QRIS-nya kadaluarsa dan kamu bisa scan ulang dari halaman pesanan.",
    answer_en:
      "It can take a few seconds. Your order page updates automatically as soon as the payment lands. If it is not detected after 5 minutes, the QRIS expires and you can request a fresh one from your order page.",
    sort_order: 40,
  },
  {
    id: null,
    question_id: "Apakah bisa diantar ke tempat saya?",
    question_en: "Do you deliver to my area?",
    answer_id:
      "Bisa, untuk area yang tercakup di daftar zona pengiriman. Saat memesan kamu memilih zona, lalu menandai titik lokasi di peta supaya kami tahu persis ke mana harus dikirim.",
    answer_en:
      "Yes, for areas covered by our delivery zones. While ordering you pick a zone, then drop a pin on the map so we know exactly where to send it.",
    sort_order: 50,
  },
  {
    id: null,
    question_id: "Bisa ganti rasa kalau sudah pesan?",
    question_en: "Can I change flavors after ordering?",
    answer_id:
      "Bisa, selama pesanan belum kami mulai buat. Chat WhatsApp kami secepatnya, dan kami cek dulu ketersediaan stoknya.",
    answer_en:
      "Yes, as long as we have not started making it. Message us on WhatsApp as early as possible and we will check availability first.",
    sort_order: 60,
  },
];

/**
 * Rapikan hasil RPC jadi `FaqEntry[]`.
 *
 * `public_faq()` mengembalikan jsonb, jadi bentuknya tidak dijamin: bar bisa
 * `null`, `sort_order` bisa null, dan database bisa mengembalikan bukan array.
 * Semua itu ditangani di sini supaya pemanggil cukup percaya hasilnya.
 */
export function normalizeFaq(value: unknown): FaqEntry[] {
  if (!Array.isArray(value)) return [];
  const out: FaqEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const q =
      typeof r.question_id === "string" ? r.question_id.trim() : "";
    if (!q) continue;
    const num = Number(r.id);
    out.push({
      id: Number.isFinite(num) && num > 0 ? num : null,
      question_id: q,
      question_en: typeof r.question_en === "string" ? r.question_en : "",
      answer_id: typeof r.answer_id === "string" ? r.answer_id : "",
      answer_en: typeof r.answer_en === "string" ? r.answer_en : "",
      sort_order: Number.isFinite(Number(r.sort_order))
        ? Number(r.sort_order)
        : 0,
    });
  }
  return out.sort((a, b) => a.sort_order - b.sort_order || (a.id ?? 0) - (b.id ?? 0));
}