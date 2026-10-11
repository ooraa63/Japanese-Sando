"use client";

import { useI18n } from "@/lib/i18n";

export function LanguageToggle({ variant = "pill" }: { variant?: "pill" | "ghost" | "mini" }) {
  const { lang, toggle, setLang, t } = useI18n();

  // Varian "mini" dipakai di top bar HP: dua tombol terpisah (ID | EN) supaya
  // kedua pilihan terlihat sekaligus dan bisa diklik langsung, bukan satu
  // tombol yang isinya berganti. Versi "pill" cukup buat desktop.
  if (variant === "mini") {
    return (
      <div
        role="group"
        aria-label={t.common.switchLang}
        className="inline-flex shrink-0 items-center rounded-full border border-cocoa-200 bg-white p-0.5"
      >
        {(["id", "en"] as const).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            aria-pressed={lang === code}
            title={t.common.switchLang}
            className={`rounded-full px-1.5 py-1 text-[11px] font-bold transition ${
              lang === code
                ? "bg-cocoa-800 text-cream-50"
                : "text-cocoa-500 hover:text-cocoa-800"
            }`}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>
    );
  }

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
