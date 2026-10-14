"use client";

import { Mail, MessageCircle, Users } from "lucide-react";
import type { AdminCustomerRow } from "@/app/admin/actions";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatIDR, formatPhone } from "@/lib/utils";

/**
 * Tabel "Database Pelanggan" yang dipakai bersama oleh halaman Pelanggan di
 * sidebar dan tab Pelanggan di `/admin/po/[id]`.
 *
 * Bedanya cuma asal datanya: semua pelanggan vs pelanggan milik satu batch.
 * Steven 14-10-2026: tab Pelanggan di detail batch harus sama persis dengan
 * yang di sidebar (gambar 5).
 */

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function CustomerTable({ customers }: { customers: AdminCustomerRow[] }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const labels = t.admin.customers;

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(labels.copied, value);
    } catch {
      toast.error(message);
    }
  }

  if (customers.length === 0) {
    return (
      <div className="card p-14 text-center">
        <Users className="mx-auto size-8 text-cocoa-300" />
        <p className="mt-3 text-sm text-cocoa-400">{labels.empty}</p>
      </div>
    );
  }

  return (
    <>
      {/* Tabel desktop */}
      <div className="hidden overflow-hidden rounded-2xl border border-cocoa-200 md:block">
        <table className="w-full text-sm">
          <thead className="bg-cocoa-50 text-left text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
            <tr>
              <th className="px-4 py-3">{labels.name}</th>
              <th className="px-4 py-3">{labels.phone}</th>
              <th className="px-4 py-3">{labels.email}</th>
              <th className="px-4 py-3">{labels.instagram}</th>
              <th className="px-4 py-3 text-right">{labels.totalOrders}</th>
              <th className="px-4 py-3 text-right">{labels.totalSpent}</th>
              <th className="px-4 py-3 text-right">{labels.lastOrder}</th>
              <th className="px-4 py-3 text-right">{t.common.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cocoa-100 bg-white">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-cocoa-50/40">
                <td className="px-4 py-3 font-bold text-cocoa-900">{c.customer_name}</td>
                <td className="px-4 py-3 tabular text-cocoa-600" dir="ltr">
                  {formatPhone(c.phone)}
                </td>
                <td className="px-4 py-3 text-cocoa-600">
                  {c.customer_email ? (
                    <span className="tabular">{c.customer_email}</span>
                  ) : (
                    <span className="text-cocoa-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-cocoa-600 tabular">
                  {c.instagram ? (
                    `@${c.instagram}`
                  ) : (
                    <span className="text-cocoa-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-bold text-cocoa-900 tabular">
                  {c.order_count}
                </td>
                <td className="px-4 py-3 text-right font-bold text-matcha-700 tabular">
                  {formatIDR(c.total_spent, lang)}
                </td>
                <td className="px-4 py-3 text-right text-[12px] text-cocoa-500">
                  {formatDateTime(c.last_order_at, lang)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          c.phone,
                          lang === "en" ? "Could not copy phone" : "Gagal menyalin telepon"
                        )
                      }
                      title={labels.copyWa}
                      className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
                    >
                      <MessageCircle className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          c.customer_email ?? "",
                          lang === "en" ? "Could not copy email" : "Gagal menyalin email"
                        )
                      }
                      title={t.common.copy}
                      className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
                    >
                      <Mail className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          c.instagram ?? "",
                          lang === "en" ? "Could not copy" : "Gagal menyalin"
                        )
                      }
                      title={t.common.copy}
                      className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
                    >
                      <InstagramGlyph className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards mobile */}
      <ul className="grid gap-3 md:hidden">
        {customers.map((c) => (
          <li key={c.id} className="card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-cocoa-900">{c.customer_name}</p>
                <p className="mt-0.5 text-xs text-cocoa-500 tabular" dir="ltr">
                  {formatPhone(c.phone)}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-cocoa-100 px-2 py-1 text-xs font-bold text-cocoa-700 tabular">
                {c.order_count}
              </span>
            </div>
            {c.customer_email ? (
              <p className="mt-1 truncate text-xs text-cocoa-500 tabular">{c.customer_email}</p>
            ) : null}
            {c.instagram ? (
              <p className="truncate text-xs text-cocoa-500 tabular">@{c.instagram}</p>
            ) : null}
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-cocoa-500 tabular">
                {formatIDR(c.total_spent, lang)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      c.phone,
                      lang === "en" ? "Could not copy phone" : "Gagal menyalin telepon"
                    )
                  }
                  className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
                >
                  <MessageCircle className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      c.customer_email ?? "",
                      lang === "en" ? "Could not copy email" : "Gagal menyalin email"
                    )
                  }
                  className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
                >
                  <Mail className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    copyText(
                      c.instagram ?? "",
                      lang === "en" ? "Could not copy" : "Gagal menyalin"
                    )
                  }
                  className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-cocoa-700"
                >
                  <InstagramGlyph className="size-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}