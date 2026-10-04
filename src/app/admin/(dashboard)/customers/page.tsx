import type { Metadata } from "next";
import { getCustomersAction } from "@/app/admin/actions";
import { CustomersClient } from "@/components/admin/CustomersClient";
import { getI18nDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Customers", robots: { index: false, follow: false } };
}

export default async function AdminCustomersPage() {
  const [customersRes, dicts] = await Promise.all([
    getCustomersAction(),
    getI18nDict(),
  ]);

  return (
    <CustomersClient
      customers={customersRes.data ?? []}
      labels={dicts.admin.customers}
    />
  );
}