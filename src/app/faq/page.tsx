import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { FAQ } from "@/lib/faq";
import { FaqList } from "@/components/customer/FaqList";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return { title: dicts.faqPage.title, description: dicts.faqPage.subtitle };
}

/**
 * Halaman FAQ penuh.
 *
 * Bar menu Profil "FAQ" diarahkan ke sini lewat kolom
 * `profile_menu_items.href` (lihat migration-45). Before-nya bar itu hanya
 * membuka popup statis; sekarang pembeli mendapat halaman yang bisa dicari dan
 * dibaca per pertanyaan.
 *
 * Isi diambil dari `src/lib/faq.ts` yang sama dengan section FAQ di
 * `/contact`, jadi keduanya tidak pernah berbeda isi.
 */
export default async function FaqPage() {
  const [settings, dicts, lang] = await Promise.all([
    getSettings(),
    getI18nDict(),
    getLang(),
  ]);
  const fp = dicts.faqPage;

  const entries = FAQ.map((f) => ({ q: f.q[lang], a: f.a[lang] }));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main className="flex-1 px-4 pt-5 pb-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-cocoa-500 transition hover:text-cocoa-900"
        >
          <ArrowLeft className="size-4" />
          {fp.back}
        </Link>

        <h1 className="font-display mt-3 text-2xl font-extrabold text-cocoa-900">
          {fp.title}
        </h1>
        <p className="mt-1 text-sm text-cocoa-500">{fp.subtitle}</p>

        <div className="mt-5">
          <FaqList
            items={entries}
            searchPlaceholder={fp.search}
            emptyText={fp.empty}
          />
        </div>
      </main>

      <SiteFooter settings={settings} />
    </div>
  );
}