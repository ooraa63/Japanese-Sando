"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageToggle({ variant = "pill" }: { variant?: "pill" | "ghost" }) {
  const { lang, toggle, t } = useI18n();

  if (variant === "ghost") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-cocoa-500 transition hover:bg-cocoa-100 hover:text-cocoa-800"
        aria-label={t.common.switchLang}
        title={t.common.switchLang}
      >
        {lang === "id" ? "EN" : "ID"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-1.5 rounded-full border border-cocoa-200 bg-white px-3 py-1.5 text-xs font-bold text-cocoa-600 transition hover:border-cocoa-300 hover:text-cocoa-900"
      aria-label={t.common.switchLang}
      title={t.common.switchLang}
    >
      <span
        className={`rounded-full px-1.5 py-0.5 ${
          lang === "id" ? "bg-cocoa-800 text-cream-50" : "text-cocoa-500"
        }`}
      >
        ID
      </span>
      <span
        className={`rounded-full px-1.5 py-0.5 ${
          lang === "en" ? "bg-cocoa-800 text-cream-50" : "text-cocoa-500"
        }`}
      >
        EN
      </span>
    </button>
  );
}
