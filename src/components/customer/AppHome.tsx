"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Bundle, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { MAX_NEW_PICKS } from "@/lib/utils";
import { BundleShowcase } from "@/components/customer/BundleShowcase";
import { FlavorCard } from "@/components/customer/FlavorCard";

/**
 * Beranda bergaya aplikasi.
 *
 * Urutan sekarang (12-10-2026): sapaan -> hero banner (carousel) ->
 * "Menu Baru" -> "Paket Hemat" -> "Favorite" -> (menu lengkap).
 *
 * Semua section memakai palet coklat yang sudah ada (cocoa/cream/honey).
 * Referensinya oranye, jadi aksen diambil dari `honey-*` — tetap di
 * keluarga coklat, bukan warna baru.
 */

/* ==================================================================
 * Sapaan — "Good morning, User! ☕"
 * ================================================================ */

/** Bahasa sapaan menurut jam lokal. Nilai balik string, jadi stabil. */
function greetingForHour(t: ReturnType<typeof useI18n>["t"]) {
  const h = new Date().getHours();
  if (h < 11) return t.home.greetingMorning;
  if (h < 18) return t.home.greetingAfternoon;
  return t.home.greetingEvening;
}

/** Jam tidak punya "perubahan" yang perlu dipantau. */
function noopSubscribe() {
  return () => {};
}

export function HomeGreeting({ userName }: { userName?: string | null }) {
  const { t } = useI18n();

  // Jam adalah "sumber luar", jadi dibaca lewat useSyncExternalStore —
  // bukan useEffect + setState (itu cascading render, dan React 19 +
  // eslint menolaknya). Server selalu merender sapaan pagi; client
  // membaca jam sungguhan SESUDAH hydration, jadi tidak ada mismatch.
  const greeting = useSyncExternalStore(
    noopSubscribe,
    () => greetingForHour(t),
    () => t.home.greetingMorning
  );

  const name = userName?.trim() || t.home.guest;

  return (
    <h1 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-900 sm:text-xl">
      {greeting}, {name}!
      <span aria-hidden className="text-base">
        ☕
      </span>
    </h1>
  );
}

/* ==================================================================
 * Hero banner — gambar di kanan, teks di kiri, titik carousel
 * ================================================================ */
