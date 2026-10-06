import type { Metadata } from "next";
import { VouchersClient } from "@/components/admin/VouchersClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Vouchers", robots: { index: false, follow: false } };
}

export default function AdminVouchersPage() {
  return <VouchersClient />;
}