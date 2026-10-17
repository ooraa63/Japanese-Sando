"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useScrollLock } from "@/lib/use-scroll-lock";

/**
 * Wadah keranjang yang muncul setelah bar bawah diketuk.
 *
 * Steven 15-10-2026 minta dua bentuk sekaligus, jadi bentuknya berubah sesuai
 * lebar layar — bukan dua komponen terpisah:
 *
 *   - Mobile (di bawah `lg`): sheet yang menempel di BAWAH layar. Ini pola
 *     yang sudah dipakai `Modal` di project ini, jadi aman di iOS dan tidak
 *     tertutup nav bawah.
 *   - Desktop (`lg` ke atas): drawer yang meluncur dari KANAN, penuh tinggi,
 *     lebar tetap (`w-[26rem]`). Sheet penuh tinggi di layar 1440px terlihat
 *     aneh dan-what saja, sementara drawer samping terlihat seperti aplikasi
 *     kasir yang eigentul jadi jelas ada isinya.
 *
 * Perbedaan bentuk ini yang bikin desktop terasa "berbeda", bukan sekadar
 * sheet yang kebesar.
 */
export function CartSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title: string;
}) {
  const { t } = useI18n();

  // Escape menutup. Scroll body dikunci lewat hook (lihat `use-scroll-lock`):
  // versi lama hanya menulis `overflow: hidden`, dan itu tetap membiarkan
  // halaman di belakang ikut bergulir di HP — keluhan Steven 17-10-2026.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);

    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useScrollLock(open);

  if (!open) return null;

  return (
    <div
      data-cart-sheet
      className="fixed inset-0 z-[95] flex items-end justify-center lg:items-stretch lg:justify-end"
    >
      {/* Latar gelap. Klik tunggal = tutup. */}
      <button
        type="button"
        aria-label={t.common.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-cocoa-950/55 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl lg:h-full lg:max-h-none lg:w-[26rem] lg:rounded-none lg:rounded-l-3xl"
      >
        {/* Pegangan sheet di HP; disembunyikan di desktop karena drawer
           samping tidak punya semantics "tarik ke bawah". */}
        <div className="flex justify-center pt-2.5 pb-1 lg:hidden">
          <span className="h-1.5 w-11 rounded-full bg-cocoa-200" />
        </div>

        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-cocoa-100 px-5 py-3.5">
          <h2 className="font-display text-lg font-extrabold text-cocoa-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="grid size-8 place-items-center rounded-lg text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}