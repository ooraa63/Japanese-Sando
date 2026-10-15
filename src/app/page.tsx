import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import { getPublicMenu, getSettings, getCustomerProfile } from "@/lib/data";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { MenuBrowser } from "@/components/customer/MenuBrowser";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { ShopInfo } from "@/components/customer/ShopInfo";
import { AppHome } from "@/components/customer/AppHome";
import { waLink } from "@/lib/utils";
import { OrderNowLink } from "@/components/customer/OrderNowLink";
import { ReviewsSection } from "@/components/customer/ReviewsSection";
import { QuickAddProvider } from "@/components/customer/QuickAdd";
import { DEFAULT_STORE_NAME } from "@/lib/brand";
import { parseReviewSort } from "@/lib/reviews";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const store = settings?.store_name || DEFAULT_STORE_NAME;
  const desc =
    settings?.description_id ||
    "Japanese sando dibuat fresh khusus pre-order. Pilih rasa favoritmu, bayar transfer atau cash on delivery.";

  return {
    title: `${store} — Pre-order Sando Sandwich`,
    description: desc,
    alternates: { canonical: "/" },
  };
}

/**
 * Migration-58: `?sort=` untuk urutan ulasan.
 *
 * Halaman tetap server-rendered supaya daftar ulasan terindeks mesin pencari.
 * Nilainya divalidasi lewat `parseReviewSort`, jadi `/?sort=ngawur` tidak
 * membuat error — dia jatuh ke `newest`.
 *
 * `searchParams` membuat halaman ini dinamis; itu memang wajar karena
 * homepage sudah mengambil menu, pengaturan, dan profil dari database.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [settings, menu, lang, profile, sp] = await Promise.all([
    getSettings(),
    getPublicMenu(),
    getLang(),
    // Null kalau belum login — beranda tetap jalan untuk pengunjung.
    getCustomerProfile().catch(() => null),
    searchParams,
  ]);
  const reviewSort = parseReviewSort(
    Array.isArray(sp.sort) ? sp.sort[0] : sp.sort
  );
  const categories = menu.categories;
  const bundles = menu.bundles;
  const dicts = await getI18nDict();

  const open = settings?.is_preorder_open ?? true;

  // Foto hero. `hero_image_url` selalu jadi slide pertama supaya banner
  // tidak pernah kosong; sisanya carousel opsional.
  const heroImages = [
    settings?.hero_image_url,
    ...(settings?.hero_carousel_urls ?? []),
  ].filter((u): u is string => Boolean(u));

  return (
    /* Steven 14-10-2026: mengetuk kartu makanan di beranda (Menu Baru,
       Paket Hemat, Favorite, dan grid Menu) membuka popup tambah ke
       keranjang. Provider-nya dipasang di sini, membungkus SELURUH isi
       beranda, supaya `AppHome` maupun `MenuBrowser` bisa memakainya tanpa
       prop yang diteruskan berlapis-lapis.

       `categories` ikut diteruskan karena popup paket (`OrderBundleModal`)
       butuh daftar rasa untuk dipilih pembelinya. */
    <QuickAddProvider categories={categories} whatsapp={settings?.whatsapp}>
      <SiteHeader
        storeName={settings?.store_name ?? DEFAULT_STORE_NAME}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main id="main">
        {/* ===================== BERANDA GAYA APLIKASI (UIUX 4) ===================== */}
        <section className="mx-auto max-w-2xl px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
          <AppHome
            categories={categories}
            bundles={bundles}
            heroImages={heroImages}
            userName={profile?.full_name ?? null}
            ctaSlot={
              <OrderNowLink
                open={open}
                whatsapp={settings?.whatsapp}
                className="inline-flex items-center gap-1.5 rounded-full bg-cream-50 px-5 py-2.5 text-sm font-bold text-cocoa-900 transition hover:bg-honey-300"
                label={dicts.home.heroCta}
                closedLabel={dicts.order.closed.title}
              />
            }
          />
        </section>

        {/* Strip jam buka + batas pre-order */}
        <div className="bg-cream-100 pb-2">
          <ShopInfo settings={settings} variant="static" />
        </div>

        {/* ===================== MENU LENGKAP =====================
            Permintaan Steven (10-10-2026): setelah blok atas beranda ada
            judul besar "Menu", lalu di bawahnya nama kategori ("Sando
            Sandwich") dan kartu rasa-nya.

            Penandaan Favorite TIDAK lagi muncul sebagai badge bintang di
            foto kartu di sini (permintaan Steven 12-10-2026). Produk yang
            ditandai bintang (`flavors.is_featured`) sekarang tampil di
            baris "Favorite" sendiri, tepat di bawah "Paket Hemat", supaya
            tidak ada satu produk yang ditandai dua kali di dua tempat.

            Lebarnya tetap sama dengan `AppHome` (max-w-2xl) supaya baris
            kartu "Menu Baru" / "Paket Hemat" / "Favorite" di atas dan baris
            kartu Menu punya lebar yang sama.

            Bundle / paket hemat sudah dirender di `AppHome`, jadi di sini
            tidak perlu dirender lagi. */}
        <section id="menu" className="mx-auto max-w-2xl scroll-mt-20 px-4 pb-10 sm:px-6 lg:pb-14">
          <h2 className="mb-4 text-2xl font-extrabold text-cocoa-900">
            {dicts.menu.title}
          </h2>
          <MenuBrowser categories={categories} />
        </section>

        {/* ===================== REVIEWS ===================== */}
        <section
          id="reviews"
          className="scroll-mt-20 border-y border-cocoa-200/60 bg-cream-100/40 py-12 lg:py-16"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <ReviewsSection lang={lang} sort={reviewSort} />
          </div>
        </section>

        {/* ===================== CTA PENUTUP ===================== */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
          <div className="relative overflow-hidden rounded-3xl bg-cocoa-900 px-6 py-10 text-center text-cream-50 sm:px-12">
            <div className="absolute inset-0 bg-seigaha" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold text-balance sm:text-4xl">
                {dicts.order.title}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-base text-cream-200/75">
                {dicts.order.subtitle}
              </p>
              <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <OrderNowLink
                  open={open}
                  whatsapp={settings?.whatsapp}
                  className="btn !bg-matcha-500 !px-8 !py-3.5 !text-base text-white shadow-xl hover:!bg-matcha-400"
                  label={dicts.hero.cta}
                  closedLabel={dicts.order.closed.title}
                />
                {settings?.whatsapp ? (
                  <a
                    href={waLink(settings.whatsapp)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn !border-2 !border-cream-50/30 !px-8 !py-3.5 !text-base !text-cream-50 hover:!bg-cream-50/10"
                  >
                    <MessageCircle className="size-4" />
                    {dicts.contact.whatsapp}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter settings={settings} />
    </QuickAddProvider>
  );
}