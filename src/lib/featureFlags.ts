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
 * Yang TETAP ada dan tidak boleh ikut tersembunyi:
 * - halaman `/account` — dipakai tab "Pesanan" di bottom nav untuk melihat
 *   riwayat & status pre-order. Itu fitur **pesanan**, bukan fitur account.
 * - lonceng notifikasi di top bar — juga mengarah ke `/account`.
 *
 * Jadi menyalakan flag ini hanya mengembalikan entry point login; alur
 * pemesanan tidak pernah bergantung padanya.
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