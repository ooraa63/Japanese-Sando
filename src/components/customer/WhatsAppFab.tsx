"use client";

/**
 * Tombol WhatsApp mengambang di kanan bawah yang NEMPEL saat halaman digulir.
 *
 * Steven 14-10-2026: "saya sekalian mau tambahkan ini fitur kayak tombol
 * untuk bs chat lgsng ke whatsaapp yang selalu ngikut ketika scroll letak di
 * kanan bawah aja".
 *
 * Dua keputusan yang diambil di sini:
 *
 * 1. **Sembunyi di `/admin`.** Tombol ini untuk pembeli; kalau muncul di
 *    dashboard, dia ketutup sidebar dan Lan sepenuhnya. Dicek lewat
 *    `usePathname()` supaya tidak perlu taruh komponen ini di setiap halaman
 *    satu per satu — cukup di root layout.
 *
 * 2. **Tidak dirender kalau nomor WhatsApp kosong.** `store_settings.whatsapp`
 *    boleh kosong, dan tombol yang membuka `wa.me/` tanpa nomor hanya
 *    menghasilkan halaman WhatsApp kosong — lebih buruk daripada tidak ada
 *    tombol sama sekali.
 */

import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { waLink } from "@/lib/utils";

export function WhatsAppFab({ whatsapp }: { whatsapp?: string | null }) {
  const pathname = usePathname();
  const { t, lang } = useI18n();

  if (!whatsapp || !whatsapp.trim()) return null;
  if (pathname && (pathname === "/admin" || pathname.startsWith("/admin/"))) return null;

  const message =
    lang === "en" ? "Hi, I'd like to ask about your sando." : "Halo, mau tanya-tanya dulu.";

  return (
    <a
      href={waLink(whatsapp, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.contact.whatsapp}
      /* Offset bawah PENTING, dan titik potongnya `md` — bukan `sm`:
         MobileBottomNav juga `fixed bottom-0` dan hanya disembunyikan mulai
         `md:hidden` (>=768px). Kalau tombol ini pakai `sm:bottom-6`, di
         lebar 640-767px tombolnya akan MENUTUPI item paling kanan di nav
         bawah. Jadi: di bawah 768px tombol naik melewati nav (68px + jarak),
         di atas 768px nav hilang dan tombol turun lagi ke pojok.

         `z-40` sengaja, sama dengan nav, dan DI BAWAH modal (z-50) — kalau
         z-50, tombol WhatsApp akan muncul di atas popup pemesanan. */
      className="fixed right-4 bottom-[84px] z-40 grid size-14 place-items-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:bg-[#1EBE5A] active:scale-95 md:right-6 md:bottom-6"
    >
      <MessageCircle className="size-7" />
    </a>
  );
}