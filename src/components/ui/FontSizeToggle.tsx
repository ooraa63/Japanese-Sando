"use client";

import { useFontSize } from "@/components/ui/FontSizeProvider";
import { useI18n } from "@/lib/i18n";

/**
 * Tombol toggle compact/normal. Dirancang kecil supaya muat di
 * header mobile, di samping LanguageToggle.
 *
 *   - mode "normal"  -> tampilkan label "A−" (perkecil). Klik -> compact.
 *   - mode "compact" -> tampilkan label "A"  (balik normal). Klik -> normal.
 */
export function FontSizeToggle({ variant = "pill" }: { variant?: "pill" | "ghost" }) {
  const { mode, toggle } = useFontSize();
  const { t } = useI18n();
  const isCompact = mode === "compact";

  const ariaLabel = isCompact
    ? `${t.common.fontSize}: ${t.common.fontSizeNormal}`
    : `${t.common.fontSize}: ${t.common.fontSizeCompact}`;

  if (variant === "ghost") {
    return (
      <button
        type="button"
        onClick={toggle}
        className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-cocoa-500 transition hover:bg-cocoa-100 hover:text-cocoa-800"
        aria-label={ariaLabel}
        aria-pressed={isCompact}
        title={ariaLabel}
      >
        {isCompact ? "A" : "A−"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center gap-0.5 rounded-full border border-cocoa-200 bg-white px-1.5 py-1.5 text-xs font-bold text-cocoa-600 transition hover:border-cocoa-300 hover:text-cocoa-900"
      aria-label={ariaLabel}
      aria-pressed={isCompact}
      title={ariaLabel}
    >
      <span
        className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] ${
          !isCompact ? "bg-cocoa-800 text-cream-50" : "text-cocoa-500"
        }`}
      >
        A
      </span>
      <span
        className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-[11px] ${
          isCompact ? "bg-cocoa-800 text-cream-50" : "text-cocoa-500"
        }`}
      >
        −
      </span>
    </button>
  );
}
