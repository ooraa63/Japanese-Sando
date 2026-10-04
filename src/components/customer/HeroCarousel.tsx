"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Carousel gambar — auto-slide 4 detik, swipeable di mobile, navigasi
 * panah di desktop. Dipakai di hero beranda. Gambar disimpan di Settings
 * (`hero_carousel_urls`) atau fallback ke `hero_image_url` / mobile.
 *
 * Catatan: tidak pakai library pihak ketiga — kita pakai timer + state
 * sederhana karena kebutuhan cuma fade transition.
 */
export function HeroCarousel({
  images,
  fallback,
  fallbackMobile,
  intervalMs = 4000,
}: {
  /** Daftar URL gambar opsional; kalau kosong pakai fallback. */
  images?: string[];
  fallback: string;
  fallbackMobile?: string;
  intervalMs?: number;
}) {
  const urls =
    images && images.length > 0
      ? [fallback, ...images]
      : [fallbackMobile ?? fallback, fallback];

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (urls.length <= 1) return;
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % urls.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [urls.length, intervalMs]);

  function go(delta: number) {
    setIdx((i) => (i + delta + urls.length) % urls.length);
  }

  return (
    <div className="absolute inset-0">
      {urls.map((url, i) => (
        <Image
          key={url}
          src={url}
          alt=""
          fill
          priority={i === 0}
          sizes="100vw"
          className={`object-cover transition-opacity duration-700 ${
            i === idx ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {/* Indikator di bawah */}
      {urls.length > 1 ? (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {urls.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              className={`size-2 rounded-full transition ${
                i === idx ? "bg-cream-50" : "bg-cream-50/40"
              }`}
            />
          ))}
        </div>
      ) : null}
      {/* Panah navigasi (desktop) */}
      {urls.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Sebelumnya"
            className="absolute top-1/2 left-3 z-10 hidden -translate-y-1/2 grid size-10 place-items-center rounded-full bg-cocoa-950/40 text-cream-50 backdrop-blur-sm transition hover:bg-cocoa-950/60 sm:grid"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Berikutnya"
            className="absolute top-1/2 right-3 z-10 hidden -translate-y-1/2 grid size-10 place-items-center rounded-full bg-cocoa-950/40 text-cream-50 backdrop-blur-sm transition hover:bg-cocoa-950/60 sm:grid"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      ) : null}
    </div>
  );
}