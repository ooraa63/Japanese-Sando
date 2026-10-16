"use client";

/**
 * Tombol WhatsApp mengambang yang SELALU nempel di ujung kanan bawah.
 *
 * Steven 16-10-2026 (gambar 3): "itu whatsappnya tetap harus di ujung kanan
 * bawah". Sebelumnya di `/order` tombolnya diletakkan di dalam rail keranjang
 * kolom kanan, jadi ikutnaik-turun bersama panel dan terlihat melayang di
 * tengah layar. Sekarang satu-satu tempat untuk semua halaman: pojok kanan
 * bawah layar, tidak pernah bergerak.
 *
 * Empat keputusan yang diambil di sini:
 *
 * 1. **Sembunyi di `/admin`.** Tombol ini untuk pembeli; kalau muncul di
 *    dashboard, dia menutupi sidebar sepenuhnya. Dicek lewat `usePathname()`
 *    supaya tidak perlu taruh komponen ini di setiap halaman satu per satu.
 *
 * 2. **Tidak dirender kalau nomor WhatsApp kosong.** `store_settings.whatsapp`
 *    boleh kosong, dan tombol yang membuka `wa.me/` tanpa nomor hanya
 *    menghasilkan halaman WhatsApp kosong.
 *
 * 3. **Hanya disembunyikan di halaman tanpa transaksi** (`/admin`, `/login`,
 *    `/register`). Dulu `/order` ikut disembunyikan karena dianggap sudah ada
 *    tombolnya di rail keranjang — justru itu yang dikeluhkan Steven. Sekarang
 *    semua tombol WA lain di `/order` dihapus, jadi di sini tidak ada dobel.
 *
 * 4. **Naik kalau ada dock keranjang.** Di `/order` langkah "Pilih Rasa" untuk
 *    HP, `CartDock` menempel penuh di dasar layar. Tombol WA di pojok yang sama
 *    harus naik di atasnya, kalau tidak yang menutupi dock justru tombol WA.
 */

import { usePathname } from "next/navigation";
import { WhatsAppLink } from "@/components/customer/WhatsAppLink";
import { useCart } from "@/components/customer/CartProvider";

/* Tinggi `MobileBottomNav` + jarak aman. PENTING: nilai px ditulis LANGSUNG
   di dalam nama kelas, bukan disisipkan lewat template literal. Tailwind
   memindai teks sumber, jadi kelas yang berisi ${...} tidak pernah jadi CSS. */
const NAV_BAWAH = "bottom-[calc(68px+env(safe-area-inset-bottom))]";
/* Tinggi `CartDock` di `/order` (HP) + jarak aman, juga ditulis literal. */
const DOCK_KERANJANG = "bottom-[calc(88px+env(safe-area-inset-bottom))]";

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

  /* Dock keranjang hanya ada di `/order` (dan hanya di bawah `lg`), jadi cukup
     dicek dari route + isi keranjang. Di desktop dock-nya disembunyikan, tapi
     `lg:bottom-6` menimpanya anyway karena posisinya di pojok yang sama. */
  const adaDockKeranjang = pathnameAwal.startsWith("/order") && totalItems > 0;

  if (!whatsapp || !whatsapp.trim()) return null;
  if (pathnameAwal.startsWith("/admin")) return null;
  if (pathnameAwal.startsWith("/login")) return null;
  if (pathnameAwal.startsWith("/register")) return null;

  /* Posisi vertikal. Urutannya dari yang paling tinggi (paling banyak hal yang
     perlu dilewati) ke yang paling rendah. */
  const posisi = adaDockKeranjang
    ? DOCK_KERANJANG
    : adaNavBawah
      ? NAV_BAWAH
      : "bottom-4 md:bottom-6";

  return (
    <WhatsAppLink
      whatsapp={whatsapp}
      compact
      data-wa-fab
      className={`fixed right-4 z-40 grid size-14 place-items-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:bg-[#1EBE5A] active:scale-95 md:right-6 ${posisi}`}
    />
  );
}