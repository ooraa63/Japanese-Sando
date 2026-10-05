import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getI18nDict } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { CustomerAuthForm } from "./CustomerAuthForm";
import { getSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Sign in", robots: { index: false, follow: false } };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sudah login? Langsung ke tujuan / halaman akun.
  if (user) {
    const { redirect } = await import("next/navigation");
    redirect(next && next.startsWith("/") ? next : "/account");
  }

  const [dicts, settings] = await Promise.all([
    getI18nDict(),
    getSettings(),
  ]);

  const storeName = settings?.store_name ?? "Rumakomugi";
  const logoUrl = settings?.logo_url ?? null;
  const brandLine = settings?.brand_line ?? "";

  return (
    <>
      <SiteHeader storeName={storeName} logoUrl={logoUrl} brandLine={brandLine} />
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6 sm:py-16">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-cocoa-800 text-cream-50">
              <span className="font-display text-base font-bold">日</span>
            </span>
            <span className="font-display text-base font-bold text-cocoa-900">
              Japanese Sando
            </span>
          </Link>
          <LanguageToggle />
        </div>

        <CustomerAuthForm mode="login" nextPath={next} dict={dicts.customerAuth} />

        <p className="mt-6 text-center text-sm text-cocoa-500">
          {dicts.customerAuth.login.haveNoAccount}{" "}
          <Link
            href="/register"
            className="font-bold text-matcha-700 underline-offset-2 hover:underline"
          >
            {dicts.customerAuth.login.registerLink}
          </Link>
        </p>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-cocoa-400">
          {dicts.customerAuth.login.guestHint}{" "}
          <Link href="/order" className="font-bold text-cocoa-500 hover:text-cocoa-700">
            {dicts.customerAuth.login.guestLink}
          </Link>
        </p>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}