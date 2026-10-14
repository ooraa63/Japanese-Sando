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
 * 3. **Disembunyikan di `/order`.** Halaman itu punya `CartStickyBar` yang
 *    menempel di dasar layar, jadi tombol mengambang di sana akan
 *    menimpanya. Di `/order` tombol WA dirender sendiri oleh `OrderFlow`:
 *    masuk ke dalam bar keranjang (saat bar itu ada) atau mengambang di pojok
 *    (saat bar belum ada). Lihat `WhatsAppLink`.
 */

import { usePathname } from "next/navigation";
import { WhatsAppLink } from "@/components/customer/WhatsAppLink";

export function WhatsAppFab({ whatsapp }: { whatsapp?: string | null }) {
  const pathname = usePathname();

  if (!whatsapp || !whatsapp.trim()) return null;
  if (pathname && (pathname === "/admin" || pathname.startsWith("/admin/"))) return null;
  if (pathname && pathname.startsWith("/order")) return null;

  return (
    <WhatsAppLink
      whatsapp={whatsapp}
      compact
      className="fixed right-4 bottom-4 z-40 grid size-14 place-items-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:bg-[#1EBE5A] active:scale-95 md:right-6 md:bottom-6"
    />
  );
}
