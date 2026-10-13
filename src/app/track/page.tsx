import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { TrackForm } from "@/components/customer/TrackForm";
import { OrderHubTabs } from "@/components/customer/OrderHubTabs";
import { DEFAULT_STORE_NAME } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return { title: dicts.track.title, description: dicts.track.subtitle };
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; phone?: string }>;
}) {
  const [settings, dicts, query] = await Promise.all([
    getSettings(),
    getI18nDict(),
    searchParams,
  ]);

  // Halaman sukses menautkan ke /track?code=...&phone=... supaya kode dan
  // nomor telepon sudah terisi otomatis -- pembeli tinggal menekan tombol.
  const initialCode = (query.code ?? "").slice(0, 40);
  const initialPhone = (query.phone ?? "").slice(0, 30);

  return (
    <>
      <SiteHeader
        storeName={settings?.store_name ?? DEFAULT_STORE_NAME}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-12 sm:px-6 sm:pt-6 sm:pb-16">
        {/* Bar tab "Cek Pesanan | Riwayat". Ini tujuan tab "Orderan" di
            bottom nav: pembeli menekan "Orderan" dan langsung mendarat di
            sini, lalu bisa pindah ke Riwayat lewat bar ini. */}
        <OrderHubTabs />

        <div className="mb-8 mt-8 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
            <PackageSearch className="size-6" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-cocoa-900">{dicts.track.title}</h1>
          <p className="mx-auto mt-2 max-w-md text-base text-cocoa-500">
            {dicts.track.subtitle}
          </p>
        </div>

        <TrackForm initialCode={initialCode} initialPhone={initialPhone} />
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
