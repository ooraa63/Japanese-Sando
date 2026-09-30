import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, MessageCircle, ShoppingBag, Sparkles, Timer, Truck, Wallet } from "lucide-react";
import { getActiveFlavors, getSettings } from "@/lib/data";
import { getI18nDict } from "@/lib/i18n-server";
import { FlavorGrid } from "@/components/customer/FlavorGrid";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { AnnouncementBar } from "@/components/customer/AnnouncementBar";
import { formatIDR, waLink } from "@/lib/utils";
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
  const cheapest = flavors.length ? Math.min(...flavors.map((f) => f.price)) : 0;

  return (
    <>
      <AnnouncementBar
        messageId={settings?.announcement_id}
        messageEn={settings?.announcement_en}
        deadlineId={settings?.deadline_id}
        deadlineEn={settings?.deadline_en}
      />
      <SiteHeader />

      <main id="main">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden bg-cocoa-950 text-cream-50">
          <div className="absolute inset-0">
            <Image
              src="/foto-awal.jpeg"
              alt="Aralam Japanese Sando"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-cocoa-950 via-cocoa-950/70 to-cocoa-950/40" />
            <div className="absolute inset-0 bg-seigaha opacity-60" />
          </div>

          <div className="relative mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col justify-center px-4 py-16 sm:px-6 lg:py-24">
            <div className="max-w-xl">
              <p className="chip border border-cream-50/25 bg-cream-50/10 text-cream-100 backdrop-blur-sm">
                <Sparkles className="size-3.5" />
                {dicts.hero.eyebrow}
              </p>

              <h1 className="mt-5 text-4xl leading-[1.08] font-extrabold text-balance sm:text-5xl lg:text-6xl">
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

              {open ? (
                <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-cream-50/15 pt-6">
                  <div>
                    <dt className="text-2xl font-bold tabular text-honey-300">
                      {flavors.length}
                    </dt>
                    <dd className="text-xs font-semibold tracking-wide text-cream-200/60 uppercase">
                      {dicts.hero.stats.flavors}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xl font-bold tabular text-honey-300">
                      {cheapest ? formatIDR(cheapest, "id") : "—"}
                    </dt>
                    <dd className="text-xs font-semibold tracking-wide text-cream-200/60 uppercase">
                      {dicts.common.price}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xl font-bold text-honey-300">COD</dt>
                    <dd className="text-xs font-semibold tracking-wide text-cream-200/60 uppercase">
                      {dicts.hero.stats.cod}
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
          </div>

          <p className="relative mx-auto w-full max-w-6xl px-4 pb-8 text-center font-display text-sm tracking-[0.3em] text-cream-200/40 uppercase sm:px-6">
            {dicts.hero.badge}
          </p>
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
            </div>
            {open ? (
              <Link href="/order" className="btn-primary shrink-0">
                <ShoppingBag className="size-4" />
                {dicts.hero.cta}
              </Link>
            ) : null}
          </div>

          {flavors.length === 0 ? (
            <p className="card mt-10 p-10 text-center text-cocoa-400">{dicts.menu.empty}</p>
          ) : (
            <div className="mt-10">
              <FlavorGrid flavors={flavors} />
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
