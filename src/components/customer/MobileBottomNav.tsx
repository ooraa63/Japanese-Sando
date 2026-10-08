"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Bottom navigation bar untuk mobile (HP). Fixed di bawah viewport, di atas
 * konten. Hidden di desktop (`md:hidden`).
 *
 * Item: Beranda, Pesanan Saya, Akun.
 *
 * "Kontak" TIDAK ada di sini (dokumen "Perbaikan Ruma Komugi 2" item 2):
 * link Kontak dihapus dari navigasi, dan informasi toko dipindah ke halaman
 * /account — di sana ada bar "Kontak" yang membuka popup, plus blok
 * "Hubungi Kami" lengkap di bawah form profil.
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
    { href: "/account", label: t.nav.myOrder, icon: Receipt },
    { href: "/account#profile", label: t.nav.account, icon: User },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cocoa-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-3">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold tracking-wide transition ${
                  active
                    ? "text-cocoa-900"
                    : "text-cocoa-400 hover:text-cocoa-700"
                }`}
              >
                <Icon
                  className={`size-5 ${active ? "scale-110 text-matcha-700" : ""}`}
                />
                <span className={active ? "text-cocoa-900" : ""}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}