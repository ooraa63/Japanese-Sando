"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, LayoutGrid, LogOut, X } from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  ADMIN_APPS,
  TAB_DEFAULT,
  appForPath,
  type AdminApp,
  type AdminNavItem,
  type AdminSectionId,
} from "@/lib/admin-nav";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { signOutAction } from "@/app/admin/actions";
import type { AppLabels, SectionLabels } from "@/components/admin/AdminLauncher";

export function AdminShell({
  children,
  email,
  fullName,
  storeName,
  logoUrl,
  labels,
  appLabels,
  sectionLabels,
  itemLabels,
  allAppsLabel,
}: {
  children: ReactNode;
  email: string;
  fullName: string;
  storeName: string;
  logoUrl?: string | null;
  /** Label misc (lihat website, keluar). */
  labels: { viewSite: string; signOut: string };
  appLabels: AppLabels;
  sectionLabels: SectionLabels;
  /** Label tiap menu, diindeks `href` + `?tab=` — lihat `ITEM_LABEL_KEYS`. */
  itemLabels: Record<string, string>;
  /** Tulisan tombol "kembali ke semua aplikasi". */
  allAppsLabel: string;
}) {
  const [open, setOpen] = useState(false);

  /*
   * Sidebar butuh `useSearchParams` (untuk menandai tab `/admin/settings` yang
   * aktif), jadi dia dibungkus Suspense. `<main>` sengaja DI LUAR Suspense:
   * halaman harus tampil walau sidebar sedang menunggu query string.
   */
  return (
    <div className="admin-shell min-h-dvh bg-cream-50">
      <Suspense fallback={null}>
        <Sidebar
          open={open}
          setOpen={setOpen}
          storeName={storeName}
          logoUrl={logoUrl}
          labels={labels}
          appLabels={appLabels}
          sectionLabels={sectionLabels}
          itemLabels={itemLabels}
          allAppsLabel={allAppsLabel}
        />
      </Suspense>

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
              <LayoutGrid className="size-5" />
            </button>

            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-bold text-cocoa-800">{fullName || email}</p>
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

function Sidebar({
  open,
  setOpen,
  storeName,
  logoUrl,
  labels,
  appLabels,
  sectionLabels,
  itemLabels,
  allAppsLabel,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  storeName: string;
  logoUrl?: string | null;
  labels: { viewSite: string; signOut: string };
  appLabels: AppLabels;
  sectionLabels: SectionLabels;
  itemLabels: Record<string, string>;
  allAppsLabel: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /*
   * `?tab=` ikut diteruskan ke `appForPath` karena `/admin/settings` dipakai
   * dua aplikasi sekaligus: tanpa tab, `/admin/settings?tab=payment` akan
   * menampilkan sidebar "Identitas Toko".
   */
  const tabSekarang = searchParams.get("tab");

  const aplikasi = appForPath(pathname, tabSekarang);

  const brand = (
    <div className="flex items-center gap-2.5">
      {logoUrl ? (
        <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-cream-100">
          <Image src={logoUrl} alt="" fill sizes="36px" className="object-cover" />
        </span>
      ) : (
        <span className="grid size-9 place-items-center rounded-xl bg-cocoa-800 text-cream-50">
          <span className="font-display text-base font-bold">RK</span>
        </span>
      )}
      <span className="font-display text-[15px] font-bold text-cocoa-900">{storeName}</span>
    </div>
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

  /**
   * Isi sidebar.
   *
   * Di dalam aplikasi: judul aplikasi + menunya, dikelompokkan per bagian
   * (lihat `ADMIN_APPS`), persis seperti gambar 2. Di luar aplikasi
   * (layar awal): daftar aplikasi sebagai pilihan, karena layar awal sudah
   * menampilkan lempeng yang sama — dua-duanya tidak perlu tampil menunya.
   */
  const nav = aplikasi ? (
    <AppNav
      app={aplikasi}
      appLabels={appLabels}
      pathname={pathname}
      tabSekarang={tabSekarang}
      sectionLabels={sectionLabels}
      itemLabels={itemLabels}
      allAppsLabel={allAppsLabel}
      setOpen={setOpen}
    />
  ) : (
    <div className="space-y-1">
      <p className="px-3.5 pb-1 text-[10px] font-extrabold tracking-widest text-cocoa-400 uppercase">
        {allAppsLabel}
      </p>
      {ADMIN_APPS.map((app) => (
        <Link
          key={app.id}
          href={app.href}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold text-cocoa-500 transition hover:bg-cocoa-100 hover:text-cocoa-900"
        >
          <span className={`grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${app.tile}`}>
            <app.icon className="size-3.5 text-cream-50" />
          </span>
          {appLabels[app.id]}
        </Link>
      ))}
    </div>
  );

  return (
    <>
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
    </>
  );
}

function AppNav({
  app,
  appLabels,
  pathname,
  tabSekarang,
  sectionLabels,
  itemLabels,
  allAppsLabel,
  setOpen,
}: {
  app: AdminApp;
  appLabels: AppLabels;
  pathname: string;
  tabSekarang: string | null;
  sectionLabels: SectionLabels;
  itemLabels: Record<string, string>;
  allAppsLabel: string;
  setOpen: (v: boolean) => void;
}) {
  // Kelompokkan item per bagian, urutannya mengikuti urutan di ADMIN_APPS.
  const groups: Array<{ id: AdminSectionId; items: AdminNavItem[] }> = [];
  for (const item of app.items) {
    const last = groups[groups.length - 1];
    if (last && last.id === item.section) last.items.push(item);
    else groups.push({ id: item.section, items: [item] });
  }

  /*
   * Item aktif harus membandingkan tab yang sudah dinormalisasi. Tanpa itu,
   * `/admin/settings` tanpa query string tidak akan menandai apa pun aktif,
   * padahal tab itu memakai tab default yang sama dengan `?tab=identity`.
   */
  const tabAktif = tabSekarang || TAB_DEFAULT;
  const aktif = (item: AdminNavItem) =>
    pathname === item.href && (item.tab || TAB_DEFAULT) === tabAktif;

  return (
    <nav className="flex flex-1 flex-col gap-4" aria-label={appLabels[app.id]}>
      <Link
        href="/admin"
        onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2 text-xs font-bold text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-900"
      >
        <ArrowLeft className="size-4 shrink-0" />
        {allAppsLabel}
      </Link>

      <div className="flex items-center gap-2.5 px-3.5">
        <span
          className={`grid size-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${app.tile}`}
        >
          <app.icon className="size-4 text-cream-50" />
        </span>
        <span className="font-display text-sm font-extrabold text-cocoa-900">
          {appLabels[app.id]}
        </span>
      </div>

      {groups.map((g) => (
        <div key={g.id} className="space-y-1">
          <p className="px-3.5 text-[10px] font-extrabold tracking-widest text-cocoa-400 uppercase">
            {sectionLabels[g.id]}
          </p>
          {g.items.map((item) => {
            const on = aktif(item);
            return (
              <Link
                key={item.href + (item.tab ?? "")}
                href={itemHref(item)}
                onClick={() => setOpen(false)}
                aria-current={on ? "page" : undefined}
                className={`block rounded-xl px-3.5 py-2.5 text-sm font-bold transition ${
                  on
                    ? "bg-cocoa-800 text-cream-50 shadow-lg shadow-cocoa-900/15"
                    : "text-cocoa-500 hover:bg-cocoa-100 hover:text-cocoa-900"
                }`}
              >
                {itemLabels[`${item.href}${item.tab ? `?tab=${item.tab}` : ""}`] ?? item.href}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** `?tab=` ikut di href supaya tab Pengaturan bisa ditandai aktif. */
function itemHref(item: AdminNavItem): string {
  return item.tab ? `${item.href}?tab=${item.tab}` : item.href;
}