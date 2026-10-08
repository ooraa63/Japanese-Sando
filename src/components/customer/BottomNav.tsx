"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Receipt, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Bottom navigation bar. Fixed di bawah viewport, di atas konten.
 *
 * **Hanya muncul di laptop/desktop (`hidden md:block`).** Steven: "Pada bagian
 * hp saya tidak ada mau bagian bawah itu, karena info dibawah nanti ada di
 * bagian akun, tapi untuk laptop tetap harus ada." Jadi di HP Navigasi bawah
 * dihilangkan — semua isinya (Pesanan Saya, Akun, Kontak) sudah ada di dalam
 * halaman /account. Di desktop nav bawah tetap tampil.
 *
 * Item: Beranda, Pesanan Saya, Akun.
 *
 * "Kontak" sengaja TIDAK ada di sini sejak item 2 dokumen perbaikan: kontak
 * dipindah ke halaman Akun (popup), bukan link terpisah.
 *
 * Hidden di route admin & auth supaya gak ganggu alur login/registrasi.
 */
export function BottomNav() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  // Hide di route admin, login, register, dan halaman detail pre-order
  // (modal QR full-screen, gak perlu nav di bawah).
  //
  // `/order` juga disembunyikan: alur pemesanan punya sticky bar keranjang
  // sendiri yang menempel di bawah (`CartStickyBar`, z-30). Kalau nav situs
  // (z-40) ikut muncul di sana, bar keranjang ketimpa — persis bug "keranjang
  // pas slide masih error" yang Steven laporkan.
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
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-cocoa-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] md:block"
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-3 px-6">
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