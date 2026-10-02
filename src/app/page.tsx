import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  MessageCircle,
  ShoppingBag,
  Sparkles,
  Timer,
  Truck,
  Wallet,
} from "lucide-react";
import { getActiveFlavors, getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { FlavorGrid } from "@/components/customer/FlavorGrid";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { AnnouncementBar } from "@/components/customer/AnnouncementBar";
import { waLink } from "@/lib/utils";
import { OrderNowLink } from "@/components/customer/OrderNowLink";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettings();
  const desc =
    settings?.description_id ||
    "Japanese sando dibuat fresh khusus pre-order. Pilih rasa favoritmu, bayar transfer atau cash on delivery.";

  return {
    title: settings?.store_name
      ? `${settings.store_name} — Pre-order Sando Sandwich`
      : "Japanese Sando — Pre-order Sando Sandwich",
    description: desc,
    alternates: { canonical: "/" },
  };
}

export default async function HomePage() {
  const [settings, flavors] = await Promise.all([getSettings(), getActiveFlavors()]);
  const dicts = await getI18nDict();

  const open = settings?.is_preorder_open ?? true;

  return (
    <>
      <AnnouncementBar
        messageId={settings?.announcement_id}
        messageEn={settings?.announcement_en}
        deadlineId={settings?.deadline_id}
        deadlineEn={settings?.deadline_en}
      />
      <SiteHeader storeName={settings?.store_name ?? "Rumakomugi"} />

      <main id="main">
        {/* ===================== HERO =====================
            Foto dipakai sebagai background full-bleed seperti semula.
            Foto ini vertikal (2:3) dengan area gelap di bagian atas, jadi
            titik fokusnya di tengah-bawah — teks diletakkan di area atas
            yang sudah gelap, dan overlay gradien menjaga keterbacaan. */}
        <section className="relative overflow-hidden bg-cocoa-950 text-cream-50">
          <div className="absolute inset-0">
            <Image
              src={settings?.hero_image_url || "/hero-sando.jpg"}
              alt="Aralam Japanese Sando"
              fill
              priority
              sizes="100vw"
              className="object-cover object-[center_60%]"
            />
            {/* Foto khusus mobile, dipakai hanya di layar kecil */}
            {settings?.hero_image_mobile_url ? (
              <div className="absolute inset-0 md:hidden">
                <Image
                  src={settings.hero_image_mobile_url}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  className="object-cover"
                />
              </div>
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-b from-cocoa-950/85 via-cocoa-950/55 to-cocoa-950/90" />
            <div className="absolute inset-0 bg-gradient-to-r from-cocoa-950/90 via-cocoa-950/40 to-transparent" />
            <div className="absolute inset-0 bg-seigaha opacity-30" />
          </div>

          <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:py-24">
            <div className="max-w-xl">
              <p className="chip border border-cream-50/25 bg-cream-50/10 text-cream-100 backdrop-blur-sm">
                <Sparkles className="size-3.5" />
                {dicts.hero.eyebrow}
              </p>

              <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold text-balance sm:text-5xl lg:text-[3.4rem]">
                {dicts.hero.title}
              </h1>

              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-cream-200/85 sm:text-base">
                {dicts.hero.subtitle}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <OrderNowLink
                  open={open}
                  whatsapp={settings?.whatsapp}
                  className="btn !bg-matcha-500 !px-7 !py-3.5 !text-base text-white shadow-xl shadow-matcha-900/30 hover:!bg-matcha-400"
                  label={dicts.hero.cta}
                  closedLabel={dicts.order.closed.title}
                />
                <a
                  href="#menu"
                  className="btn !border-2 !border-cream-50/40 !px-7 !py-3.5 !text-base text-cream-50 backdrop-blur-sm hover:!bg-cream-50 hover:!text-cocoa-900"
                >
                  {dicts.hero.ctaSecondary}
                  <ArrowRight className="size-4" />
                </a>
              </div>

              <p className="mt-10 font-display text-xs tracking-[0.3em] text-cream-200/35 uppercase sm:text-sm">
                {dicts.hero.badge}
              </p>
            </div>
          </div>
        </section>

        {/* ===================== MENU ===================== */}
        <section id="menu" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 lg:py-24">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.2em] text-berry-500 uppercase">
                {dicts.nav.menu}
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
                {dicts.menu.title}
              </h2>
              <p className="mt-2 text-[15px] text-cocoa-500">{dicts.menu.subtitle}</p>
              <p className="mt-1.5 text-[13px] text-cocoa-400">{dicts.menu.readOnlyNote}</p>
            </div>
            {open ? (
              <Link href="/order?step=menu" className="btn-primary shrink-0">
                <ShoppingBag className="size-4" />
                {dicts.menu.orderNow}
              </Link>
            ) : null}
          </div>

          {flavors.length === 0 ? (
            <p className="card mt-10 p-10 text-center text-cocoa-400">{dicts.menu.empty}</p>
          ) : (
            <div className="mt-10">
              <FlavorGrid
                flavors={flavors}
                remainingStock={settings?.stock_enabled ? settings.total_stock : null}
              />
            </div>
          )}
        </section>

        {/* ===================== CARA PESAN ===================== */}
        <section
          id="how"
          className="scroll-mt-20 border-y border-cocoa-200/60 bg-cream-100/70 py-16 lg:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.2em] text-berry-500 uppercase">
                {dicts.nav.howItWorks}
              </p>
              <h2 className="mt-2 text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
                {dicts.howItWorks.title}
              </h2>
              <p className="mt-2 text-[15px] text-cocoa-500">{dicts.howItWorks.subtitle}</p>
            </div>

            <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {dicts.howItWorks.steps.map((step, i) => {
                const icons = [Wallet, ShoppingBag, Timer, Truck];
                const Icon = icons[i] ?? Sparkles;
                return (
                  <li key={step.title} className="relative">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cocoa-800 text-cream-50 shadow-lg shadow-cocoa-900/15">
                        <Icon className="size-5" />
                      </span>
                      <span className="font-display text-4xl font-bold text-cocoa-200 select-none">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mt-4 text-base font-bold text-cocoa-900">{step.title}</h3>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-cocoa-500">
                      {step.desc}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ===================== CTA PENUTUP ===================== */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="relative overflow-hidden rounded-3xl bg-cocoa-900 px-6 py-14 text-center text-cream-50 sm:px-12">
            <div className="absolute inset-0 bg-seigaha" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold text-balance sm:text-4xl">
                {dicts.order.title}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-[15px] text-cream-200/75">
                {dicts.order.subtitle}
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
