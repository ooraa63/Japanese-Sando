"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LogIn, Menu, UserCircle, X, ShoppingBag } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { FontSizeToggle } from "@/components/ui/FontSizeToggle";
import { useCustomerAuth } from "@/components/customer/CustomerAuthProvider";

export function SiteHeader({
  storeName = "Rumakomugi",
  logoUrl = null,
  brandLine = "",
}: {
  storeName?: string;
  logoUrl?: string | null;
  brandLine?: string;
}) {
  const { t } = useI18n();
  const { profile } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "/#menu", label: t.nav.menu },
    { href: "/#how", label: t.nav.howItWorks },
    { href: "/track", label: t.nav.track },
    { href: "/#contact", label: t.nav.contact },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all ${
        scrolled
          ? "border-b border-cocoa-200/70 bg-cream-50/90 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label={storeName}>
          {logoUrl ? (
            <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-cocoa-900 ring-1 ring-cocoa-200 transition group-hover:scale-105">
              <Image
                src={logoUrl}
                alt=""
                fill
                sizes="40px"
                className="object-cover"
                priority
              />
            </span>
          ) : (
            <span className="grid size-9 place-items-center rounded-xl bg-cocoa-800 text-cream-50 shadow-md transition group-hover:rotate-[-6deg]">
              <span className="font-display text-base font-bold">日</span>
            </span>
          )}
          <span className="flex flex-col leading-none">
            <span className="font-display text-[17px] font-bold text-cocoa-900">
              {storeName}
            </span>
            {brandLine ? (
              <span className="mt-0.5 text-[9px] font-bold tracking-[0.12em] text-cocoa-400 uppercase">
                {brandLine}
              </span>
            ) : null}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-cocoa-600 transition hover:bg-cocoa-100 hover:text-cocoa-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <FontSizeToggle />
          <LanguageToggle />
          {profile ? (
            <Link
              href="/account"
              className="hidden h-10 items-center gap-1.5 rounded-full bg-matcha-50 px-3 text-[13px] font-bold text-matcha-700 transition hover:bg-matcha-100 sm:inline-flex"
              aria-label={t.customerAuth.accountChip}
              title={t.customerAuth.accountChip}
            >
              <UserCircle className="size-4" />
              <span className="hidden lg:inline">
                {profile.full_name.split(" ")[0]}
              </span>
            </Link>
          ) : (
            <Link
              href="/login?next=/order"
              className="hidden h-10 items-center gap-1.5 rounded-full border border-cocoa-200 bg-white px-3 text-[13px] font-bold text-cocoa-700 transition hover:bg-cocoa-100 sm:inline-flex"
            >
              <LogIn className="size-4" />
              <span>{t.customerAuth.loginCta}</span>
            </Link>
          )}
          <Link
            href="/order"
            className="btn-primary hidden !px-4 !py-2.5 text-[13px] sm:inline-flex"
          >
            <ShoppingBag className="size-4" />
            {t.nav.order}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="grid size-10 place-items-center rounded-xl border border-cocoa-200 text-cocoa-700 transition hover:bg-cocoa-100 md:hidden"
            aria-label="Menu"
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-cocoa-200 bg-cream-50 md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col p-4" aria-label="Mobile">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-3 text-base font-semibold text-cocoa-700 transition hover:bg-cocoa-100"
              >
                {l.label}
              </Link>
            ))}
            {profile ? (
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-xl border border-matcha-300 bg-matcha-50 px-3 py-3 text-sm font-bold text-matcha-700"
              >
                <UserCircle className="size-4" />
                {profile.full_name.split(" ")[0]}
              </Link>
            ) : (
              <Link
                href="/login?next=/order"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-cocoa-200 bg-white px-3 py-3 text-sm font-bold text-cocoa-700"
              >
                <LogIn className="size-4" />
                {t.customerAuth.loginCta}
              </Link>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-cocoa-200 bg-white px-3 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-cocoa-700">
                <FontSizeToggle />
                <span>{t.common.fontSize}</span>
              </div>
              <LanguageToggle />
            </div>
            <Link
              href="/order"
              onClick={() => setOpen(false)}
              className="btn-primary mt-2 w-full"
            >
              <ShoppingBag className="size-4" />
              {t.nav.order}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
