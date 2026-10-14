"use client";

import { useMemo, useState } from "react";
import { Download, Search, Users } from "lucide-react";
import type { AdminCustomerRow } from "@/app/admin/actions";
import { CustomerTable } from "@/components/admin/shared/CustomerTable";

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
    const ws = wb.addWorksheet("Customers", { views: [{ state: "frozen", ySplit: 1 }] });
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
          <p className="mt-1 text-sm text-cocoa-500">{labels.subtitle}</p>
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
        <span className="font-bold text-cocoa-700 tabular">{filtered.length}</span>
        {filtered.length !== customers.length ? (
          <span> / {customers.length}</span>
        ) : null}
      </div>

      {/* Tabel / cards — sama persis dengan tab Pelanggan di detail batch. */}
      <CustomerTable customers={filtered} />
    </div>
  );
}