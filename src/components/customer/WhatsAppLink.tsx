"use client";

/**
 * Tombol WhatsApp — satu sumber untuk link-nya.
 *
 * Dipakai di `WhatsAppFab` (tombol mengambang pojok kanan bawah, semua
 * halaman pembeli) dan di beberapa panel `OrderFlow`. Sejak 16-10-2026 tidak
 * ada lagi tombol WA di dalam rail keranjang maupun di dalam dock keranjang:
 * Steven minta WA selalu di ujung kanan bawah, jadi hanya boleh ada satu.
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
  ...rest
}: {
  whatsapp: string;
  className?: string;
  /** `true` = bulatan (FAB mengambang), `false` = kotak rounded (di dalam bar). */
  compact?: boolean;
  /** Atribut tambahan untuk elemen `<a>`, mis. `data-wa-fab` untuk pengujian. */
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {
  const { t, lang } = useI18n();

  const message =
    lang === "en" ? "Hi, I'd like to ask about your sando." : "Halo, mau tanya-tanya dulu.";

  return (
    <a
      {...rest}
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
