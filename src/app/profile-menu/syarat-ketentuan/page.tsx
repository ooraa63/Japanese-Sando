import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { getSettings, getTerms } from "@/lib/data";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { waLink } from "@/lib/utils";
import { DEFAULT_STORE_NAME } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return { title: dicts.termsPage.title, description: dicts.termsPage.subtitle };
}

/**
 * Halaman Syarat & Ketentuan penuh.
 *
 * Bar menu Profil "Syarat & Ketentuan" diarahkan ke sini lewat kolom
 * `profile_menu_items.href` (lihat migration-47). Sebelum itu bar itu hanya
 * membuka popup yang isinya satu kalimat; sekarang pembeli mendapat halaman
 * utuh yang bisa dibaca.
 *
 * Isi diambil dari tabel `terms_sections` lewat RPC `public_terms`, jadi
 * penjual bisa menambah / mengubah / menyembunyikan bagian dari dashboard
 * (Admin > Syarat & Ketentuan) tanpa perlu deploy.
 *
 * Kalau tabelnya kosong — misalnya RPC gagal — halaman menampilkan empty state
 * plus ajakan tanya lewat WhatsApp. Tidak ada teks cadangan di kode, supaya
 * tidak pernah ada dua sumber yang bisa berbeda isi.
 */
export default async function TermsPage() {
  const [settings, dicts, lang, terms] = await Promise.all([
    getSettings(),
    getI18nDict(),
    getLang(),
    getTerms(),
  ]);
  const tp = dicts.termsPage;
  const wa = settings?.whatsapp?.trim() ?? "";

  // Wrapper `max-w-3xl` hanya membungkus header + main. Footer diletakkan di
  // luar wrapper supaya blok coklatnya full width, sama seperti di / dan
  // /contact — kalau ikut ter-bungkus, footer jadi kotak sempit di tengah.
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        <SiteHeader
          storeName={settings?.store_name ?? DEFAULT_STORE_NAME}
          logoUrl={settings?.logo_url ?? null}
          brandLine={settings?.brand_line ?? ""}
        />

        <main className="flex-1 px-4 pt-5 pb-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-bold text-cocoa-500 transition hover:text-cocoa-900"
        >
          <ArrowLeft className="size-4" />
          {tp.back}
        </Link>

        <h1 className="font-display mt-3 text-2xl font-extrabold text-cocoa-900">
          {tp.title}
        </h1>
        <p className="mt-1 text-sm text-cocoa-500">{tp.subtitle}</p>

        {terms.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center">
            <p className="text-sm font-bold text-cocoa-700">{tp.empty}</p>
            <p className="mt-1 text-xs text-cocoa-500">{tp.emptyHint}</p>
            {wa ? (
              <a
                href={waLink(wa)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-4 !py-2 !text-[13px]"
              >
                <MessageCircle className="size-4" />
                {tp.chat}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {terms.map((section) => {
              const title =
                lang === "en"
                  ? section.title_en || section.title_id
                  : section.title_id;
              const body = lang === "en" ? section.body_en || section.body_id : section.body_id;
              return (
                <section key={section.id}>
                  <h2 className="font-display text-base font-bold text-cocoa-900">
                    {title}
                  </h2>
                  {body ? (
                    <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-cocoa-600">
                      {body}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </main>
      </div>

      <SiteFooter settings={settings} />
    </div>
  );
}