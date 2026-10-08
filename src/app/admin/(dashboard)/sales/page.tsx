import type { Metadata } from "next";
import { getMutasiAction } from "@/app/admin/actions";
import { SalesClient } from "@/components/admin/SalesClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Mutasi", robots: { index: false, follow: false } };
}

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    flavor?: string;
    q?: string;
  }>;
}) {
  const sp = await searchParams;
  const flavorId = sp.flavor && /^\d+$/.test(sp.flavor) ? Number(sp.flavor) : null;
  const fromDate = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null;
  const toDate = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null;

  // Filter per-rasa lewat query param `?flavor=<id>` (dijawab di DB,
  // lihat getMutasiAction). Lista rasa tidak perlu dikirim ke client —
  // kartu "Paling laris" memang bersumber dari `summary.top_flavors`.
  const mutasiRes = await getMutasiAction({
    fromDate,
    toDate,
    flavorId,
    search: sp.q ?? "",
    limit: 50,
    offset: 0,
  });

  return (
    <SalesClient
      initialSummary={
        mutasiRes.data?.summary ?? {
          revenue_total: 0,
          orders_count: 0,
          pcs_sold: 0,
          revenue_today: 0,
          orders_today: 0,
          top_flavors: [],
        }
      }
      initialTransactions={mutasiRes.data?.transactions ?? []}
      initialTotal={mutasiRes.data?.total ?? 0}
      initialFilters={{
        fromDate: fromDate ?? "",
        toDate: toDate ?? "",
        search: sp.q ?? "",
      }}
    />
  );
}