export function HeroBanner({
  images,
  ctaSlot,
}: {
  images: string[];
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
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasCarousel, slides.length]);

  const src = slides[active] ?? null;

  return (
    <div className="relative overflow-hidden rounded-[1.75rem] bg-cocoa-900 shadow-lg shadow-cocoa-900/15">
      {/* Foto produk menutupi separuh kanan banner. */}
      {src ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2">
          <Image
            src={src}
            alt=""
            fill
            priority
            sizes="50vw"
            className="object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-cocoa-900 via-cocoa-900/55 to-transparent" />
        </div>
      ) : null}

      <div className="relative p-5 pr-[45%] sm:p-7 sm:pr-[45%]">
        <h2 className="font-display text-xl leading-tight font-extrabold text-balance text-cream-50 sm:text-2xl">
          {t.home.heroTitleTop}{" "}
          <span className="text-honey-400">{t.home.heroTitleAccent}</span>
          <br />
          {t.home.heroTitleBottom}
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-cream-200/75 sm:text-sm">
          {t.home.heroDesc}
        </p>
        <div className="mt-4">{ctaSlot}</div>
      </div>

      {/* Titik carousel ala referensi: yang aktif memanjang. */}
      {hasCarousel ? (
        <div className="relative flex items-center justify-center gap-1.5 pb-4">
          {slides.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === active}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-5 bg-honey-400" : "w-2 bg-cream-50/40"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ==================================================================
 * Section "Menu Baru" — produk yang PENJUAL tandai sendiri sebagai baru.
 *
 * Permintaan Steven (11-10-2026): "Nantinya akan ada menu baru, dan ingin
 * diletak di mungkin atas bundle lalu seperti biasa namun mau tambahin satu
 * tulisan kayak 'New' jadi orang bisa tertarik, dan di admin dia bisa set
 * menu mana yang new kalau di set new nanti masuk ke sana."
 *
 * Tiga keputusan di sini:
 *
 * 1. **Posisi di atas "Paket Hemat"**, tepat setelah hero. Section ini
 *    berisi hal yang paling ingin dilihat pembeli baru, jadi ia tidak boleh
 *    menunggu sampai shopper menggulir melewati paket.
 *
 * 2. **Grid 3 kolom.** Dulu ini baris mendatar (scroll horizontal) supaya
 *    enam kartu muat satu baris, tapi Steven 12-10-2026 minta ukurannya
 *    disamakan dengan section di bawahnya. Sekarang enam kartu jadi dua baris
 *    penuh, dan itu disengaja.
 *
 * 3. **Hati di sini READ-ONLY.** Section "Menu" di bawah tetap jadi satu-satunya
 *    tempat likes di beranda — kalau "Menu Baru" juga bisa di-like, aturan itu
 *    jadi kabur.
 *
 * Kartu memakai `FlavorCard` mode `dense` yang SAMA dengan section "Menu",
 * jadi keduanya dijamin tidak melenceng. Yang membedakan cuma prop
 * `badgeLabel` (label "New" menggantikan "Favorite").
 * ================================================================ */
export function NewShowcase({ flavors }: { flavors: Flavor[] }) {
  const { t } = useI18n();

  // Penjual belum menandai apa pun -> section disembunyikan total, bukan
  // menampilkan judul kosong. Ini yang terjadi sampai Steven memilih produk
  // dari dashboard.
  if (flavors.length === 0) return null;

  return (
    <section>
      <SectionHead title={t.home.newSection} />
      {/* Grid 3 kolom. Padding kartu juga sama dengan kartu di halaman
          "Menu" (`gap-2.5 / sm:gap-3`) supaya baris ini dan yang di bawahnya
          terlihat satu kesatuan.

         /* REQUEST: Steven 12-10-2026 minta section "Menu Baru" disamakan ukurannya dengan section yang tadinya "Populer". Section "Populer" sendiri sudah dihapus pada permintaan yang sama, jadi acuan ukurannya sekarang kartu di halaman Menu. */}
      <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {flavors.map((f) => (
          <li key={f.id} className="flex">
            <FlavorCard
              flavor={f}
              dense
              badgeLabel={t.home.newBadge}
              showSocial
              readOnlySocial
              showSold={false}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------- judul section + link "Lihat semua" ---------- */
function SectionHead({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-base font-extrabold text-cocoa-900">{title}</h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="shrink-0 text-xs font-bold text-honey-600 transition hover:text-honey-500"
        >
          {linkLabel}
        </Link>
      ) : null}
    </div>
  );
}

/* ==================================================================
 * Section "Favorite" — produk yang PENJUAL tandai bintang di dashboard.
 *
 * Permintaan Steven (12-10-2026): "saya mau kembalikan fitur yang baris
 * popular di bawah bundle" dan "yang logo favorite, itu tidak perlu
 * lagi, jadi nanti ada baris tersendiri yang dibawah bundle yaitu
 * Favorite/best seller".
 *
 * Dua keputusan yang berlaku di sini:
 *
 * 1. **Sumbernya satu: `flavors.is_featured`.** Ini toggle yang sama dengan
 *    yang dipakai Steven di Admin > Menu. Tidak ada pemilih kedua di
 *    Pengaturan, jadi baris ini dan label "New" tidak mungkin pernah
 *    bertengkar soal produk mana yang unggulan.
 *
 * 2. **Badge bintang DIHAPUS dari kartu produk** (lihat `FlavorCard`,
 *    `showBadge` default false). Sebelumnya produk unggulan ditandai dua
 *    kali: badge di foto produk saat tampil di section "Menu", DAN baris
 *    ini. Dua penanda untuk satu hal hanya membuat beranda terasa
 *    berantakan, jadi Steven minta yang menempel di kartu dibuang.
 *
 * Yang TIDAK diubah: kolom `popular_flavor_ids` di DB. Kolom itu tidak
 * dipakai baris ini (sumbernya `is_featured` sejak 12-10-2026), tapi
 * biarkan saja supaya draft admin tetap membawanya apa adanya dan kolom
 * lama tidak ikut terkosongkan.
 *
 * Kartu memakai `FlavorCard` mode `dense` yang SAMA dengan section "Menu"
 * dan "Menu Baru", jadi ketiganya dijamin tidak melenceng. Hati di sini
 * READ-ONLY supaya section "Menu" tetap menjadi satu-satunya tempat
 * like di beranda — aturan yang sama seperti di section "Menu Baru".
 * ================================================================ */
export function FavoriteShowcase({ flavors }: { flavors: Flavor[] }) {
  const { t } = useI18n();

  // Belum ada yang ditandai -> disembunyikan total, bukan menampilkan
  // judul kosong. Perlakuan yang sama seperti section "Menu Baru".
  if (flavors.length === 0) return null;

  return (
    <section>
      <SectionHead title={t.home.favoriteSection} />
      {/* Grid 3 kolom dengan gap yang sama persis seperti section di
          atasnya (`gap-2.5 / sm:gap-3`) supaya tiga baris kartu itu
          terbaca sebagai satu kesatuan, bukan tiga blok terpisah. */}
      <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {flavors.map((f) => (
          <li key={f.id} className="flex">
            <FlavorCard flavor={f} dense showSocial readOnlySocial showSold={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ==================================================================
 * Komposisi seluruh isi beranda
 * ================================================================ */

export function AppHome({
  categories,
  bundles = [],
  heroImages,
  userName,
  ctaSlot,
}: {
  categories: Category[];
  /** Bundle / paket hemat — ditampilkan sebelum section "Menu Baru" selesai. */
  bundles?: Bundle[];
  heroImages: string[];
  userName?: string | null;
  ctaSlot: React.ReactNode;
}) {
  const allFlavors = useMemo(
    () => categories.flatMap((c) => c.flavors ?? []),
    [categories]
  );

  // Section "Menu Baru" — dibaca dari toggle "New" di form flavor admin
  // (kolom `flavors.is_new`, migration-45). Murni pilihan PENJUAL, TIDAK ada
  // fallback otomatis: menebak "mana yang baru" dari tanggal dibuat akan sering
  // salah (produk lama yang fotonya baru diupload), jadi lebih baik kosong
  // daripada menampilkan label "New" pada barang yang bukan baru.
  const newPicked = useMemo(
    () => allFlavors.filter((f) => f.is_new).slice(0, MAX_NEW_PICKS),
    [allFlavors]
  );

  // Section "Favorite" — produk yang PENJUAL tandai bintang di Admin > Menu
  // (kolom `flavors.is_featured`). Muncul tepat DI BAWAH "Paket Hemat",
  // sesuai permintaan Steven 12-10-2026. Badge bintang di kartu produk
  // sengaja tidak dipakai di sini: penandaan Favorite sudah punya tempat
  // sendiri, jadi tidak perlu diulang per kartu.
  const favoritePicked = useMemo(
    () => allFlavors.filter((f) => f.is_featured),
    [allFlavors]
  );

  // Urutan beranda (permintaan Steven, 12-10-2026):
  //   sapaan -> hero -> Menu Baru -> paket hemat -> Favorite -> menu lengkap
  return (
    <div className="space-y-6">
      <HomeGreeting userName={userName} />

      <HeroBanner images={heroImages} ctaSlot={ctaSlot} />

      <NewShowcase flavors={newPicked} />

      <BundleShowcase bundles={bundles} />

      <FavoriteShowcase flavors={favoritePicked} />
    </div>
  );
}
