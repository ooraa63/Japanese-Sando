"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Home } from "lucide-react";
import type { ProfileMenuItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { ProfileSheet, ProfileTabButton } from "@/components/customer/ProfileSheet";

/**
 * Bottom navigation bar untuk mobile (HP). Fixed di bawah viewport, di atas
 * konten. Hidden di desktop (`md:hidden`).
 *
 * Tiga tab saja: Beranda · Pesanan · Profil.
 *
 * - "Menu" TIDAK jadi tab: reachable lewat section Kategori + menu lengkap
 *   di beranda, dan lewat tombol pesan di hero.
 * - "Favorit" dihapus (2026-10-10, permintaan Steven). Tidak ada halaman
 *   /favorites lagi; hati di kartu produk jadi tombol toggle biasa.
 * - "Profil" bukan link: ia membuka sheet berisi daftar menu (Account,
 *   Contact Us, FAQ, dst) yang isinya dikelola penjual dari dashboard.
 *
 * "Pesanan" dan "Profil" sama-sama butuh login, jadi keduanya disembunyikan
 * di route yang flow-nya sudah punya tombol sendiri.
 *
 * Hidden juga di /order karena alur pemesanan punya sticky bar keranjang
 * sendiri (sticky, z-30) yang akan ketimpa nav ini (fixed, z-40) — itu bug
 * "keranjang pas slide masih error" yang Steven laporkan.
 */
export function MobileBottomNav({ profileMenu = [] }: { profileMenu?: ProfileMenuItem[] }) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  const hidden = pathname.startsWith("/admin")
    || pathname.startsWith("/login")
    || pathname.startsWith("/register")
    || pathname.startsWith("/order");

  if (hidden) return null;

  const items = [
    { href: "/", label: t.nav.home, icon: Home },
    { href: "/account", label: t.nav.orders, icon: ClipboardList },
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
        <ul className="grid grid-cols-3">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
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

          {/* Profil: bukan link, tapi membuka sheet daftar menu. Sengaja
              button (bukan <a>) supaya pencreen reader membacanya sebagai
              aksi, dan supaya sheet bisa dibuka tanpa pindah halaman. */}
          <li>
            <ProfileTabButton />
          </li>
        </ul>
      </nav>

      <ProfileSheet items={profileMenu} />
    </>
  );
}