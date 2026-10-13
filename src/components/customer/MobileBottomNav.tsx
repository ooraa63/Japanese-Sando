"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ClipboardList, Home } from "lucide-react";
import type { ProfileMenuItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { ProfileSheet, ProfileTabButton } from "@/components/customer/ProfileSheet";

/**
 * Berapa px pengguna harus menggulir sebelum nav bawah muncul.
 *
 * Sengaja kecil. Alasannya: halaman pendek seperti /riwayat (hanya ~68px
 * ruang scroll, semuanya cuma spacer buat nav itu sendiri) TIDAK punya ruang
 * buat ambang besar — dengan ambang 80px nav tidak akan pernah muncul di sana,
 * persis halaman yang jadi keluhan Steven. 16px cukup untuk menyaring
 * getaran sub-piksel tanpa membuat halaman pendek jadi buntu.
 */
const NAV_REVEAL_PX = 16;

/**
 * True kalau nav bawah layak ditampilkan: pengguna sudah menggulir ke bawah.
 *
 * SENGAJA TIDAK ada pengecualian "kalau halaman tidak bisa digulir, tetap
 * tampilkan". Percobaan pertama punya pengecualian itu dengan alasan supaya
 * pembeli tidak kehilangan navigasi di halaman pendek. Setelah diuji ternyata
 * tidak perlu: setiap halaman pembeli sudah merender spacer 68px
 * (`h-[68px] md:hidden`), jadi selalu ada yang bisa digulir dan nav selalu
 * bisa dijangkau. Pengecualian itu cuma membuat nav muncul diam-diam tepat
 * setelah pindah halaman, persis yang Steven minta dihilangkan ("jangan
 * ketika klik Riwayat langsung muncul").
 *
 * `resetKey` (pathname) jadi dependensi supaya efeknya jalan ulang setiap
 * pindah halaman. Next.js mengembalikan scroll ke 0, tapi event "scroll"
 * tidak selalu sempat dilepas pada momen itu; dengan memanggil ulang
 * evaluate(), nav ikut menghitung ulang posisinya.
 */
function useShowNavOnScroll(active: boolean, resetKey: string) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!active) return;

    const evaluate = () => {
      setShow(window.scrollY > NAV_REVEAL_PX);
    };

    // Dipanggil sekali di sini supaya tampilan benar sejak frame pertama
    // (termasuk saat browser memulihkan posisi scroll). Sisa pemanggilan datang
    // dari event scroll/resize.
    evaluate();
    window.addEventListener("scroll", evaluate, { passive: true });
    window.addEventListener("resize", evaluate);
    return () => {
      window.removeEventListener("scroll", evaluate);
      window.removeEventListener("resize", evaluate);
    };
  }, [active, resetKey]);

  // Tidak ada `setShow(false)` di dalam effect: saat `active` jadi false,
  // komponennya sudah `return null` jadi nav tidak dirender sama sekali.
  // Mengembalikan `active && show` membuat state sisa dari halaman sebelumnya
  // tidak pernah bocor ke render berikutnya.
  return active && show;
}

/**
 * Bottom navigation bar untuk mobile (HP). Fixed di bawah viewport, di atas
 * konten. Hidden di desktop (`md:hidden`).
 *
 * Tiga tab saja: Beranda · Orderan · Profil.
 *
 * - "Menu" TIDAK jadi tab: reachable lewat section Kategori + menu lengkap
 *   di beranda, dan lewat tombol pesan di hero.
 * - "Favorit" dihapus (2026-10-10, permintaan Steven). Tidak ada halaman
 *   /favorites lagi; hati di kartu produk jadi tombol toggle biasa.
 * - "Profil" bukan link: ia membuka sheet berisi daftar menu (Account,
 *   Contact Us, FAQ, dst) yang isinya dikelola penjual dari dashboard.
 *
 * "Orderan" (tab tengah) mengarah ke `/track` (permintaan Steven 12-10-2026).
 * Pembeli tidak punya akun, jadi tidak ada "dashboard pesanan" terpisah —
 * begitu menekan "Orderan" dia langsung sampai di halaman lacak pesanan.
 * Pilihan "Riwayat" tidak lagi berupa bar di bawah bottom nav; ia jadi tab
 * di ATAS halaman tersebut (lihat `OrderHubTabs`), seperti bar
 * "Riwayat / Dalam Proses / Terjadwal" di aplikasi GoFood.
 *
 * Karena itu nav ini hanya satu bar dan TIDAK punya state sama sekali — tidak
 * ada bar yang bisa terbuka, jadi tidak ada `setState` yang bisa menggantung
 * setelah pindah halaman.
 *
 * Hidden juga di /order karena alur pemesanan punya sticky bar keranjang
 * sendiri (sticky, z-30) yang akan ketimpa nav ini (fixed, z-40) — itu bug
 * "keranjang pas slide masih error" yang Steven laporkan.
 *
 * BARU 13-10-2026: nav ini disembunyikan sampai pengguna menggulir ke bawah
 * (permintaan Steven: "nav bawahnya hanya muncul ketika dislide kebawah,
 * jangan ketika klik Riwayat langsung muncul"). Efeknya jauh lebih bersih di
 * halaman pendek seperti /riwayat yang isinya cuma satu kartu — nav tidak lagi
 * langsung menutupi isi yang baru terbuka.
 */
