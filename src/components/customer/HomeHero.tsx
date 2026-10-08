"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Hero beranda dengan layout split ala UIUX 1 (Halda).
 *
 * Bentuknya: panel kiri muda dengan badge lingkaran besar, panel tengah
 * berisi foto produk utama, panel kanan lebih gelap berisi judul + CTA.
 * Warna tetap coklat (cream/cocoa) — yang diambil hanya TAMPILANNYA.
 *
 * Foto utama bisa berganti (carousel) dengan titik indikator di bawah,
 * sama seperti referensi. Kalau hanya ada 1 foto, tidak ada dots.
 */
export function HomeHero({
  images = [],
  ctaSlot,
}: {
  /** Foto tambahan hero carousel (desktop). */
  images?: string[];
  /** Tombol CTA (biasanya <OrderNowLink />) — dikirim dari server component. */
  ctaSlot: React.ReactNode;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState(0);

  const slides = useMemo(() => images.filter(Boolean), [images]);
  const hasCarousel = slides.length > 1;

  useEffect(() => {
    if (!hasCarousel) return;
    const timer = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [hasCarousel, slides.length]);

  const mainImage = slides[active] ?? null;

  return (
    <section className="relative overflow-hidden bg-cream-100">
      {/* Gradasi lembut biar panel kanan terasa lebih "dalam" */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cream-50 via-cream-100 to-cocoa-100" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-4 lg:py-20">
        {/* ---------- Panel kiri: badge lingkaran + mini preview ---------- */}
        <div className="order-2 flex items-center gap-4 lg:order-1 lg:flex-col lg:items-start lg:gap-6">
          <span className="grid size-32 shrink-0 place-items-center rounded-full bg-cocoa-800 px-6 text-center font-display text-lg leading-tight font-bold text-cream-50 shadow-xl shadow-cocoa-900/20 sm:size-40 sm:text-xl lg:size-44 lg:text-2xl">
            {t.home.badgeTop}
            <br />
            <span className="text-cream-300">{t.home.badgeBottom}</span>
          </span>

          {/* Preview kecil dari slide berikutnya — memberi kesan ada lebih
              dari satu produk tanpa butuh thumbnail terpisah di database. */}
          {slides.length > 1 ? (
            <button
              type="button"
              onClick={() => setActive((active + 1) % slides.length)}
              className="relative size-20 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg transition hover:scale-105 sm:size-24"
              aria-label={t.hero.ctaSecondary}
            >
              <Image
                src={slides[(active + 1) % slides.length]}
                alt=""
                fill
                sizes="96px"
                className="object-cover"
              />
            </button>
          ) : null}
        </div>

        {/* ---------- Panel tengah: foto produk utama ---------- */}
        <div className="order-1 lg:order-2">
          <div className="relative mx-auto aspect-square w-full max-w-md">
            {mainImage ? (
              <Image
                src={mainImage}
                alt=""
                fill
                priority
                sizes="(max-width: 1024px) 80vw, 40vw"
                className="object-contain drop-shadow-2xl"
              />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-full bg-cocoa-100 font-display text-7xl font-bold text-cocoa-300">
                日
              </div>
            )}
          </div>

          {/* Titik indikator carousel */}
          {hasCarousel ? (
            <div className="mt-6 flex items-center justify-center gap-2">
              {slides.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Slide ${i + 1}`}
                  aria-current={i === active}
                  className={`size-2.5 rounded-full transition ${
                    i === active
                      ? "w-7 bg-cocoa-800"
                      : "bg-cocoa-300 hover:bg-cocoa-500"
                  }`}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* ---------- Panel kanan: judul + CTA ---------- */}
        <div className="order-3 text-center lg:text-left">
          <p className="text-xs font-bold tracking-[0.25em] text-cocoa-500 uppercase">
            {t.hero.eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl leading-[1.1] font-extrabold text-balance text-cocoa-900 sm:text-4xl lg:text-[2.9rem]">
            {t.hero.title}
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-cocoa-600 sm:text-base lg:mx-0">
            {t.hero.subtitle}
          </p>

          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            {ctaSlot}
            <a
              href="#menu"
              className="btn-outline !rounded-full !px-6 !py-3 text-sm"
            >
              {t.hero.ctaSecondary}
              <ArrowRight className="size-4" />
            </a>
          </div>

          <p className="mt-8 font-display text-[11px] tracking-[0.3em] text-cocoa-400 uppercase">
            {t.hero.badge}
          </p>
        </div>
      </div>
    </section>
  );
}