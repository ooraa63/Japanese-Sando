"use client";

import {
  Clock,
  MapPin,
  MessageCircle,
  Timer,
} from "lucide-react";
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
import { useI18n } from "@/lib/i18n";

/**
 * Strip info toko di atas hero — memindahkan hal-hal penting dari footer
 * ke posisi paling gampang dilihat pembeli: IG, WhatsApp, email, alamat,
 * jam buka, deadline pre-order.
 */
export function ShopInfo({ settings }: { settings: StoreSettings | null }) {
  const { t, lang } = useI18n();
  const s = settings;
  if (!s) return null;

  const hours = lang === "en" ? s.hours_en : s.hours_id;
  const deadline = lang === "en" ? s.deadline_en : s.deadline_id;

  // Minimal: WA + IG saja dianggap "inti" — sisanya tambahan.
  const hasCta = s.whatsapp || s.instagram;
  if (!hasCta && !s.address && !hours && !deadline) return null;

  return (
    <section className="border-b border-cocoa-200 bg-cream-100/70">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {s.whatsapp ? (
            <a
              href={`https://wa.me/${s.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-2xl bg-white p-3 transition hover:bg-cocoa-50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-matcha-100 text-matcha-700">
                <MessageCircle className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {t.contact.whatsapp}
                </span>
                <span className="block font-bold text-cocoa-900 tabular" dir="ltr">
                  {s.whatsapp}
                </span>
              </span>
            </a>
          ) : null}

          {s.instagram ? (
            <a
              href={`https://instagram.com/${s.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-2xl bg-white p-3 transition hover:bg-cocoa-50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-berry-500/15 text-berry-500">
                <InstagramGlyph className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                  Instagram
                </span>
                <span className="block font-bold text-cocoa-900 tabular">
                  @{s.instagram.replace(/^@/, "")}
                </span>
              </span>
            </a>
          ) : null}

          {s.address ? (
            <a
              href={s.maps_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 rounded-2xl bg-white p-3 transition hover:bg-cocoa-50"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
                <MapPin className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {t.contact.address}
                </span>
                <span className="block font-bold text-cocoa-900 line-clamp-2">
                  {s.address}
                </span>
              </span>
            </a>
          ) : null}

          {hours || deadline ? (
            <div className="flex items-start gap-2.5 rounded-2xl bg-white p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-honey-300/30 text-honey-500">
                <Clock className="size-4" />
              </span>
              <span className="min-w-0">
                {hours ? (
                  <>
                    <span className="block text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {t.contact.hours}
                    </span>
                    <span className="block font-bold text-cocoa-900">
                      {hours}
                    </span>
                  </>
                ) : null}
                {deadline ? (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-berry-500/10 px-1.5 py-0.5 text-[11px] font-bold text-berry-600">
                    <Timer className="size-3" />
                    {t.contact.deadline}: {deadline}
                  </span>
                ) : null}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}