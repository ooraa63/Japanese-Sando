import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, HelpCircle, MessageCircle, Sparkles, UserCircle } from "lucide-react";
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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [profile, orders, dicts, settings] = await Promise.all([
    getCustomerProfile(),
    getCustomerOrders(),
    getI18nDict(),
    getSettings(),
  ]);

  const storeName = settings?.store_name ?? "Rumakomugi";
  const logoUrl = settings?.logo_url ?? null;
  const brandLine = settings?.brand_line ?? "";

  // =====================================================================
  // Belum login sama sekali? Lempar ke /login.
  // Kalau user SUDAH login tapi customer_profiles belum ada, JANGAN
  // redirect ke /login — /login akan lihat user masih login → redirect
  // balik ke /account → infinite loop (ERR_TOO_MANY_REDIRECTS, halaman
  // blank). Sebagai gantinya, render CompleteProfileCard di bawah.
  // =====================================================================
  if (!user) {
    redirect("/login?next=/account");
  }

  if (!profile) {
    // Coba bootstrap dari user_metadata (best-effort). RPC ini bisa raise
    // kalau metadata kurang field wajib — kita tangkap dan tetap render
    // CompleteProfileCard supaya user bisa lengkapi via form.
    let bootstrapped = false;
    try {
      await supabase.rpc("customer_bootstrap_from_metadata");
      bootstrapped = true;
    } catch (e) {
      console.warn("customer_bootstrap_from_metadata gagal di /account:", e);
    }

    // Re-fetch profile kalau bootstrap jalan.
    let resolvedProfile = profile;
    if (bootstrapped) {
      const { data } = await supabase.rpc("customer_profile");
      resolvedProfile = (data as typeof profile) ?? null;
    }

    if (!resolvedProfile) {
      // User login tapi profil tetap tidak ada / gagal dibuat. Jangan
      // redirect ke /login — biar user bisa lengkapi atau sign out.
      return (
        <CustomerAuthProvider initialProfile={null}>
          <SiteHeader
            storeName={storeName}
            logoUrl={logoUrl}
            brandLine={brandLine}
          />
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
                <p className="mt-2 text-sm text-cocoa-500">
                  {dicts.account.subtitle}
                </p>
              </div>
              <Link href="/order" className="btn-primary shrink-0">
                {dicts.account.newOrder}
              </Link>
            </div>
            <CompleteProfileCard
              user={user}
              dict={dicts.account.profile}
              signOutLabel={dicts.account.signOut}
            />
          </main>
          <SiteFooter settings={settings} />
        </CustomerAuthProvider>
      );
    }

    // Bootstrap berhasil → pakai profile baru.
    return renderAccount({
      profile: resolvedProfile,
      orders,
      dicts,
      settings,
      storeName,
      logoUrl,
      brandLine,
    });
  }

  const vouchers = await getMyVouchersAction();

  return renderAccount({
    profile,
    orders,
    dicts,
    settings,
    storeName,
    logoUrl,
    brandLine,
    vouchers,
  });
}

type RenderAccountArgs = {
  profile: NonNullable<Awaited<ReturnType<typeof getCustomerProfile>>>;
  orders: Awaited<ReturnType<typeof getCustomerOrders>>;
  dicts: Awaited<ReturnType<typeof getI18nDict>>;
  settings: Awaited<ReturnType<typeof getSettings>>;
  storeName: string;
  logoUrl: string | null;
  brandLine: string;
  vouchers?: Awaited<ReturnType<typeof getMyVouchersAction>>;
};

function renderAccount({
  profile,
  orders,
  dicts,
  settings,
  storeName,
  logoUrl,
  brandLine,
  vouchers,
}: RenderAccountArgs) {
  return (
    <CustomerAuthProvider initialProfile={profile}>
      <SiteHeader
        storeName={storeName}
        logoUrl={logoUrl}
        brandLine={brandLine}
      />
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
            <p className="mt-2 text-sm text-cocoa-500">
              {dicts.account.subtitle}
            </p>
          </div>
          <Link href="/order" className="btn-primary shrink-0">
            {dicts.account.newOrder}
          </Link>
        </div>

        <div className="space-y-8">
          <AccountClient
            initialProfile={profile}
            initialOrders={orders}
            dict={dicts.account}
          />

          {vouchers ? <VouchersSection vouchers={vouchers} /> : null}

          {/* Menu singkat ala aplikasi: FAQ / Kontak / Brand Story. Detailnya
              ada di halaman /contact supaya /account tetap ringkas. */}
          <section id="profile" className="card scroll-mt-20 overflow-hidden p-0">
            <h2 className="px-6 pt-6 pb-1 text-lg font-bold text-cocoa-900">
              {dicts.account.contact.helpTitle}
            </h2>
            <ul className="divide-y divide-cocoa-100">
              {[
                {
                  href: "/contact#faq",
                  icon: HelpCircle,
                  label: dicts.contactPage.faqTitle,
                  hint: dicts.contactPage.faqSubtitle,
                },
                {
                  href: "/contact",
                  icon: MessageCircle,
                  label: dicts.contactPage.contactTitle,
                  hint: dicts.contactPage.contactSubtitle,
                },
                {
                  href: "/contact#story",
                  icon: Sparkles,
                  label: dicts.contactPage.storyTitle,
                  hint: settings?.brand_line ?? dicts.contactPage.subtitle,
                },
              ].map((row) => (
                <li key={row.href}>
                  <Link
                    href={row.href}
                    className="flex items-center gap-3 px-6 py-4 transition hover:bg-cream-100"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
                      <row.icon className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-cocoa-900">
                        {row.label}
                      </span>
                      <span className="block truncate text-xs text-cocoa-500">
                        {row.hint}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-cocoa-300" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

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