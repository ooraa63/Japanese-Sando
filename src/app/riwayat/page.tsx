import type { Metadata } from "next";
import { getI18nDict } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { HistoryList } from "@/components/customer/HistoryList";
import { OrderHubTabs } from "@/components/customer/OrderHubTabs";
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
 * Isinya dibaca dari localStorage perangkat pembeli, bukan dari database —
 * jadi beda HP beda riwayat, sesuai permintaan Steven. Bisa juga dibuka
 * langsung dari halaman sukses pesanan lewat tautan "Lihat pesanan".
 *
 * Bar tab "Cek Pesanan | Riwayat" di atas dibuat sama persis dengan yang di
 * /track, supaya dari halaman ini pembeli bisa balik ke lacak pesanan tanpa
 * harus lewat bottom nav dulu.
 */
export default async function RiwayatPage() {
  const [settings] = await Promise.all([getSettings()]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main className="flex-1 px-4 pt-4 pb-16 sm:px-6">
        <OrderHubTabs />
        <div className="pt-6">
          <HistoryList />
        </div>
      </main>

      <SiteFooter settings={settings} />
    </div>
  );
}