"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Carousel gambar — auto-slide 4 detik, navigasi panah di desktop.
 *
 * ATURAN: hanya auto-slide jika ada lebih dari 1 gambar. Kalau cuma 1,
 * tampil statis (tidak ada indicator, panah, atau interval).
 *
 * Gambar di-sumber dari:
 *   - Mobile: hero_image_mobile_url + hero_mobile_carousel_urls
 *   - Desktop: hero_image_url + hero_carousel_urls
 *   - Array dihitung per render, lalu pakai as key trigger reset active index.
 */
export function HeroCarousel({
  images,
  imagesMobile,
  fallback,
  fallbackMobile,
  intervalMs = 4000,
}: {
  images?: string[];
  /** Daftar URL gambar carousel untuk mobile — tidak disamakan dengan desktop. */
  imagesMobile?: string[];
  fallback: string;
  fallbackMobile?: string;
  intervalMs?: number;
}) {
  // PENTING: jangan baca `window.matchMedia` langsung saat render.
  // Server selalu me-render versi desktop, sementara client di HP akan
  // me-render versi mobile — hasilnya hydration mismatch pada
  // `<Image src>/srcSet` (React membuang atribut itu, dan hero bisa berkedip).
  //
  // Jadi: render pertama selalu pakai nilai yang sama dengan server
  // (desktop), lalu koreksi ke versi mobile setelah mount. `key={slidesKey}`
  // di bawah sudah sengaja dipakai supaya pergantian daftar gambar me-remount
  // carousel dengan benar.
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(mq.matches);
    apply(); // <- sinkronkan segera setelah mount
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const desktopUrls = [fallback, ...(images ?? [])].filter(Boolean);
  const mobileUrls = fallbackMobile
    ? [fallbackMobile, ...(imagesMobile ?? [])]
    : [fallback, ...(imagesMobile ?? [])];

  const urls = isMobile ? mobileUrls : desktopUrls;
  const shouldSlide = urls.length > 1;
  const slidesKey = urls.join("|") + (isMobile ? "|m" : "|d");

  return (
    <CarouselInner
      key={slidesKey}
      urls={urls}
      shouldSlide={shouldSlide}
      intervalMs={intervalMs}
    />
  );
}

/**
 * Inner component — dirender dengan `key` yang berubah saat URL / device
 * berubah, sehingga state index otomatis reset ke 0 (mount ulang).
 */
function CarouselInner({
  urls,
  shouldSlide,
  intervalMs,
}: {
  urls: string[];
  shouldSlide: boolean;
  intervalMs: number;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!shouldSlide) return;
    const t = window.setInterval(() => {
      setActive((i) => (i + 1) % urls.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [shouldSlide, urls.length, intervalMs]);

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
            i === active ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}

      {shouldSlide ? (
        <>
          {/* Indikator di bawah */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Slide ${i + 1}`}
                className={`size-2 rounded-full transition ${
                  i === active ? "bg-cream-50" : "bg-cream-50/40"
                }`}
              />
            ))}
          </div>

          {/* Panah navigasi (desktop) */}
          <button
            type="button"
            onClick={() => setActive((i) => (i - 1 + urls.length) % urls.length)}
            aria-label="Sebelumnya"
            className="absolute top-1/2 left-3 z-10 hidden -translate-y-1/2 grid size-10 place-items-center rounded-full bg-cocoa-950/40 text-cream-50 backdrop-blur-sm transition hover:bg-cocoa-950/60 sm:grid"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setActive((i) => (i + 1) % urls.length)}
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