"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, History, Home } from "lucide-react";
import type { ProfileMenuItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { ProfileSheet, ProfileTabButton } from "@/components/customer/ProfileSheet";

/**
 * Bottom navigation bar untuk mobile (HP). Fixed di bawah viewport, di atas
 * konten. Hidden di desktop (`md:hidden`).
 *
 * Tiga tab: Beranda · Orderan · Profil.
 *
 * - "Menu" TIDAK jadi tab: reachable lewat section Kategori + menu lengkap
 *   di beranda, dan lewat tombol pesan di hero.
 * - "Favorit" dihapus (2026-10-10, permintaan Steven). Tidak ada halaman
 *   /favorites lagi; hati di kartu produk jadi tombol toggle biasa.
 * - "Profil" bukan link: ia membuka sheet berisi daftar menu (Account,
 *   Contact Us, FAQ, dst) yang isinya dikelola penjual dari dashboard.
 *
 * "Orderan" (tab tengah) BUKAN link. Menekannya membuka bar kedua di bawah
 * bar tab, berisi dua pilihan (permintaan Steven 12-10-2026):
 *   - "Cek Pesanan" -> /track, lacak satu pesanan lewat kode + nomor telepon;
 *   - "Riwayat"     -> /riwayat, daftar pesanan di HP ini (localStorage).
 *
 * Bar itu hanya hidup di halaman tempat tombolnya ditekan, lalu menutup lagi
 * sendiri begitu pembeli berpindah halaman. Jadi di beranda yang terlihat
 * hanya tiga tab, dan bar kedua muncul setelah "Orderan" ditekan.
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

  // Keadaan bar pesanan: `null` = tertutup, selain itu = pathname saat
  // pembeli terakhir kali menekan tab "Orderan".
  //
  // Kenapa disimpan sebagai PATH, bukan boolean? Karena dengan begitu
  // "tertutup lagi" terjadi Sendiri begitu halaman berpindah - tanpa
  // `useEffect` yang memanggil `setState` (React menandai itu sebagai pola
  // yang memicu render berlapis), dan tanpa bar yang menggantung di halaman
  // lain. Kalau boolean biasa, bar akan tetap tampil di /faq begitu saja.
  const [hubAt, setHubAt] = useState<string | null>(null);
  const showOrderBar = hubAt === pathname;

  if (hidden) return null;

  const orderPages = [
    { href: "/track", label: t.nav.track, icon: ClipboardList },
    { href: "/riwayat", label: t.nav.history, icon: History },
  ];

  return (
    <>
      {/* Spacer: nav di bawah ini `fixed`, jadi tidak ikut menambah tinggi
          halaman. Tanpa spasi ini, elemen terakhir halaman bisa tertutup nav.

          Tingginya BERUBAH-UBAH: nav cuma satu bar (~58px) saat menu pesanan
          tertutup, dua bar (~107px) saat terbuka. Kalau spacernya fix, maka
          saat tertutup ada ruang kosong yang menonjol di bawah halaman,
          dan saat terbuka kartu terakhir bisa tertutup. Jadi ikut
          dihitung dari state yang sama dengan `showOrderBar`.

          Yang penting bar tab dan bar pesanan tetap di dalam SATU elemen
          `<nav>`, bukan dua `fixed` terpisah — kalau dipisah, offsetnya
          harus dikarang dan akan meleset di HP yang punya safe-area.

          Hanya di HP (`md:hidden`), dan hanya di halaman yang nav-nya tampil —
          di /order, /admin, /login, /register nav-nya disembunyikan
          sehingga spacer ini ikut hilang. */}
      <div
        aria-hidden
        className={`md:hidden ${showOrderBar ? "h-[114px]" : "h-[68px]"}`}
      />

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-cocoa-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-3">
          <li>
            <Link
              href="/"
              onClick={() => setHubAt(null)}
              className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold tracking-wide transition ${
                pathname === "/"
                  ? "text-honey-600"
                  : "text-cocoa-400 hover:text-cocoa-700"
              }`}
            >
              <Home
                className={`size-5 ${
                  pathname === "/" ? "scale-110 fill-honey-400/20" : ""
                }`}
              />
              <span className="text-center leading-tight">{t.nav.home}</span>
            </Link>
          </li>

          {/* Orderan: satu-satunya tab yang bukan link. Menekannya
              membuka/menutup bar pesanan di bawahnya. Sengaja <button>
              supaya screen reader membacanya sebagai aksi, bukan tautan. */}
          <li>
            <button
              type="button"
              onClick={() => setHubAt(showOrderBar ? null : pathname)}
              aria-expanded={showOrderBar}
              aria-controls="orderan-bar"
              aria-label={t.nav.orderHubOpen}
              className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold tracking-wide transition ${
                showOrderBar
                  ? "text-honey-600"
                  : "text-cocoa-400 hover:text-cocoa-700"
              }`}
            >
              <ClipboardList
                className={`size-5 ${
                  showOrderBar ? "scale-110 fill-honey-400/20" : ""
                }`}
              />
              <span className="text-center leading-tight">{t.nav.orderHub}</span>
            </button>
          </li>

          {/* Profil: bukan link, tapi membuka sheet daftar menu. */}
          <li>
            <ProfileTabButton />
          </li>
        </ul>

        {showOrderBar ? (
          <div
            id="orderan-bar"
            className="border-t border-cocoa-100 px-3 pt-2 pb-1.5"
          >
            <div className="grid grid-cols-2 gap-2">
              {orderPages.map((p) => {
                const Icon = p.icon;
                const active = pathname.startsWith(p.href);
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition ${
                      active
                        ? "bg-honey-400/25 text-honey-600"
                        : "bg-cream-100 text-cocoa-600 hover:bg-cocoa-200/70"
                    }`}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{p.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </nav>

      <ProfileSheet items={profileMenu} />
    </>
  );
}