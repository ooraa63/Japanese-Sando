"use client";

import { useMemo, useState } from "react";
import {
  Download,
  Mail,
  MessageCircle,
  Search,
  Users,
} from "lucide-react";
import type { AdminCustomerRow } from "@/app/admin/actions";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatIDR, formatPhone } from "@/lib/utils";

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

type LabelSet = {
  title: string;
  subtitle: string;
  search: string;
  copyWa: string;
  copyAll: string;
  copied: string;
  exportCsv: string;
  empty: string;
  name: string;
  phone: string;
  email: string;
  instagram: string;
  totalOrders: string;
  totalSpent: string;
  lastOrder: string;
};

export function CustomersClient({
  customers,
  labels,
}: {
  customers: AdminCustomerRow[];
  labels: LabelSet;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.customer_email ?? "").toLowerCase().includes(q) ||
        (c.instagram ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  // Group by phone_normalized agar 1 orang = 1 baris (sudah dari RPC).
  // totalOrders + totalSpent sudah terakumulasi.

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(labels.copied, value);
    } catch {
      toast.error(message);
    }
  }

  async function exportCsv() {
    const header = [
      labels.name,
      labels.phone,
      labels.email,
      labels.instagram,
      labels.totalOrders,
      labels.totalSpent,
      labels.lastOrder,
    ];
    const dataRows = filtered.map((c) => [
      c.customer_name,
      c.phone,
      c.customer_email ?? "",
      c.instagram ?? "",
      String(c.order_count),
      String(c.total_spent),
      c.last_order_at,
    ]);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Japanese Sando Admin";
    wb.created = new Date();
    const ws = wb.addWorksheet("Customers", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    ws.getRow(1).values = header;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFE5DA" },
    };
    ws.columns = [
      { key: "name", width: 28 },
      { key: "phone", width: 16 },
      { key: "email", width: 28 },
      { key: "instagram", width: 18 },
      { key: "total_orders", width: 12 },
      { key: "total_spent", width: 14, style: { numFmt: "#,##0" } },
      { key: "last_order_at", width: 22 },
    ];
    dataRows.forEach((r) => ws.addRow(r));
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: header.length },
    };

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">
            {labels.subtitle}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="btn-outline"
          >
            <Download className="size-4" />
            {labels.exportCsv}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
        <input
          className="input !py-2.5 pl-10"
          placeholder={labels.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
        />
      </div>

      {/* Count */}
      <div className="flex items-center gap-2 text-sm text-cocoa-500">
        <Users className="size-4" />
        <span className="font-bold text-cocoa-700 tabular">
          {filtered.length}
        </span>
        {filtered.length !== customers.length ? (
          <span> / {customers.length}</span>
        ) : null}
      </div>

      {/* Tabel / cards */}
      {filtered.length === 0 ? (
        <div className="card p-14 text-center">
          <Users className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">{labels.empty}</p>
        </div>
      ) : (
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
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-cocoa-50/40">
                    <td className="px-4 py-3 font-bold text-cocoa-900">
                      {c.customer_name}
                    </td>
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
                      {c.instagram ? `@${c.instagram}` : (
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
                              lang === "en"
                                ? "Could not copy phone"
                                : "Gagal menyalin telepon"
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
                              lang === "en"
                                ? "Could not copy email"
                                : "Gagal menyalin email"
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
                              lang === "en"
                                ? "Could not copy"
                                : "Gagal menyalin"
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
            {filtered.map((c) => (
              <li key={c.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-cocoa-900">
                      {c.customer_name}
                    </p>
                    <p className="mt-0.5 text-xs text-cocoa-500 tabular" dir="ltr">
                      {formatPhone(c.phone)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-cocoa-100 px-2 py-1 text-xs font-bold text-cocoa-700 tabular">
                    {c.order_count}
                  </span>
                </div>
                {c.customer_email ? (
                  <p className="mt-1 truncate text-xs text-cocoa-500 tabular">
                    {c.customer_email}
                  </p>
                ) : null}
                {c.instagram ? (
                  <p className="truncate text-xs text-cocoa-500 tabular">
                    @{c.instagram}
                  </p>
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
                          lang === "en"
                            ? "Could not copy phone"
                            : "Gagal menyalin telepon"
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
                          lang === "en"
                            ? "Could not copy email"
                            : "Gagal menyalin email"
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
      )}
    </div>
  );
}