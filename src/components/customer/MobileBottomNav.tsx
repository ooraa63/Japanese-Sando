"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Heart, Home, Receipt, UtensilsCrossed } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Bottom navigation bar untuk mobile (HP). Fixed di bawah viewport, di atas
 * konten. Hidden di desktop (`md:hidden`).
 *
 * Susunan mengikuti UIUX 4: Beranda · Menu · Pesanan · Favorit · Profil.
 *
 * "Kontak" TIDAK ada di sini (dokumen "Perbaikan Ruma Komugi 2" item 2):
 * link Kontak dihapus dari navigasi, dan informasi toko dipindah ke halaman
 * /account — di sana ada bar "Kontak" yang membuka popup, plus blok
 * "Hubungi Kami" lengkap di bawah form profil.
 *
 * "Pesanan" dan "Profil" sama-sama menuju /account karena memang satu
 * halaman: daftar pesanan + form profil + kontak + voucher.
 *
 * Hidden di route admin & auth supaya gak ganggu alur login/registrasi,
 * dan di /order karena alur pemesanan punya sticky bar keranjang sendiri
 * (sticky, z-30) yang akan ketimpa nav ini (fixed, z-40) — itu bug
 * "keranjang pas slide masih error" yang Steven laporkan.
 */
export function MobileBottomNav() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  const hidden = pathname.startsWith("/admin")
    || pathname.startsWith("/login")
    || pathname.startsWith("/register")
    || pathname.startsWith("/account")
    || pathname.startsWith("/order");

  if (hidden) return null;

  const items = [
    { href: "/", label: t.nav.home, icon: Home },
    { href: "/#menu", label: t.nav.menu, icon: UtensilsCrossed },
    { href: "/account", label: t.nav.orders, icon: ClipboardList },
    { href: "/favorites", label: t.nav.favorites, icon: Heart },
    { href: "/account#profile", label: t.nav.account, icon: Receipt },
  ];

  return (
    <>
      {/* Spacer: nav di bawah ini `fixed`, jadi tidak ikut menambah tinggi
          halaman. Tanpa spasi ini, elemen terakhir halaman bisa tertutup nav.

          Perlu karena footer (blok info toko) disembunyikan di HP. Sebelumnya
          footer ikut memberi ~24px padding bawah di akhir halaman, dan itu
          yang jadi jarak aman terhadap nav ini. Sekarang footer tidak ada, jadi
          spasi penggantinya harus dibuat eksplisit.

          Hanya di HP (`md:hidden`), dan hanya di halaman yang nav-nya tampil —
          di /order, /account, /admin, /login, /register nav-nya disembunyikan
          sehingga spacer ini ikut hilang. */}
      <div aria-hidden className="h-[68px] md:hidden" />

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-cocoa-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {items.map((item) => {
            const [base, hash] = item.href.split("#");
            const active =
              hash
                ? false
                : pathname === base || (base !== "/" && pathname.startsWith(base));
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold tracking-wide transition ${
                    active
                      ? "text-honey-600"
                      : "text-cocoa-400 hover:text-cocoa-700"
                  }`}
                >
                  <Icon
                    className={`size-5 ${active ? "scale-110 fill-honey-400/20" : ""}`}
                  />
                  <span className="text-center leading-tight">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}