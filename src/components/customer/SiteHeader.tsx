"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  LogIn,
  Menu,
  Search,
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState("");

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

  /** Pencarian -&gt; buka grid produk di /order dengan kata kunci. */
  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/order?q=${encodeURIComponent(q)}`);
  }

  // "Kontak" sengaja tidak ada di daftar ini (dokumen "Perbaikan Ruma Komugi 2",
  // item 2): link Kontak dihapus dari navigasi dan info kontaknya dipindah ke
  // halaman /account — tekan "Kontak" di sana untuk membuka popup.
  const links = [
    { href: "/#menu", label: t.nav.menu, desc: "" },
    { href: "/track", label: t.nav.track, desc: "" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-cocoa-200/70 bg-cream-50/85 shadow-[0_2px_18px_-12px_rgba(26,17,10,0.18)] backdrop-blur-xl"
          : "border-b border-transparent bg-cream-50/0"
      }`}
    >
      {/* ---------- Mobile: top bar ala UIUX 4 ----------
          Urutannya: tombol menu · kolom pencarian · lonceng · avatar.
          Desktop masih pakai bar logo + nav di bawah. */}
      <div className="flex h-16 items-center gap-2.5 px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid size-10 shrink-0 place-items-center rounded-xl text-cocoa-700 transition active:bg-cocoa-100"
          aria-label="Menu"
          aria-expanded={open}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        <form onSubmit={submitSearch} className="min-w-0 flex-1" role="search">
          <label className="flex items-center gap-2 rounded-full border border-cocoa-200 bg-white px-3.5 py-2">
            <Search className="size-4 shrink-0 text-cocoa-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.home.searchPlaceholder}
              aria-label={t.home.searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-cocoa-400"
            />
          </label>
        </form>

        {/* Belum ada fitur notifikasi, jadi lonceng ini diarahkan ke /account
            (riwayat pesanan) — bukan tombol mati. */}
        <Link
          href="/account"
          className="relative grid size-10 shrink-0 place-items-center rounded-xl text-cocoa-700 transition active:bg-cocoa-100"
          aria-label={t.nav.orders}
        >
          <Bell className="size-5" />
          <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-honey-400 ring-2 ring-cream-50" />
        </Link>

        {loading && !profile ? (
          <span
            aria-hidden
            className="size-9 shrink-0 animate-pulse rounded-full bg-cocoa-100"
          />
        ) : profile ? (
          <Link
            href="/account"
            className="size-9 shrink-0 overflow-hidden rounded-full bg-matcha-500"
            aria-label={t.customerAuth.accountChip}
          >
            <span className="grid h-full w-full place-items-center text-white">
              <UserCircle className="size-5" />
            </span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => openAuthModal("login")}
            className="size-9 shrink-0 overflow-hidden rounded-full bg-cocoa-100"
            aria-label={t.customerAuth.loginCta}
          >
            <span className="grid h-full w-full place-items-center text-cocoa-500">
              <UserCircle className="size-5" />
            </span>
          </button>
        )}
      </div>

      {/* ---------- Desktop ---------- */}
      <div className="mx-auto hidden h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 md:flex">
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

        <nav className="flex items-center gap-1" aria-label="Main">
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
          {loading && !profile ? (
            <span
              aria-hidden="true"
              className="h-10 w-10 animate-pulse rounded-full bg-cocoa-100"
            />
          ) : profile ? (
            <Link
              href="/account"
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-matcha-500 px-3.5 text-[13px] font-bold text-white shadow-sm shadow-matcha-900/20 transition hover:bg-matcha-600"
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
              className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cocoa-200 bg-white px-3.5 text-[13px] font-bold text-cocoa-700 transition hover:bg-cocoa-100"
            >
              <LogIn className="size-4" />
              <span>{t.customerAuth.loginCta}</span>
            </button>
          )}
          <Link
            href="/order"
            className="btn-primary !px-4 !py-2.5 text-[13px]"
          >
            <ShoppingBag className="size-4" />
            {t.nav.order}
          </Link>
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