export function MobileBottomNav({ profileMenu = [] }: { profileMenu?: ProfileMenuItem[] }) {
  const pathname = usePathname() ?? "";
  const { t } = useI18n();

  const hidden = pathname.startsWith("/admin")
    || pathname.startsWith("/login")
    || pathname.startsWith("/register")
    || pathname.startsWith("/order");

  // WAJIB dipanggil sebelum `if (hidden) return null` di bawah. Hook yang
  // bersyarat akan mengubah urutan hook antar navigasi, dan React akan
  // melemparkan error "Rendered more hooks than during the previous render".
  const navVisible = useShowNavOnScroll(!hidden, pathname);

  if (hidden) return null;

  const orderActive = pathname.startsWith("/track") || pathname.startsWith("/riwayat");

  return (
    <>
      {/* Spacer: nav di bawah ini `fixed`, jadi tidak ikut menambah tinggi
          halaman. Tanpa spasi ini, elemen terakhir halaman bisa tertutup nav.

          Nav sekarang hanya satu bar (~58px), jadi spacer 68px sudah cukup
          (10px kelonggaran untuk border + ukuran teks yang sedikit berbeda
          antar platform).

          Perlu karena footer (blok info toko) disembunyikan di HP. Sebelumnya
          footer ikut memberi ~24px padding bawah di akhir halaman, dan itu
          yang jadi jarak aman terhadap nav ini. Sekarang footer tidak ada, jadi
          spasi penggantinya harus dibuat eksplisit.

          Hanya di HP (`md:hidden`), dan hanya di halaman yang nav-nya tampil —
          di /order, /admin, /login, /register nav-nya disembunyikan
          sehingga spacer ini ikut hilang. */}
      <div aria-hidden className="h-[68px] md:hidden" />

      <nav
        aria-label="Mobile navigation"
        // `invisible` dipakai bersama translate supaya nav yang tersembunyi
        // benar-benar keluar dari tab-order — kalau hanya digeser keluar layar,
        // link di dalamnya masih bisa difokus pakai keyboard.
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-cocoa-200 bg-cream-50 pb-[env(safe-area-inset-bottom)] transition-all duration-200 ease-out md:hidden ${
          navVisible
            ? "visible translate-y-0 opacity-100"
            : "invisible translate-y-full opacity-0"
        }`}
      >
        <ul className="grid grid-cols-3">
          <li>
            <Link
              href="/"
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

          {/* Orderan: aktif di /track DAN /riwayat, karena keduanya adalah
              halaman pesanan yang dipilih lewat tab di atasnya. Kalau hanya
              /track, tab ini terlihat mati saat pembeli sedang membaca
              Riwayat. */}
          <li>
            <Link
              href="/track"
              className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold tracking-wide transition ${
                orderActive
                  ? "text-honey-600"
                  : "text-cocoa-400 hover:text-cocoa-700"
              }`}
            >
              <ClipboardList
                className={`size-5 ${orderActive ? "scale-110 fill-honey-400/20" : ""}`}
              />
              <span className="text-center leading-tight">{t.nav.orderHub}</span>
            </Link>
          </li>

          {/* Profil: bukan link, tapi membuka sheet daftar menu. */}
          <li>
            <ProfileTabButton />
          </li>
        </ul>
      </nav>

      <ProfileSheet items={profileMenu} />
    </>
  );
}