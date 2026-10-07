"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronRight,
  LogIn,
  Menu,
  ShoppingBag,
  UserCircle,
  X,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
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
  const { t, lang } = useI18n();
  const { profile, loading, openAuthModal } = useCustomerAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
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
    { href: "/#menu", label: t.nav.menu, desc: "" },
    { href: "/track", label: t.nav.track, desc: "" },
    { href: "/#contact", label: t.nav.contact, desc: "" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-cocoa-200/70 bg-cream-50/85 shadow-[0_2px_18px_-12px_rgba(26,17,10,0.18)] backdrop-blur-xl"
          : "border-b border-transparent bg-cream-50/0"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
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
            <span className="grid size-10 place-items-center rounded-xl bg-cocoa-800 text-cream-50 shadow-md transition group-hover:rotate-[-6deg]">
              <span className="font-display text-lg font-bold">日</span>
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
          <LanguageToggle />
          {/* Loading awal: tampilkan placeholder biar gak flash "Masuk"
              selagi session token lagi di-refresh. */}
          {loading && !profile ? (
            <span
              aria-hidden="true"
              className="hidden h-10 w-10 animate-pulse rounded-full bg-cocoa-100 sm:inline-flex"
            />
          ) : profile ? (
            <Link
              href="/account"
              className="hidden h-10 items-center gap-1.5 rounded-full bg-matcha-500 px-3.5 text-[13px] font-bold text-white shadow-sm shadow-matcha-900/20 transition hover:bg-matcha-600 sm:inline-flex"
              aria-label={t.customerAuth.accountChip}
              title={t.customerAuth.accountChip}
            >
              <UserCircle className="size-4" />
              <span className="hidden lg:inline">
                {profile.full_name.split(" ")[0]}
              </span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="hidden h-10 items-center gap-1.5 rounded-full border border-cocoa-200 bg-white px-3.5 text-[13px] font-bold text-cocoa-700 transition hover:bg-cocoa-100 sm:inline-flex"
            >
              <LogIn className="size-4" />
              <span>{t.customerAuth.loginCta}</span>
            </button>
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

      {/* Full-screen mobile menu — modern, clean, big touch targets */}
      {open ? (
        <div className="fixed inset-x-0 top-16 z-40 h-[calc(100dvh-4rem)] overflow-y-auto border-t border-cocoa-200 bg-cream-50/98 backdrop-blur-xl md:hidden">
          <nav
            className="mx-auto flex max-w-lg flex-col gap-1 px-4 pt-6 pb-32"
            aria-label="Mobile"
          >
            {/* Primary CTA — order pre-order */}
            <Link
              href="/order"
              onClick={() => setOpen(false)}
              className="group flex items-center justify-between rounded-2xl bg-cocoa-900 px-5 py-4 text-cream-50 shadow-lg shadow-cocoa-900/30 transition active:scale-[0.98]"
            >
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-matcha-500 text-white">
                  <ShoppingBag className="size-5" />
                </span>
                <span className="flex flex-col leading-none">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-cream-300 uppercase">
                    {lang === "en" ? "Hungry?" : "Lapar?"}
                  </span>
                  <span className="mt-1 font-display text-base font-bold">
                    {t.nav.order}
                  </span>
                </span>
              </span>
              <ChevronRight className="size-5 transition group-hover:translate-x-1" />
            </Link>

            {/* Section: nav links */}
            <p className="mt-6 text-[10px] font-bold tracking-[0.2em] text-cocoa-400 uppercase">
              {lang === "en" ? "Browse" : "Jelajahi"}
            </p>
            <ul className="mt-2 space-y-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-3 text-base font-semibold text-cocoa-700 transition hover:bg-cocoa-100 active:bg-cocoa-200"
                  >
                    {l.label}
                    <ChevronRight className="size-4 text-cocoa-300" />
                  </Link>
                </li>
              ))}
            </ul>

            {/* Section: account */}
            <p className="mt-6 text-[10px] font-bold tracking-[0.2em] text-cocoa-400 uppercase">
              {lang === "en" ? "Account" : "Akun"}
            </p>
            <div className="mt-2">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-xl border border-cocoa-200 bg-white px-4 py-3 text-sm font-semibold text-cocoa-800"
              >
                <span className="flex items-center gap-2.5">
                  <UserCircle className="size-5 text-cocoa-500" />
                  {profile
                    ? profile.full_name.split(" ")[0]
                    : t.customerAuth.loginCta}
                </span>
                <ChevronRight className="size-4 text-cocoa-300" />
              </Link>
            </div>

            {/* Settings row */}
            <div className="mt-6 flex items-center justify-between rounded-xl border border-cocoa-200 bg-white px-4 py-3">
              <LanguageToggle />
            </div>

            <p className="mt-auto pt-6 text-center text-[10px] text-cocoa-400">
              {storeName}
              {brandLine ? <> · {brandLine}</> : null}
            </p>
          </nav>
        </div>
      ) : null}
    </header>
  );
}