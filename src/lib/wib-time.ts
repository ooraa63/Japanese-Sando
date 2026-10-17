/**
 * Waktu Indonesia (WIB, UTC+7) untuk keperluan tampilan.
 *
 * Kenapa tidak pakai `new Date()` biasa:
 * server Vercel berjalan di zona UTC, sedangkan toko di Bandung. Di antara
 * pukul 00.00 dan 07.00 WIB, `new Date().getHours()` masih menunjukkan jam
 * "kemarin". Offset tetap +7 jam aman karena Indonesia tidak pernah memakai
 * daylight saving.
 *
 * PENTING — jangan pakai ini untuk membandingkan tanggal ambil batch.
 * Untuk itu, ALWAYS baca dari database lewat `public.po_today()` yang sudah
 * memakai `at time zone 'Asia/Jakarta'` (lihat migration-61). Modul ini hanya
 * untuk hal tampilan di admin: salam, tanggal hari ini, dan menghitung
 * "pesanan lewat tanggal ambil" di layar awal.
 */

/** `YYYY-MM-DD` versi WIB, misalnya `2026-10-17`. */
export function hariIniWib(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Jam lokal WIB, 0-23. Dipakai untuk memilih sapaan. */
export function jamWib(): number {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
}