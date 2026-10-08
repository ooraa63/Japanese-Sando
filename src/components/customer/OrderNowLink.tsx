"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LogIn, ShoppingBag, UserRound } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCustomerAuth } from "@/components/customer/CustomerAuthProvider";
import { Modal } from "@/components/ui/Modal";

/**
 * Tombol CTA "Pesan Sekarang".
 *
 * Kalau pre-order tutup, arahkan ke WhatsApp.
 *
 * Kalau pre-order buka, buka POPUP kecil yang menanyakan: pesan pakai akun
 * atau sebagai tamu (dokumen "Perbaikan Ruma Komugi 2" item 3 — "Pas tekan
 * pesan sekarang mungkin boleh ada popup yang kecil bntr tentang login atau
 * sign up as guest").
 *
 * Kalau pembeli sudah login, popupnya dilewati dan langsung masuk /order —
 * tidak perlu tanya hal yang sudah jelas.
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
  const router = useRouter();
  const { profile, openAuthModal } = useCustomerAuth();
  const [askOpen, setAskOpen] = useState(false);

  function goToOrder() {
    setAskOpen(false);
    router.push("/order");
  }

  if (open) {
    const cta = label ?? t.hero.cta;

    // Sudah login → langsung ke halaman pesanan.
    if (profile) {
      return (
        <button type="button" className={className} onClick={goToOrder}>
          <ShoppingBag className="size-5" />
          {cta}
        </button>
      );
    }

    return (
      <>
        <button
          type="button"
          className={className}
          onClick={() => setAskOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={askOpen}
        >
          <ShoppingBag className="size-5" />
          {cta}
        </button>

        <Modal
          open={askOpen}
          onClose={() => setAskOpen(false)}
          title={t.order.guestPrompt.title}
          size="sm"
        >
          <p className="text-sm text-cocoa-500">{t.order.guestPrompt.subtitle}</p>
          <div className="mt-4 space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setAskOpen(false);
                openAuthModal("login");
              }}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-matcha-500 bg-matcha-500/10 px-4 py-3 text-left transition hover:bg-matcha-500/20"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-matcha-500 text-white">
                <LogIn className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-cocoa-900">
                  {t.order.guestPrompt.loginTitle}
                </span>
                <span className="block text-xs text-cocoa-500">
                  {t.order.guestPrompt.loginHint}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={goToOrder}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-cocoa-200 bg-white px-4 py-3 text-left transition hover:bg-cream-100"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
                <UserRound className="size-4.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-cocoa-900">
                  {t.order.guestPrompt.guestTitle}
                </span>
                <span className="block text-xs text-cocoa-500">
                  {t.order.guestPrompt.guestHint}
                </span>
              </span>
            </button>
          </div>
        </Modal>
      </>
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