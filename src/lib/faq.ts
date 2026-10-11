/**
 * Isi FAQ toko.
 *
 * Dipakai di dua tempat: section FAQ di halaman `/contact`, dan halaman
 * `/faq` penuh yang dibuka dari bar menu Profil. Dipisah ke sini supaya
 * keduanya tidak pernah berbeda isi.
 *
 * Isinya stabil (cara pesan, pembayaran, ongkir) — bukan konten yang diubah
 * penjual dari dashboard. Kalau nanti perlu sells-point per toko, pindahkan ke
 * database, jangan menambah angka atau janji yang tidak benar.
 */
export const FAQ = [
  {
    q: { id: "Bagaimana cara memesan?", en: "How do I place an order?" },
    a: {
      id: "Pilih rasa yang kamu mau di halaman Menu, tekan “Pesan Sekarang”, lalu isi nama dan nomor WhatsApp kamu. Kamu bisa ambil di toko atau diantar, lalu pilih metode pembayaran.",
      en: "Pick the flavors you want on the Menu page, tap “Order now”, then fill in your name and WhatsApp number. Choose pickup or delivery, then pick a payment method.",
    },
  },
  {
    q: { id: "Apakah harus pesan dari jauh-jauh hari?", en: "Do I have to order days in advance?" },
    a: {
      id: "Tidak wajib. Kami tetap menerima pesanan sampai batas pre-order yang tertera di halaman utama. Kalau stok suatu rasa habis, rasanya tidak akan muncul sebagai pilihan.",
      en: "Not necessarily. We keep taking orders until the pre-order deadline shown on the homepage. Once a flavor runs out, it disappears from the menu.",
    },
  },
  {
    q: { id: "Metode pembayaran apa saja yang tersedia?", en: "Which payment methods are available?" },
    a: {
      id: "QRIS (semua e-wallet & mobile banking) dan transfer bank. Kalau kamu pilih transfer, kamu perlu upload bukti transfer supaya pesanan diproses.",
      en: "QRIS (any e-wallet or mobile banking) and bank transfer. For bank transfer you need to upload your payment proof so we can process the order.",
    },
  },
  {
    q: { id: "Kalau QRIS saya sudah scan tapi belum masuk?", en: "What if I scanned the QRIS but it did not go through?" },
    a: {
      id: "Kadang butuh beberapa detik. Halaman pesanan akan otomatis terupdate begitu pembayaran masuk. Kalau lebih dari 5 menit belum terdeteksi, QRIS-nya kadaluarsa dan kamu bisa scan ulang dari halaman pesanan.",
      en: "It can take a few seconds. Your order page updates automatically as soon as the payment lands. If it is not detected after 5 minutes, the QRIS expires and you can request a fresh one from your order page.",
    },
  },
  {
    q: { id: "Apakah bisa diantar ke tempat saya?", en: "Do you deliver to my area?" },
    a: {
      id: "Bisa, untuk area yang tercakup di daftar zona pengiriman. Saat memesan kamu memilih zona, lalu menandai titik lokasi di peta supaya kami tahu persis ke mana harus dikirim.",
      en: "Yes, for areas covered by our delivery zones. While ordering you pick a zone, then drop a pin on the map so we know exactly where to send it.",
    },
  },
  {
    q: { id: "Bisa ganti rasa kalau sudah pesan?", en: "Can I change flavors after ordering?" },
    a: {
      id: "Bisa, selama pesanan belum kami mulai buat. Chat WhatsApp kami secepatnya, dan kami cek dulu ketersediaan stoknya.",
      en: "Yes, as long as we have not started making it. Message us on WhatsApp as early as possible and we will check availability first.",
    },
  },
] as const;

export type FaqItem = (typeof FAQ)[number];