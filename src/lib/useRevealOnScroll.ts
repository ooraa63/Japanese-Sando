"use client";

import { useEffect, useState } from "react";

/**
 * Berapa px pengguna harus menggulir sebelum elemen di bawahnya muncul.
 *
 * Sengaja kecil. Halaman pendek seperti /riwayat hanya punya ruang scroll
 * belasan px saja. Dengan ambang 80px elemen tidak akan pernah muncul di
 * halaman yang justru jadi laporan Steven. 16px cukup menyaring getaran
 * sub-piksel tanpa membuat halaman pendek buntu.
 */
export const REVEAL_AFTER_PX = 16;

/**
 * Tampilkan sebuah elemen hanya setelah pengguna menggulir ke bawah.
 *
 * Dipakai dua elemen besar di situs (permintaan Steven 13-10-2026):
 *   - `MobileBottomNav` — nav bawah HP
 *   - `SiteFooter`       — blok info toko di desktop
 *
 * Sengaja TANPA pengecualian "kalau halaman tidak bisa digulir, tetap
 * tampilkan". Versi pertama punya pengecualian itu dan akibatnya elemen
 * muncul diam-diam tepat setelah pindah halaman di /track — persis yang
 * Steven minta dihapus. Kalau sebuah halaman memang tidak punya yang bisa
 * digulir, yang harus dijamin adalah halaman itu tetap punya ruang scroll —
 * bukan elemennya ditampilkan lebih awal.
 *
 * @param aktif Kalau false, hasilnya selalu false tanpa memasang listener.
 * @param resetKey Nilai yang berubah setiap pindah halaman (biasanya
 *   `pathname`). Next.js mengembalikan scroll ke 0, tapi event "scroll" tidak
 *   selalu sempat dilepas pada momen itu — dengan mengubah kunci, efeknya
 *   jalan ulang dan posisi scroll dihitung ulang dari nol.
 */
export function useRevealOnScroll(aktif: boolean, resetKey = ""): boolean {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!aktif) return;

    const evaluate = () => setShow(window.scrollY > REVEAL_AFTER_PX);

    // Dipanggil sekali di sini supaya tampilan benar sejak frame pertama
    // (termasuk saat browser memulihkan posisi scroll). Sisa pemanggilan
    // datang dari event scroll/resize.
    evaluate();
    window.addEventListener("scroll", evaluate, { passive: true });
    window.addEventListener("resize", evaluate);
    return () => {
      window.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", evaluate);
    };
  }, [aktif, resetKey]);

  // Tidak ada `setShow(false)` di dalam efek: saat `aktif` jadi false,
  // pemanggilnya sudah berhenti merender elemennya, jadi state sisa dari
  // halaman sebelumnya tidak pernah bocor ke render berikutnya.
  return aktif && show;
}