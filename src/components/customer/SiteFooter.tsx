"use client";

import Image from "next/image";
import Link from "next/link";
import { MapPin, Clock, MessageCircle, Timer } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { waLink } from "@/lib/utils";
import type { StoreSettings } from "@/lib/types";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

/** Instagram tidak ada di lucide-react, jadi glyph-nya dibuat sendiri. */
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

export function SiteFooter({ settings }: { settings: StoreSettings | null }) {
  const { t, lang } = useI18n();

  const storeName = settings?.store_name || "Rumakomugi";
  const address = settings?.address || "";
  const hours = lang === "en" ? settings?.hours_en : settings?.hours_id;
  const deadline = lang === "en" ? settings?.deadline_en : settings?.deadline_id;

  return (
    <footer id="contact" className="mt-20 bg-cocoa-900 text-cream-200">
      <div className="bg-seigaha">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3">
              {settings?.logo_url ? (
                <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-cream-50">
                  <Image
                    src={settings.logo_url}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                </span>
              ) : (
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-cream-50 text-cocoa-900">
                  <span className="font-display text-xl font-bold">日</span>
                </span>
              )}
              <div>
                <p className="font-display text-xl font-bold text-cream-50">
                  {storeName}
                </p>
                {settings?.brand_line ? (
                  <p className="text-[10px] font-bold tracking-[0.18em] text-honey-300/80 uppercase">
                    {settings.brand_line}
                  </p>
                ) : null}
              </div>
            </div>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-cream-200/70">
              {lang === "en" ? settings?.description_en : settings?.description_id}
            </p>
            <div className="mt-5">
              <LanguageToggle />
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-[0.18em] text-berry-400 uppercase">
              {t.footer.quickLinks}
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[
                { href: "/#menu", label: t.nav.menu },
                { href: "/#how", label: t.nav.howItWorks },
                { href: "/order", label: t.nav.order },
                { href: "/track", label: t.nav.track },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-cream-200/75 transition hover:text-cream-50"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-bold tracking-[0.18em] text-berry-400 uppercase">
              {t.footer.getInTouch}
            </h3>
            <ul className="mt-4 space-y-3.5 text-sm text-cream-200/75">
              {settings?.whatsapp ? (
                <li>
                  <a
                    href={waLink(settings.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-2.5 transition hover:text-cream-50"
                  >
                    <MessageCircle className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                    <span dir="ltr">{settings.whatsapp}</span>
                  </a>
                </li>
              ) : null}
              {address ? (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                  {settings?.maps_url ? (
                    <a
                      href={settings.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="transition hover:text-cream-50"
                    >
                      {address}
                    </a>
                  ) : (
                    <span>{address}</span>
                  )}
                </li>
              ) : null}
              {hours ? (
                <li className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                  <span>{hours}</span>
                </li>
              ) : null}
              {deadline ? (
                <li className="flex items-start gap-2.5">
                  <Timer className="mt-0.5 size-4 shrink-0 text-honey-300" />
                  <span>{deadline}</span>
                </li>
              ) : null}
              {settings?.instagram ? (
                <li className="flex items-start gap-2.5">
                  <InstagramGlyph className="mt-0.5 size-4 shrink-0 text-matcha-300" />
                  <span>@{settings.instagram.replace(/^@/, "")}</span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>

        <div className="border-t border-cream-50/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-xs text-cream-200/50 sm:flex-row sm:justify-between sm:px-6">
            <p>
              © {new Date().getFullYear()} {storeName}.{" "}
              {t.footer.rights}
            </p>
            {settings?.instagram ? (
              <p>
                Instagram:{" "}
                <a
                  href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition hover:text-cream-200/80"
                >
                  @{settings.instagram.replace(/^@/, "")}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
