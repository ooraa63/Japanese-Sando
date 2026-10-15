"use client";

/**
 * Tombol WhatsApp mengambang di kanan bawah yang NEMPEL saat halaman digulir.
 *
 * Steven 14-10-2026: "saya sekalian mau tambahkan ini fitur kayak tombol
 * untuk bs chat lgsng ke whatsaapp yang selalu ngikut ketika scroll letak di
 * kanan bawah aja".
 *
 * Tiga keputusan yang diambil di sini:
 *
 * 1. **Sembunyi di `/admin`.** Tombol ini untuk pembeli; kalau muncul di
 *    dashboard, dia menutupi sidebar sepenuhnya. Dicek lewat
 *    `usePathname()` supaya tidak perlu taruh komponen ini di setiap halaman
 *    satu per satu — cukup di root layout.
 *
 * 2. **Tidak dirender kalau nomor WhatsApp kosong.** `store_settings.whatsapp`
 *    boleh kosong, dan tombol yang membuka `wa.me/` tanpa nomor hanya
 *    menghasilkan halaman WhatsApp kosong — lebih buruk daripada tidak ada
 *    tombol sama sekali.
 *
 * 3. **Disembunyikan di `/order`.** Halaman itu punya `CartDock` yang
 *    menempel di dasar layar, jadi tombol mengambang di sana akan
 *    menimpanya. Di `/order` tombol WA dirender sendiri oleh `OrderFlow`:
 *    di dalam rail keranjang (desktop) atau melayang di atas dock (mobile).
 *    Lihat `WhatsAppLink`.
 *
 * 4. **Disembunyikan juga saat keranjang berisi.** Di halaman selain
 *    `/order`, keranjang sekarang ikut tampil sebagai dock melayang, jadi
 *    WA pindah ke dalam dock itu. Dua tombol di pojok yang sama saling
 *    menutupi dan hanya membingungkan.
 */

import { usePathname } from "next/navigation";
import { WhatsAppLink } from "@/components/customer/WhatsAppLink";
import { useCart } from "@/components/customer/CartProvider";

export function WhatsAppFab({ whatsapp }: { whatsapp?: string | null }) {
  const pathname = usePathname();
  const pathnameAwal = pathname ?? "";
  const { totalItems } = useCart();

  // Nav bawah menutupi dasar layar di semua halaman kecuali empat
  // halaman ini - persis kondisi `hidden` di `MobileBottomNav`.
  const adaNavBawah =
    !pathnameAwal.startsWith("/admin") &&
    !pathnameAwal.startsWith("/login") &&
    !pathnameAwal.startsWith("/register") &&
    !pathnameAwal.startsWith("/order");

  if (!whatsapp || !whatsapp.trim()) return null;
  if (pathname && (pathname === "/admin" || pathname.startsWith("/admin/"))) return null;
  if (pathname && pathname.startsWith("/order")) return null;

  /* Kalau keranjang sudah berisi, tombol WA ikut pindah ke dalam
     `CartDock` yang melayang tepat di atas nav. Dua tombol melayang
     di pojok yang sama hanya saling menutupi dan membingungkan.

     Pembacaannya langsung dari store keranjang, jadi tidak perlu prop
     dari layout dan tidak bisa basi saat isi keranjang berubah. */
  if (totalItems > 0) return null;

  /* Kalau keranjang sudah berisi, tombol WA ikut pindah ke dalam
     `CartDock` (yang melayang tepat di atas nav). Dua tombol melayang
     di pojok yang sama hanya saling menutupi dan membingungkan.

     Pembacaannya langsung dari store keranjang, jadi tidak perlu prop
     dari layout dan tidak bisa basi ketika isi keranjang berubah. */
  if (totalItems > 0) return null;

  return (
    <WhatsAppLink
      whatsapp={whatsapp}
      compact
      className={`fixed right-4 z-40 grid size-14 place-items-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:bg-[#1EBE5A] active:scale-95 md:right-6 md:bottom-6 ${
        adaNavBawah
          ? "bottom-[calc(68px+env(safe-area-inset-bottom))]"
          : "bottom-4"
      }`}
    />
  );
}
