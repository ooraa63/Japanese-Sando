"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { signOutAction } from "@/app/admin/actions";

const NAV = [
  { href: "/admin", key: "dashboard" as const, icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", key: "orders" as const, icon: ClipboardList, exact: false },
  { href: "/admin/menu", key: "menu" as const, icon: UtensilsCrossed, exact: false },
  { href: "/admin/customers", key: "customers" as const, icon: Users, exact: false },
  { href: "/admin/settings", key: "settings" as const, icon: Settings, exact: false },
];

export function AdminShell({
  children,
  email,
  fullName,
  storeName,
  logoUrl,
  labels,
}: {
  children: ReactNode;
  email: string;
  fullName: string;
  storeName: string;
  logoUrl?: string | null;
  labels: {
    dashboard: string;
    orders: string;
    menu: string;
    customers: string;
    settings: string;
    viewSite: string;
    signOut: string;
  };
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard">
      {NAV.map(({ href, key, icon: Icon, exact }) => {
        const active = isActive(href, exact);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
              active
                ? "bg-cocoa-800 text-cream-50 shadow-lg shadow-cocoa-900/15"
                : "text-cocoa-500 hover:bg-cocoa-100 hover:text-cocoa-900"
            }`}
          >
            <Icon className="size-4.5 shrink-0" />
            {labels[key]}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-1 border-t border-cocoa-200 pt-3">
      <Link
        href="/"
        target="_blank"
        className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-cocoa-500 transition hover:bg-cocoa-100 hover:text-cocoa-900"
      >
        <ExternalLink className="size-4.5 shrink-0" />
        {labels.viewSite}
      </Link>
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-cocoa-500 transition hover:bg-berry-500/10 hover:text-berry-500"
        >
          <LogOut className="size-4.5 shrink-0" />
          {labels.signOut}
        </button>
      </form>
    </div>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-cream-100">
          <Image src={logoUrl} alt="" fill sizes="36px" className="object-cover" />
        </span>
      ) : (
        <span className="grid size-9 place-items-center rounded-xl bg-cocoa-800 text-cream-50">
          <span className="font-display text-base font-bold">日</span>
        </span>
      )}
      <span className="font-display text-[15px] font-bold text-cocoa-900">
        {storeName}
      </span>
    </div>
  );

  return (
    <div className="min-h-dvh bg-cream-50">
      {/* ---------- Sidebar desktop ---------- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 border-r border-cocoa-200 bg-cream-100/70 p-5 lg:flex">
        <Link href="/admin">{brand}</Link>
        {nav}
        {footer}
      </aside>

      {/* ---------- Drawer mobile ---------- */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-cocoa-950/50 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col gap-6 border-r border-cocoa-200 bg-cream-50 p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        {/* ---------- Topbar ---------- */}
        <header className="sticky top-0 z-30 border-b border-cocoa-200/70 bg-cream-50/90 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="grid size-10 place-items-center rounded-xl border border-cocoa-200 text-cocoa-700 transition hover:bg-cocoa-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="size-5" />
            </button>

            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-bold text-cocoa-800">
                {fullName || email}
              </p>
              <p className="truncate text-[11px] text-cocoa-400">{email}</p>
            </div>

            <div className="flex items-center gap-2 lg:ml-auto">
              <LanguageToggle />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
