/**
 * Flag fitur yang sengaja dimatikan sementara.
 *
 * Semua di sini bisa dinyalakan lagi dengan mengubah SATU baris — tidak ada
 * data yang perlu dimigrasi, tidak ada route yang perlu dibuat ulang.
 */

/**
 * Fitur **Account** (login, registrasi, profil) dimatikan sementara atas
 * permintaan Steven (11-10-2026): "jangan ada fitur account dulu karena
 * belum terpakai".
 *
 * Yang disembunyikan:
 * - bar "Account" di sheet Profil (tombol yang membuka form login),
 * - chip avatar / "Masuk" di top bar.
 *
 * Yang terjadi kalau flag ini mati:
 * - `/account` **mengalihkan** ke `/track` (lacak pesanan). Halaman account
 *   sendiri tidak dihapus -- kodenya masih utuh, cuma tidak punya pintu masuk.
 * - Tab "Pesanan" di bottom nav dan lonceng di top bar sudah diarahkan
 *   langsung ke `/track`, jadi tidak ada satu pun tautan ke halaman account.
 *
 * Jadi menyalakan flag ini hanya mengembalikan halaman account + entry point
 * login; alur pemesanan dan lacak pesanan tidak pernah bergantung padanya.
 */
export const ACCOUNT_FEATURE_ENABLED = false;

/**
 * Kolom **pencarian** di top bar dimatikan (permintaan Steven, 11-10-2026).
 *
 * Bukan dihapus permanen: `OrderMenuBrowser` masih membaca query `?q=` dari
 * URL, jadi kalau suatu saat kolomnya kembali, fiturnya langsung hidup tanpa
 * perubahan kode lain.
 */
export const TOPBAR_SEARCH_ENABLED = false;