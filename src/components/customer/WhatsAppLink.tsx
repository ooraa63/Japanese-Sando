"use client";

/**
 * Tombol WhatsApp — satu sumber untuk link-nya.
 *
 * Dipakai di tiga tempat:
 *  1. `WhatsAppFab` — tombol mengambang untuk halaman selain `/order`.
 *  2. `CartDock` — di dalam bar keranjang, di sisi kanan (Steven
 *     14-10-2026: "untuk fitur WA itu terlalu tinggi buat di kanan bawah";
 *     kalau bar keranjang sudah menempati dasar layar, satu-satunya cara
 *     WA tetap "di kanan bawah" TANPA menimpa isi keranjang adalah masuk
 *     ke dalam bar itu).
 *  3. Langkah tanggal + identitas di `/order`, yang belum punya bar
 *     keranjang — di sana tombolnya mengambang seperti biasa.
 *
 * Sengaja BUKAN `<button>`: ini link ke `wa.me`, jadi harus `<a>` supaya
 * bisa dibuka di tab baru dan tetap bekerja tanpa JavaScript.
 */

import { MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { waLink } from "@/lib/utils";

export function WhatsAppLink({
  whatsapp,
  className,
  compact = false,
}: {
  whatsapp: string;
  className?: string;
  /** `true` = bulatan (FAB mengambang), `false` = kotak rounded (di dalam bar). */
  compact?: boolean;
}) {
  const { t, lang } = useI18n();

  const message =
    lang === "en" ? "Hi, I'd like to ask about your sando." : "Halo, mau tanya-tanya dulu.";

  return (
    <a
      href={waLink(whatsapp, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.contact.whatsapp}
      className={
        className ??
        `grid ${compact ? "size-14 rounded-2xl" : "size-12 rounded-xl"} shrink-0 place-items-center bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:bg-[#1EBE5A] active:scale-95`
      }
    >
      <MessageCircle className={compact ? "size-7" : "size-6"} />
    </a>
  );
}
