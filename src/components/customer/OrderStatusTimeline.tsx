"use client";

import { Check, CircleSlash, X } from "lucide-react";
import type { OrderStatus } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { CUSTOMER_FLOW } from "@/lib/utils";

/**
 * Timeline status pesanan untuk sisi pembeli.
 * Menampilkan alur normal (menunggu → diterima → siap → selesai),
 * atau pesan khusus kalau pesanan ditolak/dibatalkan.
 */
export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  const { t } = useI18n();

  if (status === "rejected" || status === "cancelled") {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-berry-500/10 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-berry-500 text-white">
          <X className="size-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-berry-600">{t.status[status]}</p>
          <p className="text-xs text-cocoa-500">
            {status === "rejected" ? t.status.rejectedHint : t.status.cancelledHint}
          </p>
        </div>
      </div>
    );
  }

  const currentIndex = CUSTOMER_FLOW.indexOf(status);

  return (
    <ol className="mt-5 flex items-start">
      {CUSTOMER_FLOW.map((s, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <li key={s} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span
                className={`h-0.5 flex-1 ${i === 0 ? "bg-transparent" : done || active ? "bg-matcha-500" : "bg-cocoa-200"}`}
              />
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition ${
                  done
                    ? "border-matcha-500 bg-matcha-500 text-white"
                    : active
                      ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                      : "border-cocoa-200 bg-white text-cocoa-300"
                }`}
              >
                {done ? <Check className="size-3.5" /> : <CircleSlash className="size-3" />}
              </span>
              <span
                className={`h-0.5 flex-1 ${
                  i === CUSTOMER_FLOW.length - 1
                    ? "bg-transparent"
                    : done
                      ? "bg-matcha-500"
                      : "bg-cocoa-200"
                }`}
              />
            </div>
            <span
              className={`mt-2 max-w-[5.5rem] text-center text-[10px] leading-tight font-bold ${
                active ? "text-cocoa-800" : done ? "text-matcha-600" : "text-cocoa-300"
              }`}
            >
              {t.status[s]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
