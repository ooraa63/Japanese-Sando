import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, ShoppingBag } from "lucide-react";
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

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const store = settings?.store_name || "Rumakomugi";
  const desc =
    settings?.description_id ||
    "Japanese sando dibuat fresh khusus pre-order. Pilih rasa favoritmu, bayar transfer atau cash on delivery.";

  return {
    title: `${store} — Pre-order Sando Sandwich`,
    description: desc,
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  const [settings, menu, lang, profile] = await Promise.all([
    getSettings(),
    getPublicMenu(),
    getLang(),
    // Null kalau belum login — beranda tetap jalan untuk pengunjung.
    getCustomerProfile().catch(() => null),
  ]);
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
    <>
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main id="main">
        {/* ===================== BERANDA GAYA APLIKASI (UIUX 4) ===================== */}
        <section className="mx-auto max-w-2xl px-4 pt-4 pb-10 sm:px-6 sm:pt-6">
          <AppHome
            categories={categories}
            heroImages={heroImages}
            userName={profile?.full_name ?? null}
            freeShippingMin={settings?.free_shipping_min ?? 0}
            deadline={settings?.deadline_id || settings?.deadline_en || null}
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

        {/* ===================== MENU LENGKAP ===================== */}
        <section id="menu" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-10 sm:px-6 lg:py-14">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-honey-600 uppercase">
                {dicts.nav.menu}
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
                {dicts.menu.title}
              </h2>
              <p className="mt-2 text-base text-cocoa-500">{dicts.menu.subtitle}</p>
              <p className="mt-1.5 text-[13px] text-cocoa-400">{dicts.menu.readOnlyNote}</p>
            </div>
            {open ? (
              <Link href="/order" className="btn-primary shrink-0">
                <ShoppingBag className="size-4" />
                {dicts.menu.orderNow}
              </Link>
            ) : null}
          </div>

          <div className="mt-10">
            <MenuBrowser
              categories={categories}
              bundles={(bundles as unknown as Array<{
                id: number;
                category_id: number | null;
                slug: string;
                name_id: string;
                name_en: string;
                desc_id: string;
                desc_en: string;
                price: number;
                required_qty: number;
                image_url: string | null;
                is_active: boolean;
                is_featured: boolean;
                sort_order: number;
              }>) ?? []}
            />
          </div>
        </section>

        {/* ===================== REVIEWS ===================== */}
        <section className="border-y border-cocoa-200/60 bg-cream-100/40 py-12 lg:py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <ReviewsSection lang={lang} />
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
    </>
  );
}