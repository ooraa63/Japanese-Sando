import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { getLang } from "@/lib/i18n-server";
import { getI18nDict } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/components/admin/AuthForm";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Seller sign in", robots: { index: false, follow: false } };
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sudah login? Langsung ke dashboard.
  if (user) {
    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (isAdmin) {
      const { redirect } = await import("next/navigation");
      redirect(next && next.startsWith("/admin") ? next : "/admin");
    }
  }

  const [{ data: adminCount }, dicts, lang] = await Promise.all([
    supabase.rpc("public_admin_count"),
    getI18nDict(),
    getLang(),
  ]);

  const needsSetup = (adminCount as number | null) === 0;

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Panel kiri: identitas */}
      <div className="relative hidden overflow-hidden bg-cocoa-950 p-12 text-cream-50 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-seigaha opacity-70" />
        <div className="absolute -right-20 -bottom-20 size-96 rounded-full bg-matcha-500/20 blur-3xl" />

        <div className="relative">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-cream-50 text-cocoa-900">
              <span className="font-display text-lg font-bold">日</span>
            </span>
            <span className="flex flex-col leading-none">
              <span className="font-display text-xl font-bold">Japanese</span>
              <span className="text-[10px] font-bold tracking-[0.22em] text-berry-400 uppercase">
                Sando
              </span>
            </span>
          </Link>
        </div>

        <div className="relative max-w-sm">
          <Store className="size-8 text-honey-300" />
          <h1 className="mt-5 text-3xl leading-tight font-extrabold">{dicts.admin.title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-cream-200/70">
            {dicts.admin.login.subtitle}
          </p>
        </div>

        <p className="relative text-xs text-cream-200/40">
          {lang === "en"
            ? "Manage orders, stock and your shop settings here."
            : "Kelola pesanan, stok, dan pengaturan tokomu di sini."}
        </p>
      </div>

      {/* Panel kanan: form */}
      <div className="flex flex-col justify-center bg-cream-50 px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-6 flex items-center justify-between lg:justify-end">
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <span className="grid size-9 place-items-center rounded-xl bg-cocoa-800 text-cream-50">
                <span className="font-display text-base font-bold">日</span>
              </span>
              <span className="font-display text-base font-bold text-cocoa-900">
                Japanese Sando
              </span>
            </Link>
            <LanguageToggle />
          </div>

          <AuthForm mode={needsSetup ? "setup" : "login"} nextPath={next} />

          <Link
            href="/"
            className="mt-6 block text-center text-sm font-semibold text-cocoa-400 transition hover:text-cocoa-700"
          >
            ← {dicts.success.home}
          </Link>
        </div>
      </div>
    </main>
  );
}
