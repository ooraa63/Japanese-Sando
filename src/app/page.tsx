import type { Metadata } from "next";
import Link from "next/link";
import {
  MessageCircle,
  ShoppingBag,
} from "lucide-react";
import { getPublicMenu, getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { MenuBrowser } from "@/components/customer/MenuBrowser";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { ShopInfo } from "@/components/customer/ShopInfo";
import { HomeHero } from "@/components/customer/HomeHero";
import { CategoryBand } from "@/components/customer/CategoryBand";
import { FeaturedStrip } from "@/components/customer/FeaturedStrip";
import { BestSellers } from "@/components/customer/BestSellers";
import { waLink } from "@/lib/utils";
import { OrderNowLink } from "@/components/customer/OrderNowLink";
import { ReviewsSection } from "@/components/customer/ReviewsSection";
import { getLang } from "@/lib/i18n-server";

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
  const [settings, menu, lang] = await Promise.all([
    getSettings(),
    getPublicMenu(),
    getLang(),
  ]);
  const categories = menu.categories;
  const bundles = menu.bundles;
  const dicts = await getI18nDict();

  const open = settings?.is_preorder_open ?? true;

  // Rasa unggulan untuk strip 4 kolom + panel tengah CategoryBand.
  // Prioritas: rasa bertanda `is_featured`, lalu pakai foto yang ada supaya
  // kartu tidak pernah kosong. Kalau tidak ada featured, ambil 4 rasa pertama.
  const allFlavors = categories.flatMap((c) => c.flavors ?? []);
  const featuredFlavors = (() => {
    const withPhoto = allFlavors.filter((f) => f.image_url);
    const featured = allFlavors.filter((f) => f.is_featured);
    const merged = [...featured, ...withPhoto].filter(
      (f, i, arr) => arr.findIndex((x) => x.id === f.id) === i
    );
    return merged.slice(0, 4);
  })();

  // Foto untuk hero split. `hero_image_url` selalu jadi slide pertama supaya
  // panel tengah tidak pernah kosong; sisanya carousel opsional.
  const heroSlides = [
    settings?.hero_image_url,
    ...(settings?.hero_carousel_urls ?? []),
    ...(settings?.hero_mobile_carousel_urls ?? []),
  ].filter((u): u is string => Boolean(u));

  return (
    <>
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main id="main">
        {/* ===================== HERO (layout split ala UIUX 1) ===================== */}
        <HomeHero
          images={heroSlides}
          ctaSlot={
            <OrderNowLink
              open={open}
              whatsapp={settings?.whatsapp}
              className="btn-primary !rounded-full !px-6 !py-3 text-sm"
              label={dicts.hero.cta}
              closedLabel={dicts.order.closed.title}
            />
          }
        />

        {/* Strip jam buka + batas pre-order, tetap ada tapi digeser dari
            hero ke bawah supaya tidak menutupi panel split. */}
        <div className="bg-cream-100 pb-2">
          <ShopInfo settings={settings} variant="static" />
        </div>

        {/* ===================== KATEGORI + CARA PESAN ===================== */}
        <CategoryBand
          categories={categories}
          heroImage={featuredFlavors[0]?.image_url ?? null}
        />

        {/* ===================== PRODUK UNGGULAN ===================== */}
        {featuredFlavors.length > 0 ? (
          <FeaturedStrip flavors={featuredFlavors} />
        ) : null}

        {/* ===================== MENU ===================== */}
        <section id="menu" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6 lg:py-16">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-berry-500 uppercase">
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

        {/* ===================== FAVORIT PELANGGAN ===================== */}
        {allFlavors.length > 0 ? (
          <BestSellers flavors={allFlavors.slice(0, 9)} />
        ) : null}

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
