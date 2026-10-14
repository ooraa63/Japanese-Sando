"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import type { SalesSummary, SalesTransaction } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { paymentLabel, statusLabel } from "@/lib/utils";
import { getMutasiAction } from "@/app/admin/actions";
import { useToast } from "@/components/ui/Toast";
import {
  SalesSummaryCards,
  SalesTransactionsSection,
} from "@/components/admin/shared/SalesTransactions";

interface SalesFilters {
  fromDate: string;
  toDate: string;
  search: string;
}

export function SalesClient({
  initialSummary,
  initialTransactions,
  initialTotal,
  initialFilters,
}: {
  initialSummary: SalesSummary;
  initialTransactions: SalesTransaction[];
  initialTotal: number;
  initialFilters: SalesFilters;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [summary, setSummary] = useState<SalesSummary>(initialSummary);
  const [transactions, setTransactions] = useState<SalesTransaction[]>(initialTransactions);
  const [total, setTotal] = useState(initialTotal);
  const [filters, setFilters] = useState<SalesFilters>(initialFilters);
  const [pending, startTransition] = useTransition();

  const applyFilters = useCallback(
    (next: SalesFilters) => {
      setFilters(next);
      const params = new URLSearchParams();
      if (next.fromDate) params.set("from", next.fromDate);
      if (next.toDate) params.set("to", next.toDate);
      if (next.search) params.set("q", next.search);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname]
  );

  function resetFilters() {
    applyFilters({ fromDate: "", toDate: "", search: "" });
  }

  function reload() {
    startTransition(async () => {
      const res = await getMutasiAction({
        fromDate: filters.fromDate || null,
        toDate: filters.toDate || null,
        search: filters.search,
        limit: 50,
        offset: 0,
      });
      if (res.ok && res.data) {
        setSummary(res.data.summary);
        setTransactions(res.data.transactions);
        setTotal(res.data.total);
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  // Reload otomatis setiap filter berubah.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  async function exportCsv() {
    if (transactions.length === 0) return;
    const header = [
      t.admin.sales.csv.code,
      t.admin.sales.csv.date,
      t.admin.sales.csv.customer,
      t.admin.sales.csv.phone,
      t.admin.sales.csv.items,
      t.admin.sales.csv.subtotal,
      t.admin.sales.csv.delivery,
      t.admin.sales.csv.total,
      t.admin.sales.csv.payment,
      t.admin.sales.csv.status,
    ];
    const rows = transactions.map((tr) => {
      const items = tr.items.map((i) => `${i.flavor_name} x${i.quantity}`).join(" | ");
      return [
        tr.order_code,
        new Date(tr.created_at).toISOString(),
        tr.customer_name,
        tr.phone,
        items,
        tr.subtotal,
        tr.delivery_fee,
        tr.total_price,
        paymentLabel(tr.payment_method, lang),
        statusLabel(tr.status, lang),
      ];
    });

    // Export ke .xlsx (Excel native). Library exceljs adalah pure JS —
    // jalan di browser tanpa server-side dependency.
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Japanese Sando Admin";
    wb.created = new Date();
    const ws = wb.addWorksheet("Mutasi", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: header[0], key: "code", width: 18 },
      { header: header[1], key: "date", width: 22 },
      { header: header[2], key: "customer", width: 28 },
      { header: header[3], key: "phone", width: 16 },
      { header: header[4], key: "items", width: 50 },
      { header: header[5], key: "subtotal", width: 12, style: { numFmt: "#,##0" } },
      { header: header[6], key: "delivery", width: 12, style: { numFmt: "#,##0" } },
      { header: header[7], key: "total", width: 14, style: { numFmt: "#,##0" } },
      { header: header[8], key: "payment", width: 18 },
      { header: header[9], key: "status", width: 16 },
    ];
    // Tulis header manual (style bold + fill)
    ws.getRow(1).values = header;
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFE5DA" },
    };
    rows.forEach((r) => ws.addRow(r));
    // Auto-filter biar enak di Excel
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
    a.download = `mutasi-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-cocoa-900">{t.admin.sales.title}</h1>
        <p className="text-sm text-cocoa-500">{t.admin.sales.subtitle}</p>
      </header>

      <SalesSummaryCards summary={summary} />

      {/* Filter + daftar transaksi. Bentuk ringkas (14-10-2026, Steven:
          "filter itu dibuat kecil aja di tempat daftar transaksi") —
          implementasinya ada di SalesTransactionsSection. */}
      <SalesTransactionsSection
        transactions={transactions}
        total={total}
        filters={filters}
        onChangeFilters={applyFilters}
        onReset={resetFilters}
        onExport={exportCsv}
        loading={pending}
      />
    </div>
  );
}