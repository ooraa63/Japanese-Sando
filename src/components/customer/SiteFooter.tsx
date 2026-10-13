"use client";
import { DEFAULT_STORE_NAME } from "@/lib/brand";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, HelpCircle, MessageCircle, Timer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { waLink } from "@/lib/utils";
import { useRevealOnScroll } from "@/lib/useRevealOnScroll";
import type { StoreSettings } from "@/lib/types";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

export function SiteFooter({ settings }: { settings: StoreSettings | null }) {
  const { t, lang } = useI18n();

  const storeName = settings?.store_name || DEFAULT_STORE_NAME;
  const hours = lang === "en" ? settings?.hours_en : settings?.hours_id;
  const deadline = lang === "en" ? settings?.deadline_en : settings?.deadline_id;

  // Steven 13-10-2026: footer ikut disembunyikan sampai pengguna menggulir,
  // sama seperti bottom nav. "Di /riwayat blok coklatnya langsung nempel di
  // layar pertama, padahal di /track baru muncul setelah di-scroll" — dia mau
  // konsisten, keduanya baru muncul begitu digulir.
  //
  // `pathname` jadi resetKey supaya pindah halaman mengulang penghitungan dari
  // nol. Tanpa pengecualian "kalau tidak bisa digulir, tetap tampilkan":
  // begitu ada pengecualian, elemen muncul diam-diam tepat setelah pindah
  // halaman — perilaku yang justru Steven tolak.
  //
  // Konsekuensinya halaman WAJIB selalu punya ruang scroll. Itulah gunanya
  // `pb-16` di bawah.
  const pathname = usePathname() ?? "";
  const reveal = useRevealOnScroll(true, pathname);

  return (
    // Steven (dokumen "Perbaikan Ruma Komugi 2" item 1 & 2): footer ini adalah
    // blok INFORMASI TOKO — Tautan Cepat + Hubungi Kami (FAQ, WhatsApp,
    // Instagram, alamat, jam buka). Di HP tidak dipakai lagi; cukup di PC.
    //
    // Di HP informasinya pindah ke halaman /account: bar "Kontak" membuka
    // popup, dan blok "Hubungi Kami" lengkap ada di bawah form profil
    // (lihat ContactMenuRow + ContactSection).
    //
    // `hidden md:block` = tidak sama sekali di HP, tampil penuh di laptop.
    //
    // `invisible` dipakai bareng `opacity-0` supaya footer yang tersembunyi
    // benar-benar keluar dari tab-order. Kalau hanya digeser keluar layar,
    // link di dalamnya masih bisa difokus pakai keyboard.
    //
    // PENTING — kenapa TIDAK pakai `translate-y-full` di sini (bottom nav
    // memang memakainya dan itu aman):
    //
    // Footer ini `position: static`, jadi berada di dalam flow. Menggesernya
    // dengan transform membuat posisinya berubah, dan itu memicu SCROLL
    // ANCHORING browser untuk mengoreksi scroll agar konten tidak meloncat.
    // Di halaman yang ruang scroll-nya cuma ~300px (/riwayat) hasilnya
    // feedback loop: scroll naik -> footer muncul -> anchoring menarik scroll
    // turun lagi -> footer hilang -> anchoring dorong naik -> ... Halaman jadi
    // tidak bisa di-scroll sama sekali (scrollY terkunci di 12px) dan footer
    // berkedip.
    //
    // Nav bawah aman dari ini karena `position: fixed` — fixed tidak ikut
    // memengaruhi posisi elemen lain, jadi scroll anchoring tidak bereaksi.
    //
    // Efeknya tetap sesuai permintaan Steven: footer tidak ada di layar
    // pertama, baru muncul setelah digulir. Ruangnya juga tidak berubah
    // karena `visibility: hidden` tetap menempati tempat di layout, jadi
    // halaman tidak melompat saat digulir.
    //
    // Ruang gulir 64px yang membuat semua ini bisa bekerja TIDAK ditaruh
    // di sini. Padding di dalam <footer> (pb-16) maupun div spacer sebagai
    // saudara di wrapper halaman sama-sama tidak menambah tinggi halaman:
    // tiap halaman membungkus header+main di dalam anak `flex-1` milik
    // wrapper `min-h-dvh`, dan anak itu menyerap seluruh ruang kosong yang
    // tersisa. Terbukti di /riwayat 1912x807: dengan pb-16 maupun dengan
    // spacer, `scrollHeight` tetap 807 = persis tinggi viewport; yang
    // bergeser cuma posisi footer (504 -> 440).
    //
    // Jadi batas minimal tinggi halaman dipasang di `<body>` pada
    // src/app/layout.tsx (`min-h-[calc(100dvh+4rem)]`) — satu tempat untuk
    // semua halaman. Di sana tidak ada yang menyerap ruang kosong, jadi
    // 64px itu benar-benar jadi ruang scroll.
    // Tanpa itu, footer di halaman yang isinya muat pas di layar pertama
    // tidak akan pernah bisa muncul: tidak ada yang bisa digulir untuk
    // memunculkannya.
    <footer
      className={`mt-14 hidden bg-cocoa-900 text-cream-200 transition-opacity duration-200 ease-out md:block ${
        reveal ? "visible opacity-100" : "invisible opacity-0"
      }`}
    >
      <div className="bg-seigaha">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              {settings?.logo_url ? (
                <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-cream-50">
                  <Image
                    src={settings.logo_url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream-50 text-cocoa-900">
                  <span className="font-display text-xl font-bold">和</span>
                </span>
              )}
              <div>
                <p className="font-display text-xl font-bold text-cream-50">
                  {storeName}
                </p>
                {settings?.brand_line ? (
                  <p className="text-[10px] font-bold tracking-[0.18em] text-honey-300/80 uppercase">
                    {settings.brand_line}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-cream-200/70">
              {lang === "en" ? settings?.description_en : settings?.description_id}
            </p>
            <div className="mt-5">
              <LanguageToggle />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-[0.18em] text-berry-400 uppercase">
              {t.footer.quickLinks}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                { href: "/#menu", label: t.nav.menu },
                { href: "/#how", label: t.nav.howItWorks },
                { href: "/order", label: t.nav.order },
                { href: "/track", label: t.nav.track },
                // "Kontak" dihapus dari daftar tautan (dokumen "Perbaikan Ruma
                // Komugi 2", item 2): kontak sekarang hidup di halaman /account
                // — tekan "Kontak" di sana untuk membuka popup info kontak.
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-cream-200/75 transition hover:text-cream-50"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail kontak (WA / IG / alamat) pindah ke halaman /contact supaya
              footer tetap ringkas di HP. */}
          <div>
            <h3 className="text-xs font-bold tracking-[0.18em] text-berry-400 uppercase">
              {t.footer.getInTouch}
            </h3>
            <ul className="mt-4 space-y-3.5 text-sm text-cream-200/75">
              <li>
                <Link
                  href="/contact#faq"
                  className="inline-flex items-start gap-2.5 transition hover:text-cream-50"
                >
                  <HelpCircle className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                  <span>{t.contactPage.faqTitle}</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="inline-flex items-start gap-2.5 transition hover:text-cream-50"
                >
                  <MessageCircle className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                  <span>{t.contactPage.title}</span>
                </Link>
              </li>
              {hours ? (
                <li className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                  <span>{hours}</span>
                </li>
              ) : null}
              {deadline ? (
                <li className="flex items-start gap-2.5">
                  <Timer className="mt-0.5 size-4 shrink-0 text-honey-300" />
                  <span>{deadline}</span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="border-t border-cream-50/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 text-xs text-cream-200/50 sm:flex-row sm:justify-between sm:px-6">
            <p>
              © {new Date().getFullYear()} {storeName}. {t.footer.rights}
            </p>
            <div className="flex items-center gap-4">
              {settings?.whatsapp ? (
                <a
                  href={waLink(settings.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-cream-200/80"
                >
                  WhatsApp
                </a>
              ) : null}
              {settings?.instagram ? (
                <a
                  href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-cream-200/80"
                >
                  Instagram
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}