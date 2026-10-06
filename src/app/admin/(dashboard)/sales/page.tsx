import type { Metadata } from "next";
import { getMutasiAction, getCategoriesAction } from "@/app/admin/actions";
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

  const [mutasiRes, categoriesRes] = await Promise.all([
    getMutasiAction({
      fromDate,
      toDate,
      flavorId,
      search: sp.q ?? "",
      limit: 50,
      offset: 0,
    }),
    getCategoriesAction(),
  ]);

  // Flatten flavors dari categories (laba include flavor_id, name, name_en, dll)
  type FlavorLite = {
    id: number;
    name_id: string;
    name_en: string;
    is_active: boolean;
  };
  const flavorList = categoriesRes.data ?? [];
  const flavors: FlavorLite[] = categoriesRes.ok
    ? flavorList.flatMap(
        (c) =>
          (
            (c as unknown as { flavors?: FlavorLite[] }).flavors ?? []
          ).map((f) => ({
            id: f.id,
            name_id: f.name_id,
            name_en: f.name_en,
            is_active: f.is_active,
          }))
      )
    : [];

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
      flavors={flavors}
      initialFilters={{
        fromDate: fromDate ?? "",
        toDate: toDate ?? "",
        flavorId: flavorId,
        search: sp.q ?? "",
      }}
    />
  );
}