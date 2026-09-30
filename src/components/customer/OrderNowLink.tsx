"use client";

import Link from "next/link";
import { Lock, ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Tombol CTA "Pesan Sekarang". Kalau pre-order tutup, arahkan ke WhatsApp.
 */
export function OrderNowLink({
  open,
  className,
  label,
  whatsapp,
  closedLabel,
}: {
  open: boolean;
  className?: string;
  label?: string;
  whatsapp?: string;
  closedLabel?: string;
}) {
  const { t, lang } = useI18n();

  if (open) {
    return (
      <Link href="/order" className={className}>
        <ShoppingBag className="size-5" />
        {label ?? t.hero.cta}
      </Link>
    );
  }

  if (whatsapp) {
    const waText = encodeURIComponent(
      lang === "en"
        ? "Hi, I'd like to ask about your sando."
        : "Halo, saya mau tanya-tanya soal sandonya."
    );
    return (
      <a
        href={`https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${waText}`}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        <Lock className="size-5" />
        {closedLabel ?? t.order.closed.title}
      </a>
    );
  }

  return (
    <span className={`${className ?? "btn"} cursor-not-allowed opacity-70`}>
      <Lock className="size-5" />
      {closedLabel ?? t.order.closed.title}
    </span>
  );
}
