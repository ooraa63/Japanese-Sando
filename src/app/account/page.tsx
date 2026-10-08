import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Clock, HelpCircle, MapPin, Sparkles, UserCircle } from "lucide-react";
import { getI18nDict } from "@/lib/i18n-server";
import { getCustomerOrders, getCustomerProfile, getSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { CustomerAuthProvider } from "@/components/customer/CustomerAuthProvider";
import { AccountClient } from "./AccountClient";
import { VouchersSection } from "@/components/customer/VouchersSection";
import { ContactDetails, ContactSection } from "@/components/customer/ContactSection";
import { ContactMenuRow } from "@/components/customer/ContactMenuRow";
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
          {/* Menu bantuan ala aplikasi (referensi tampilan Profile di aplikasi):
              diletakkan DI ATAS form profil supaya yang pertama dilihat
              pengguna HP adalah pintasan, bukan form panjang. */}
          <section id="profile" className="scroll-mt-20 space-y-6">
            <HelpMenuGroup
              title={dicts.account.contact.helpGeneral}
              rows={[
                {
                  href: "/contact#faq",
                  icon: HelpCircle,
                  label: dicts.contactPage.faqTitle,
                  hint: dicts.contactPage.faqSubtitle,
                },
              ]}
              popupRow={
                <ContactMenuRow
                  label={dicts.contactPage.contactTitle}
                  hint={dicts.contactPage.contactSubtitle}
                  title={dicts.account.contact.title}
                  subtitle={dicts.account.contact.subtitle}
                >
                  <ContactDetails settings={settings ?? null} dict={dicts.account.contact} />
                </ContactMenuRow>
              }
            />
            <HelpMenuGroup
              title={dicts.account.contact.helpAboutUs}
              rows={[
                {
                  href: "/contact#story",
                  icon: Sparkles,
                  label: dicts.contactPage.storyTitle,
                  hint: settings?.brand_line ?? dicts.contactPage.subtitle,
                },
                {
                  href: "/contact#contact",
                  icon: MapPin,
                  label: dicts.contact.mapTitle,
                  hint: settings?.address ?? dicts.contactPage.contactSubtitle,
                },
                {
                  href: "/contact#faq",
                  icon: Clock,
                  label: dicts.contact.hours,
                  hint: settings?.hours_id ?? "-",
                },
              ]}
            />
          </section>

          <AccountClient
            initialProfile={profile}
            initialOrders={orders}
            dict={dicts.account}
          />

          {vouchers ? <VouchersSection vouchers={vouchers} /> : null}

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

/**
 * Satu grup menu bantuan: judul seksi kecil + daftar baris (ikon, label,
 * hint, chevron). Dipakai untuk meniru daftar "General" / "About Us" di
 * halaman Profile aplikasi.
 */
function HelpMenuGroup({
  title,
  rows,
  popupRow,
}: {
  title: string;
  rows: {
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    hint: string;
  }[];
  /** Baris tambahan (node `<li>`) yang dirender sebagai popup, bukan link. */
  popupRow?: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-[11px] font-bold tracking-[0.18em] text-cocoa-400 uppercase">
        {title}
      </h2>
      <ul className="card divide-y divide-cocoa-100 overflow-hidden p-0">
        {rows.map((row) => (
          <li key={`${row.href}-${row.label}`}>
            <Link
              href={row.href}
              className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-cream-100 sm:px-5"
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
        {popupRow}
      </ul>
    </div>
  );
}