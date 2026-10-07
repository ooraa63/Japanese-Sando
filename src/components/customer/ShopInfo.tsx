"use client";

import Link from "next/link";
import { Clock, HelpCircle, MessageCircle, Timer } from "lucide-react";
import type { StoreSettings } from "@/lib/types";

/**
 * Strip info ringkas di pojok bawah hero.
 *
 * Nomor telepon / Instagram / alamat TIDAK lagi ditampilkan di sini — semua
 * info kontak lengkap dipindah ke halaman `/contact` supaya hero tetap bersih
 * dan tidak terasa seperti etalase. Yang tersisa hanya jam buka + batas
 * pre-order (info yang memang dibutuhkan pembeli saat melihat menu) dan
 * shortcut ke halaman Kontak.
 */
export function ShopInfo({ settings }: { settings: StoreSettings | null }) {
  const s = settings;
  if (!s) return null;

  const hours = s.hours_id || s.hours_en;
  const deadline = s.deadline_id || s.deadline_en;
  if (!hours && !deadline) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl items-end pb-4 sm:pb-6">
        <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl bg-cocoa-950/55 px-3 py-2 text-cream-100 shadow-2xl backdrop-blur-md ring-1 ring-cream-50/15 sm:gap-3 sm:px-4">
          {hours ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-cocoa-800/70 px-3 py-1.5 text-xs font-bold text-cream-50 sm:text-sm">
              <Clock className="size-3.5 shrink-0" />
              <span className="tabular">{hours}</span>
            </span>
          ) : null}

          {deadline ? (
            <span className="inline-flex items-center gap-1 rounded-xl bg-honey-400/90 px-3 py-1.5 text-xs font-bold text-cocoa-900">
              <Timer className="size-3.5 shrink-0" />
              <span>{deadline}</span>
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/contact#faq"
              className="inline-flex items-center gap-1.5 rounded-xl bg-cocoa-800/70 px-3 py-1.5 text-xs font-bold text-cream-50 transition hover:bg-cocoa-800/90"
            >
              <HelpCircle className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">FAQ</span>
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-xl bg-matcha-500/95 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-matcha-500 sm:text-sm"
            >
              <MessageCircle className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">Kontak</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}