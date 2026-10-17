"use client";

import { useEffect } from "react";

/**
 * Kunci scroll halaman di belakang sebuah overlay (sheet keranjang, modal).
 *
 * Steven 17-10-2026 (gambar 1): "saat buka cart dia scroll dan ngebug".
 *
 * Kenapa `document.body.style.overflow = "hidden"` saja tidak cukup:
 *
 *  1. Di iOS Safari yang mengunci scroll adalah `body`, bukan `html`.
 *     Mengatur `overflow: hidden` di `body` belum tentu mencegah swipe di
 *     area gelap menarik halaman.
 *  2. Scrollbar yang hilang bikin halaman melompat ke samping. Di desktop,
 *     begitu `overflow: hidden`, ruang scrollbar ikut hilang dan semua isi
 *     halaman meleset ke kanan. Itulah yang terlihat "ngebug".
 *  3. Swipe di dalam sheet yang penuh menyalin gestur scroll ke halaman
 *     belakang kalau wadah scroll di dalam sheet tidak dikunci sendiri.
 *
 * Solusinya pola klasik: `body` dijadikan `position: fixed` dengan `top`
 * sebesar nilai scroll saat dikunci, lalu dipulihkan + dikembalikan ke posisi
 * scroll awal begitu overlay ditutup. Dengan begitu halaman benar-benar tidak
 * bisa digulir di browser mana pun dan posisinya tidak berubah.
 *
 * PENTING: dipakai lewat hook, bukan ditulis ulang di tiap komponen. Dua
 * overlay yang kebetulan terbuka bersamaan dihitung lewat penghitung
 * kedalaman, jadi overlay yang menutup duluan tidak membuka halaman sedangkan
 * yang lain masih terbuka.
 */

/** Style body/html yang sedang aktif, disimpan sekali saat kunci pertama. */
interface Simpanan {
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverflowY: string;
  bodyPaddingRight: string;
  htmlOverflow: string;
  scrollY: number;
}

let kedalaman = 0;
let simpanan: Simpanan | null = null;

function kunci(): void {
  const body = document.body;
  const html = document.documentElement;
  const scrollY = window.scrollY;

  simpanan = {
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyOverflowY: body.style.overflowY,
    bodyPaddingRight: body.style.paddingRight,
    htmlOverflow: html.style.overflow,
    scrollY,
  };

  // Kompensasi ruang scrollbar supaya isi halaman tidak melompat ke samping
  // ketika ruang scrollbar menghilang.
  const lebarScrollbar = window.innerWidth - html.clientWidth;
  if (lebarScrollbar > 0) {
    const paddingSekarang = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${paddingSekarang + lebarScrollbar}px`;
  }

  // `position: fixed` + `top` negatif = terkunci di semua browser, termasuk
  // iOS Safari yang mengabaikan `overflow: hidden` di body.
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  // `scroll` (bukan `hidden`) supaya ruang scrollbar tetap ada walau
  // padding-nya belum sempat dihitung.
  body.style.overflowY = "scroll";
  html.style.overflow = "hidden";
}

function buka(): void {
  if (!simpanan) return;
  const body = document.body;
  const html = document.documentElement;

  body.style.position = simpanan.bodyPosition;
  body.style.top = simpanan.bodyTop;
  body.style.left = simpanan.bodyLeft;
  body.style.right = simpanan.bodyRight;
  body.style.width = simpanan.bodyWidth;
  body.style.overflowY = simpanan.bodyOverflowY;
  body.style.paddingRight = simpanan.bodyPaddingRight;
  html.style.overflow = simpanan.htmlOverflow;

  // Kembalikan posisi scroll yang tadi "disembunyikan" oleh `top` negatif.
  window.scrollTo(0, simpanan.scrollY);
  simpanan = null;
}

/**
 * Kunci scroll selama `aktif` bernilai true. Aman dipakai di beberapa
 * komponen sekaligus.
 */
export function useScrollLock(aktif: boolean): void {
  useEffect(() => {
    if (!aktif) return;

    kedalaman += 1;
    if (kedalaman === 1) kunci();

    return () => {
      kedalaman = Math.max(0, kedalaman - 1);
      if (kedalaman === 0) buka();
    };
  }, [aktif]);
}