import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, MessageCircle } from "lucide-react";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { getSettings } from "@/lib/data";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { waLink } from "@/lib/utils";
import { DEFAULT_STORE_NAME } from "@/lib/brand";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return { title: dicts.hoursPage.title, description: dicts.hoursPage.subtitle };
}

/**
 * Halaman Jam Buka.
 *
 * Bar menu Profil "Jam Buka" diarahkan ke sini lewat kolom
 * `profile_menu_items.href` (lihat migration-47). Sebelumnya bar itu membuka
 * popup yang isinya kosong.
 *
 * SUMBER TUNGGAL: `store_settings.hours_id` / `hours_en`, sama persis yang
 * dipakai footer, /contact, /order, dan /account. Tidak ada tabel baru untuk
 * halaman ini, dan tidak ada teks yang ditulis di kode — kalau jam buka diubah
 * dari Admin > Pengaturan, semua tempat ikut berubah dan tidak mungkin berbeda
 * isi satu sama lain.
 *
 * Kolomnya masih kosong di database saat halaman ini dibuat, jadi yang tampil
 * adalah empty state plus ajakan tanya lewat WhatsApp. Isi jam buka yang
 * sebenarnya harus diisi lewat dashboard, bukan dikarang di sini.
 */
export default async function HoursPage() {
  const [settings, dicts, lang] = await Promise.all([
    getSettings(),
    getI18nDict(),
    getLang(),
  ]);
  const hp = dicts.hoursPage;
  const hours = (lang === "en" ? settings?.hours_en : settings?.hours_id)?.trim() ?? "";
  const wa = settings?.whatsapp?.trim() ?? "";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
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
          {hp.back}
        </Link>

        <h1 className="font-display mt-3 text-2xl font-extrabold text-cocoa-900">
          {hp.title}
        </h1>
        <p className="mt-1 text-sm text-cocoa-500">{hp.subtitle}</p>

        {hours ? (
          <div className="mt-6 rounded-2xl border border-cocoa-200 bg-cream-50 p-5">
            <p className="text-sm font-bold text-cocoa-800">{hours}</p>
            {wa ? (
              <a
                href={waLink(wa)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-4 !py-2 !text-[13px]"
              >
                <MessageCircle className="size-4" />
                {hp.chat}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
              <Clock className="size-5" />
            </span>
            <p className="mt-3 text-sm font-bold text-cocoa-700">{hp.empty}</p>
            <p className="mt-1 text-xs text-cocoa-500">{hp.emptyHint}</p>
            {wa ? (
              <a
                href={waLink(wa)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary mt-4 !py-2 !text-[13px]"
              >
                <MessageCircle className="size-4" />
                {hp.chat}
              </a>
            ) : null}
          </div>
        )}
      </main>

      <SiteFooter settings={settings} />
    </div>
  );
}