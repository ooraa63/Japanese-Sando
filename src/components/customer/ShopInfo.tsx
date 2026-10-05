"use client";

import { Clock, MapPin, MessageCircle, Timer } from "lucide-react";
import type { StoreSettings } from "@/lib/types";

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Strip info toko — versi overlay floating (absolute di pojok bawah hero
 * image). Kontak dengan chip WA/IG + alamat + jam. Tampil ringkas & elegan
 * dengan backdrop-blur supaya tetap terbaca di atas foto apapun.
 */
export function ShopInfo({ settings }: { settings: StoreSettings | null }) {
  const s = settings;
  if (!s) return null;

  const hours = s.hours_id || s.hours_en;
  const deadline = s.deadline_id || s.deadline_en;
  const hasCta = s.whatsapp || s.instagram;
  if (!hasCta && !s.address && !hours && !deadline) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 px-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl items-end pb-4 sm:pb-6">
        <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl bg-cocoa-950/55 px-3 py-2 text-cream-100 shadow-2xl backdrop-blur-md ring-1 ring-cream-50/15 sm:gap-3 sm:px-4">
          {s.whatsapp ? (
            <a
              href={`https://wa.me/${s.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-matcha-500/95 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-matcha-500 sm:text-sm"
              title={s.whatsapp}
            >
              <MessageCircle className="size-3.5" />
              <span className="hidden tabular sm:inline" dir="ltr">
                {s.whatsapp}
              </span>
              <span className="sm:hidden">WhatsApp</span>
            </a>
          ) : null}

          {s.instagram ? (
            <a
              href={`https://instagram.com/${s.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-berry-500/95 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-berry-500 sm:text-sm"
              title={`@${s.instagram.replace(/^@/, "")}`}
            >
              <InstagramGlyph className="size-3.5" />
              <span className="hidden sm:inline">
                @{s.instagram.replace(/^@/, "")}
              </span>
              <span className="sm:hidden">Instagram</span>
            </a>
          ) : null}

          {s.address ? (
            <a
              href={s.maps_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-cocoa-800/70 px-3 py-1.5 text-xs font-bold text-cream-50 transition hover:bg-cocoa-800/90 sm:text-sm"
              title={s.address}
            >
              <MapPin className="size-3.5 shrink-0" />
              <span className="line-clamp-1 max-w-[12rem]">{s.address}</span>
            </a>
          ) : null}

          {hours || deadline ? (
            <div className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-cocoa-800/70 px-3 py-1.5 text-xs font-bold text-cream-50 sm:text-sm">
              {hours ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  <span className="hidden tabular sm:inline">{hours}</span>
                </span>
              ) : null}
              {deadline ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-honey-400/90 px-1.5 py-0.5 text-[10px] text-cocoa-900">
                  <Timer className="size-3" />
                  <span>{deadline}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}