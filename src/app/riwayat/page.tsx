import type { Metadata } from "next";
import { getI18nDict } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { HistoryBack, HistoryList } from "@/components/customer/HistoryList";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return {
    title: dicts.historyPage.title,
    description: dicts.historyPage.subtitle,
    // Halaman ini personal (isi localStorage per perangkat), jangan masuk
    // indeks mesin pencari.
    robots: { index: false, follow: false },
  };
}

/**
 * Halaman riwayat pesanan.
 *
 * Bar quick-action di atas bottom nav ("Riwayat") mengarah ke sini. Isinya
 * dibaca dari localStorage perangkat pembeli, bukan dari database — jadi beda
 * HP beda riwayat, sesuai permintaan Steven.
 */
export default async function RiwayatPage() {
  const [settings] = await Promise.all([getSettings()]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main className="flex-1 px-4 pt-5 pb-16">
        <HistoryBack />
        <HistoryList />
      </main>

      <SiteFooter settings={settings} />
    </div>
  );
}