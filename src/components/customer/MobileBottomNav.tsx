"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Headphones, Home, Receipt, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Bottom navigation bar untuk mobile (HP). Fixed di bawah viewport, di atas
 * konten. Hidden di desktop (md:hidden).
 *
 * Item: Home, Pesanan Saya, Kontak, Akun.
 *
 * Hidden di route admin & auth supaya gak ganggu alur login/registrasi.
 */
export function MobileBottomNav() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  // Hide di route admin, login, register, dan halaman detail pre-order
  // (modal QR full-screen, gak perlu nav di bawah).
  const hidden = pathname.startsWith("/admin")
    || pathname.startsWith("/login")
    || pathname.startsWith("/register")
    || pathname.startsWith("/account")
    || pathname.startsWith("/order/success")
    || pathname.startsWith("/order/track");

  if (hidden) return null;

  const items = [
    { href: "/", label: t.nav.home, icon: Home },
    { href: "/account", label: t.nav.myOrder, icon: Receipt },
    { href: "/contact", label: t.nav.contact, icon: Headphones },
    { href: "/account#profile", label: t.nav.account, icon: User },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cocoa-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
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