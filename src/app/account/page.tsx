import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserCircle } from "lucide-react";
import { getI18nDict } from "@/lib/i18n-server";
import { getCustomerOrders, getCustomerProfile, getSettings } from "@/lib/data";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { CustomerAuthProvider } from "@/components/customer/CustomerAuthProvider";
import { AccountClient } from "./AccountClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "My account", robots: { index: false, follow: false } };
}

export default async function AccountPage() {
  const [profile, orders, dicts, settings] = await Promise.all([
    getCustomerProfile(),
    getCustomerOrders(),
    getI18nDict(),
    getSettings(),
  ]);

  // Belum login? Lempar ke /login?next=/account.
  if (!profile) {
    redirect("/login?next=/account");
  }

  const storeName = settings?.store_name ?? "Rumakomugi";
  const logoUrl = settings?.logo_url ?? null;
  const brandLine = settings?.brand_line ?? "";

  return (
    <CustomerAuthProvider initialProfile={profile}>
      <SiteHeader storeName={storeName} logoUrl={logoUrl} brandLine={brandLine} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-matcha-500 text-white">
                <UserCircle className="size-5" />
              </span>
              <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
                {dicts.account.title}
              </h1>
            </div>
            <p className="mt-2 text-sm text-cocoa-500">{dicts.account.subtitle}</p>
          </div>
          <Link
            href="/order"
            className="btn-primary shrink-0"
          >
            {dicts.account.newOrder}
          </Link>
        </div>

        <AccountClient
          initialProfile={profile}
          initialOrders={orders}
          dict={dicts.account}
        />
      </main>
      <SiteFooter settings={settings} />
    </CustomerAuthProvider>
  );
}