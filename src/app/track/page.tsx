import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { TrackForm } from "@/components/customer/TrackForm";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return { title: dicts.track.title, description: dicts.track.subtitle };
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const [settings, dicts, query] = await Promise.all([
    getSettings(),
    getI18nDict(),
    searchParams,
  ]);

  // Halaman sukses menautkan ke /track?code=... supaya kode pesanan
  // sudah terisi otomatis.
  const initialCode = (query.code ?? "").slice(0, 40);

  return (
    <>
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
            <PackageSearch className="size-6" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-cocoa-900">{dicts.track.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-base text-cocoa-500">
            {dicts.track.subtitle}
          </p>
        </div>

        <TrackForm settings={settings} initialCode={initialCode} />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
