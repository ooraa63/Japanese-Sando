import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserCircle } from "lucide-react";
import { getI18nDict } from "@/lib/i18n-server";
import { getCustomerOrders, getCustomerProfile, getSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { CustomerAuthProvider } from "@/components/customer/CustomerAuthProvider";
import { AccountClient } from "./AccountClient";
import { VouchersSection } from "@/components/customer/VouchersSection";
import { ContactSection } from "@/components/customer/ContactSection";
import { CompleteProfileCard } from "@/components/customer/CompleteProfileCard";
import { getMyVouchersAction } from "@/app/review-actions";

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

  // Belum login sama sekali? Lempar ke /login?next=/account.
  // (Kalau sudah login tapi profile belum lengkap — mis. Google OAuth yang
  // belum isi phone — lanjut render di bawah dengan CompleteProfileCard.)
  if (!profile) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/login?next=/account");
    }
    // Login OK, tapi customer_profiles belum ada / phone kosong → tampil
    // form "Lengkapi profil". Object minimal { email, user_id } untuk hydration.
    const partialProfile = {
      user_id: user.id,
      email: user.email ?? null,
      full_name: "",
      phone: "",
      instagram: null,
      date_of_birth: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return (
      <CustomerAuthProvider initialProfile={null}>
        <SiteHeader storeName={settings?.store_name ?? "Rumakomugi"} logoUrl={settings?.logo_url ?? null} brandLine={settings?.brand_line ?? ""} />
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
            <Link href="/order" className="btn-primary shrink-0">
              {dicts.account.newOrder}
            </Link>
          </div>
          <CompleteProfileCard
            user={user}
            dict={dicts.account.profile}
          />
        </main>
        <SiteFooter settings={settings} />
      </CustomerAuthProvider>
    );
  }

  const vouchers = await getMyVouchersAction();

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

        <div className="space-y-8">
          <AccountClient
            initialProfile={profile}
            initialOrders={orders}
            dict={dicts.account}
          />

          <VouchersSection vouchers={vouchers} />

          <ContactSection
            settings={settings ?? null}
            dict={dicts.account.contact}
          />
        </div>
      </main>
      <SiteFooter settings={settings} />
    </CustomerAuthProvider>
  );
}