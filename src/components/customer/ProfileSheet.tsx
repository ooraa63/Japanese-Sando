"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  FileText,
  HelpCircle,
  LogIn,
  LogOut,
  MessageCircle,
  Sparkles,
  UserCircle,
  X,
} from "lucide-react";
import type { ProfileMenuItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCustomerAuth } from "@/components/customer/CustomerAuthProvider";

/**
 * Tab "Profil" di bottom nav + sheet daftar menu.
 *
 * Permintaan Steven (10-10-2026): tab paling kanan bukan halaman, tapi
 * membuka daftar bar (Account, Contact Us, FAQ, dst). Bar-nya dikelola
 * penjual dari dashboard, dan ketika satu bar ditekan barulah muncul popup
 * berisi isinya — bukan berpindah halaman.
 *
 * Bar "Account" berperilaku berbeda: kalau belum login, dia membuka form
 * login (AuthModal global). Kalau sudah login, menampilkan nama lalu link
 * ke /account.
 *
 * Status buka/tutup disimpan di store modul-level, bukan di state komponen,
 * karena tombol tab dan sheet-nya adalah dua komponen terpisah dalam satu
 * pohon (lihat ProfileTabButton).
 */

/* ---------- store: status sheet ---------- */

let sheetOpen = false;
const listeners = new Set<() => void>();

function setSheetOpen(next: boolean) {
  if (sheetOpen === next) return;
  sheetOpen = next;
  for (const l of listeners) l();
}

function subscribeSheet(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSheetOpen = () => sheetOpen;

/* ---------- pemetaan ikon ---------- */

/**
 * Ikon untuk sebuah bar menu.
 *
 * String `icon` datang dari database, jadi tidak boleh dipakai langsung
 * sebagai nama komponen. Karena itu dipetakan di sini lewat switch dan
 * mengembalikan JSX — bukan komponen — supaya nilainya tetap statis
 * (react-hooks/static-components menolak komponen yang dibuat saat render).
 * Nama yang tidak dikenal jatuh ke HelpCircle, bukan crash.
 */
function iconNode(name: string): React.ReactNode {
  const cls = "size-4.5";
  switch (name) {
    case "UserCircle":
      return <UserCircle className={cls} />;
    case "MessageCircle":
      return <MessageCircle className={cls} />;
    case "Clock":
      return <Clock className={cls} />;
    case "FileText":
      return <FileText className={cls} />;
    case "Sparkles":
      return <Sparkles className={cls} />;
    default:
      return <HelpCircle className={cls} />;
  }
}

/* ---------- tombol tab ---------- */

export function ProfileTabButton() {
  const { t } = useI18n();
  const open = useSyncExternalStore(
    subscribeSheet,
    getSheetOpen,
    () => false
  );

  return (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      aria-expanded={open}
      className={`flex w-full flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold tracking-wide transition ${
        open ? "text-honey-600" : "text-cocoa-400 hover:text-cocoa-700"
      }`}
    >
      <UserCircle className={`size-5 ${open ? "scale-110 fill-honey-400/20" : ""}`} />
      <span className="text-center leading-tight">{t.nav.profile}</span>
    </button>
  );
}

/* ---------- sheet ---------- */

export function ProfileSheet({ items }: { items: ProfileMenuItem[] }) {
  const { t } = useI18n();
  const open = useSyncExternalStore(subscribeSheet, getSheetOpen, () => false);
  const [active, setActive] = useState<ProfileMenuItem | null>(null);

  const closeSheet = useCallback(() => {
    setActive(null);
    setSheetOpen(false);
  }, []);

  // Esc menutup yang paling atas dulu: popup, baru sheet-nya.
  // Body dikunci scroll supaya sheet tidak bisa "terdingin" di belakang.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (active) setActive(null);
      else closeSheet();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, active, closeSheet]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-cocoa-950/50 backdrop-blur-[2px] md:hidden"
        onClick={closeSheet}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.nav.profile}
        className="fixed inset-x-0 bottom-0 z-50 flex justify-center md:hidden"
      >
        <div className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-cream-50 shadow-2xl">
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-cocoa-200 bg-cream-50/95 px-5 py-4 backdrop-blur">
            <div className="min-w-0">
              <h2 className="font-display text-lg font-extrabold text-cocoa-900">
                {t.nav.profile}
              </h2>
              <p className="text-[11px] text-cocoa-400">{t.profile.sheetSubtitle}</p>
            </div>
            <button
              type="button"
              onClick={closeSheet}
              aria-label={t.common.close}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-cocoa-100 text-cocoa-600"
            >
              <X className="size-4" />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-cocoa-400">
              {t.profile.menuEmpty}
            </p>
          ) : (
            <ul className="divide-y divide-cocoa-100 px-5 py-1">
              {items.map((item) => (
                <ProfileRow key={item.id} item={item} onOpen={() => setActive(item)} />
              ))}
            </ul>
          )}

          <div className="px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <button
              type="button"
              onClick={closeSheet}
              className="w-full rounded-xl bg-cocoa-100 py-2.5 text-sm font-bold text-cocoa-700 transition active:bg-cocoa-200"
            >
              {t.common.close}
            </button>
          </div>
        </div>
      </div>

      {active ? (
        <ProfilePopup item={active} onClose={() => setActive(null)} />
      ) : null}
    </>
  );
}

