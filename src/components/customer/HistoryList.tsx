"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, History, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  formatDateTime,
  formatIDR,
  formatPlain,
  getOrderHistorySnapshot,
  subscribeOrderHistory,
} from "@/lib/utils";
import type { OrderHistoryEntry } from "@/lib/utils";

/** Snapshot kosong yang stabil untuk render server. */
const EMPTY_HISTORY: OrderHistoryEntry[] = [];

/**
 * Halaman /riwayat.
 *
 * Isinya dibaca dari localStorage perangkat INI, bukan dari database — sesuai
 * permintaan Steven: "beda HP beda history". Pembeli yang tidak punya akun
 * tetap bisa melihat semua pesanan yang pernah ia buat sendiri.
 *
 * Pembacaan lewat `useSyncExternalStore` (bukan `useState` + `useEffect`)
 * supaya snapshot-nya referensinya stabil dan tidak memicu render berlapis;
 * detail mekanisme ada di `src/lib/utils.ts`.
 *
 * `getServerSnapshot` mengembalikan `[]` supaya render server dan render
 * pertama di browser sama — kalau tidak, React protes hydration mismatch.
 */
export function HistoryList() {
  const { t, lang } = useI18n();
  const rows = useSyncExternalStore(
    subscribeOrderHistory,
    getOrderHistorySnapshot,
    () => EMPTY_HISTORY
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-cocoa-100 text-cocoa-500">
          <History className="size-6" />
        </span>
        <p className="mt-3 text-sm font-bold text-cocoa-800">
          {t.historyPage.empty}
        </p>
        <p className="mt-1 text-xs text-cocoa-500">{t.historyPage.emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.order_code}
          className="rounded-2xl border border-cocoa-200 bg-white p-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-base font-bold tracking-wide text-cocoa-900">
                {row.order_code}
              </p>
              <p className="mt-0.5 text-[11px] text-cocoa-400">
                {formatDateTime(row.created_at, lang)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-extrabold text-cocoa-900 tabular">
                {formatIDR(row.total_price, lang)}
              </p>
              <p className="text-[11px] text-cocoa-400">
                {t.historyPage.itemCount.replace(
                  "{n}",
                  formatPlain(row.item_count, lang)
                )}
              </p>
            </div>
          </div>

          {/* Buka /track dengan kode + nomorHP yang sudah tersimpan, jadi
              pembeli tidak perlu mengetik ulang. */}
          <div className="mt-3 flex gap-2">
            <Link
              href={`/track?code=${encodeURIComponent(row.order_code)}&phone=${encodeURIComponent(row.phone)}`}
              className="btn-outline flex-1 !py-2 !text-[12px]"
            >
              <Search className="size-3.5" />
              {t.historyPage.viewOrder}
            </Link>
            <Link
              href={`/order/success/${encodeURIComponent(row.order_code)}`}
              className="btn-ghost !py-2 !text-[12px]"
              aria-label={t.historyPage.viewOrder}
            >
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Link "kembali" yang dipakai halaman /riwayat. */
export function HistoryBack() {
  const { t } = useI18n();
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-1.5 text-sm font-bold text-cocoa-500 transition hover:text-cocoa-900"
    >
      <ArrowLeft className="size-4" />
      {t.historyPage.back}
    </Link>
  );
}