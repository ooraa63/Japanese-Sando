import Link from "next/link";
import { CheckCircle2, Home, MessageCircle, Search, ShoppingBag } from "lucide-react";
import { getSettings } from "@/lib/data";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { waLink } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const [settings, dicts, lang] = await Promise.all([
    getSettings(),
    getI18nDict(),
    getLang(),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="card overflow-hidden">
          <div className="relative bg-matcha-500 px-6 py-10 text-center text-white">
            <div className="absolute inset-0 bg-seigaha opacity-40" />
            <div className="relative">
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
                <CheckCircle2 className="size-9" />
              </span>
              <h1 className="mt-5 text-2xl font-extrabold sm:text-3xl">{dicts.success.title}</h1>
              <p className="mt-2 text-sm text-white/85">{dicts.success.subtitle}</p>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-10">
            <div className="rounded-2xl border-2 border-dashed border-cocoa-200 bg-cocoa-50 px-5 py-6 text-center">
              <p className="text-[11px] font-bold tracking-[0.18em] text-cocoa-400 uppercase">
                {dicts.success.codeLabel}
              </p>
              <p className="mt-1.5 font-display text-3xl font-extrabold tracking-wide text-cocoa-900 sm:text-4xl">
                {code}
              </p>
              <p className="mt-3 text-xs text-cocoa-500">{dicts.success.saveCode}</p>
            </div>

            <h2 className="mt-8 text-base font-bold text-cocoa-800">{dicts.success.nextTitle}</h2>
            <ol className="mt-3 space-y-2.5">
              {dicts.success.next.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-sm text-cocoa-600">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[11px] font-bold text-cream-50">
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>

            <div className="mt-8 space-y-3">
              {settings?.whatsapp ? (
                <a
                  href={waLink(
                    settings.whatsapp,
                    lang === "en"
                      ? `Hi, I just pre-ordered. My order code is ${code}.`
                      : `Halo, saya baru saja pre-order. Kode pesanan saya ${code}.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-matcha w-full"
                >
                  <MessageCircle className="size-4" />
                  {dicts.success.waTitle}
                </a>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <Link href={`/track?code=${encodeURIComponent(code)}`} className="btn-outline">
                  <Search className="size-4" />
                  {dicts.success.trackTitle}
                </Link>
                <Link href="/order" className="btn-ghost">
                  <ShoppingBag className="size-4" />
                  {dicts.success.orderAgain}
                </Link>
              </div>

              <Link href="/" className="btn-ghost w-full">
                <Home className="size-4" />
                {dicts.success.home}
              </Link>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter settings={settings} />
    </>
  );
}