/* ---------- satu bar ---------- */

function ProfileRow({
  item,
  onOpen,
}: {
  item: ProfileMenuItem;
  onOpen: () => void;
}) {
  const { t, lang } = useI18n();
  const { profile, openAuthModal } = useCustomerAuth();
  const Icon = iconNode(item.icon);
  const title = lang === "en" ? item.title_en || item.title_id : item.title_id;

  const hint =
    item.code === "account"
      ? profile
        ? profile.full_name || t.profile.signedIn
        : t.profile.signInHint
      : "";

  const badge = (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
      {Icon}
    </span>
  );

  // Belum login -> bar akun langsung membuka form login (tidak popup isi).
  if (item.code === "account" && !profile) {
    return (
      <li>
        <button
          type="button"
          onClick={() => openAuthModal("login")}
          className="flex w-full items-center gap-3 py-3.5 text-left transition active:bg-cocoa-50"
        >
          {badge}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-cocoa-900">{title}</span>
            <span className="block truncate text-xs text-cocoa-500">{hint}</span>
          </span>
          <LogIn className="size-4 shrink-0 text-cocoa-300" />
        </button>
      </li>
    );
  }

  // Sudah login -> nama tampil, tap lanjut ke halaman akun.
  if (item.code === "account" && profile) {
    return (
      <li>
        <Link
          href="/account"
          className="flex items-center gap-3 py-3.5 transition active:bg-cocoa-50"
        >
          {badge}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-cocoa-900">{title}</span>
            <span className="block truncate text-xs text-cocoa-500">{hint}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-cocoa-300" />
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 py-3.5 text-left transition active:bg-cocoa-50"
      >
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-cocoa-900">{title}</span>
          {hint ? (
            <span className="block truncate text-xs text-cocoa-500">{hint}</span>
          ) : null}
        </span>
        <ArrowRight className="size-4 shrink-0 text-cocoa-300" />
      </button>
    </li>
  );
}

/* ---------- popup isi bar ---------- */

function ProfilePopup({
  item,
  onClose,
}: {
  item: ProfileMenuItem;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  const { profile, signOutClient } = useCustomerAuth();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = lang === "en" ? item.title_en || item.title_id : item.title_id;

  if (item.code === "account") {
    return (
      <PopupFrame title={title} onClose={onClose}>
        {profile ? (
          <div className="space-y-4">
            <p className="text-sm text-cocoa-500">{t.profile.signedInAs}</p>
            <p className="font-display text-xl font-extrabold text-cocoa-900">
              {profile.full_name || t.profile.signedIn}
            </p>
            {profile.phone ? (
              <p className="text-sm tabular text-cocoa-500">{profile.phone}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Link href="/account" className="btn-primary" onClick={onClose}>
                {t.nav.account}
              </Link>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void signOutClient();
                }}
                className="btn-outline"
              >
                <LogOut className="size-4" />
                {t.account.signOut}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-cocoa-500">{t.profile.signInToSee}</p>
            <Link href="/login" onClick={onClose} className="btn-primary">
              <LogIn className="size-4" />
              {t.customerAuth.loginCta}
            </Link>
            <Link href="/register" onClick={onClose} className="btn-ghost">
              {t.customerAuth.register.title}
            </Link>
          </div>
        )}
      </PopupFrame>
    );
  }

  const body = lang === "en" ? item.body_en || item.body_id : item.body_id;
  const buttons = Array.isArray(item.buttons) ? item.buttons : [];

  return (
    <PopupFrame title={title} onClose={onClose}>
      {body ? (
        <p className="text-sm leading-relaxed whitespace-pre-line text-cocoa-600">
          {body}
        </p>
      ) : (
        <p className="rounded-xl bg-cocoa-50 px-3.5 py-3 text-sm text-cocoa-400">
          {t.profile.notFilledYet}
        </p>
      )}

      {buttons.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {buttons.map((b, i) => {
            const label = lang === "en" ? b.label_en || b.label_id : b.label_id;
            if (!label || !b.href) return null;
            const external = /^https?:\/\//i.test(b.href);
            return (
              <li key={`${b.href}-${i}`}>
                <a
                  href={b.href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noopener noreferrer" : undefined}
                  className="flex items-center justify-between gap-2 rounded-xl border border-cocoa-200 px-3.5 py-3 text-sm font-bold text-cocoa-800 transition hover:border-honey-400 hover:bg-honey-50"
                >
                  {label}
                  <ArrowRight className="size-4 shrink-0 text-honey-600" />
                </a>
              </li>
            );
          })}
        </ul>
      ) : null}
    </PopupFrame>
  );
}

function PopupFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-cocoa-950/50 backdrop-blur-[2px] md:hidden"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-cream-50 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="font-display text-lg font-extrabold text-cocoa-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-cocoa-100 text-cocoa-600"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}