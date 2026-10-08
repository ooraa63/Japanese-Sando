"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * Bar menu "Kontak" di halaman Akun yang membuka POPUP info kontak.
 *
 * Dokumen "Perbaikan Ruma Komugi 2" item 2: "Pada bagian kontak itu dihapus
 * karena nanti ada di bagian akun, nanti di akun pas tekan kontak baru ada
 * kyk popup utk contact." Jadi link `/contact` di navigasi dihapus dan
 * teks kontaknya dipindah ke sini — sebagai popup, bukan halaman baru.
 *
 * Isi popup dikirim sebagai `children` dari server component supaya blok
 * kontak (WA/IG/TikTok/alamat/jam) tetap dirender di server dan tidak
 * berubah bentuknya.
 */
export function ContactMenuRow({
  label,
  hint,
  title,
  subtitle,
  children,
}: {
  label: string;
  hint: string;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-cream-100 sm:px-5"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
          <MessageCircle className="size-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-cocoa-900">{label}</span>
          <span className="block truncate text-xs text-cocoa-500">{hint}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-cocoa-300" />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={title} size="sm">
        <p className="text-sm text-cocoa-500">{subtitle}</p>
        {children}
      </Modal>
    </li>
  );
}