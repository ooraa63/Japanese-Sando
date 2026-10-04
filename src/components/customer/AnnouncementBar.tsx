"use client";

import { useState } from "react";
import { ChevronDown, Megaphone } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Spanduk pengumuman + batas pre-order, menempel di atas header.
 */
export function AnnouncementBar({
  messageId,
  messageEn,
  deadlineId,
  deadlineEn,
}: {
  messageId?: string | null;
  messageEn?: string | null;
  deadlineId?: string | null;
  deadlineEn?: string | null;
}) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const message = (lang === "en" ? messageEn : messageId)?.trim() ?? "";
  const deadline = (lang === "en" ? deadlineEn : deadlineId)?.trim() ?? "";
  const isLong = message.length > 70;

  return (
    <div className="relative z-50 bg-cocoa-950 text-cream-100">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 py-3 text-center text-sm font-semibold sm:px-6 sm:text-base">
        {message ? (
          <p
            className={`flex items-center gap-2 font-semibold text-honey-300 ${
              isLong && !expanded ? "line-clamp-1" : ""
            }`}
          >
            <Megaphone className="size-3.5 shrink-0" />
            {message}
          </p>
        ) : null}
        {deadline ? (
          <p className="shrink-0 text-cream-200/70">
            {t.contact.deadline}:{" "}
            <span className="font-semibold text-cream-100">{deadline}</span>
          </p>
        ) : null}
      </div>

      {isLong ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-md text-cream-200/60 transition hover:bg-cream-50/10 hover:text-cream-50 sm:right-2 sm:size-8"
          aria-label={expanded ? "Hide" : "Show more"}
          aria-expanded={expanded}
        >
          <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      ) : null}
    </div>
  );
}
