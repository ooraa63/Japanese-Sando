import { Suspense } from "react";
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

export default async function TrackPage() {
  const [settings, dicts] = await Promise.all([getSettings(), getI18nDict()]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
            <PackageSearch className="size-6" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-cocoa-900">{dicts.track.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-[15px] text-cocoa-500">
            {dicts.track.subtitle}
          </p>
        </div>

        <Suspense fallback={<div className="card h-96 animate-pulse bg-cocoa-100/50" />}>
          <TrackForm settings={settings} />
        </Suspense>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
