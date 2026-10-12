"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, History } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Bar tab di ATAS halaman pesanan (referensi: halaman "Aktivitas" GoFood, yang
 * Steven kirim 12-10-2026).
 *
 * Alurnya: pembeli menekan tab "Orderan" di bottom nav -> langsung mendarat
 * di /track (Cek Pesanan). Di halaman itu ada bar tab dengan pilihan:
 *   - Cek Pesanan -> lacak satu pesanan lewat kode + nomor telepon;
 *   - Riwayat     -> daftar pesanan di HP ini (localStorage).
 *
 * Tampilan meniru referensi: deretan label mendatar, tab aktif tebal +
 * garis bawah berwarna, tab lain abu-abu. Sengaja bukan tab berbentuk kotak
 * seperti versi sebelumnya, karena itu yang Steven maksudkan - bar label.
 *
 * Bar ini di-render oleh kedua halaman (`/track` dan `/riwayat`), jadi dari
 * mana pun pembeli masuk, dia selalu bisa pindah ke yang lain tanpa lewat
 * bottom nav dulu.
 */
export function OrderHubTabs() {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  const tabs = [
    { href: "/track", label: t.nav.track, icon: ClipboardList },
    { href: "/riwayat", label: t.nav.history, icon: History },
  ];

  return (
    <nav
      aria-label={t.nav.orderHub}
      className="sticky top-0 z-30 -mx-4 border-b border-cocoa-200 bg-cream-50/95 px-4 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <ul className="-mb-px flex gap-6 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-1.5 border-b-2 px-0.5 py-3 text-sm font-bold whitespace-nowrap transition ${
                  active
                    ? "border-honey-500 text-cocoa-900"
                    : "border-transparent text-cocoa-400 hover:text-cocoa-700"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}