import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronDown,
  Clock,
  Headphones,
  MapPin,
  MessageCircle,
  Sparkles,
  Timer,
} from "lucide-react";
import { getSettings } from "@/lib/data";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { waLink } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const dicts = await getI18nDict();
  return { title: dicts.contactPage.title, description: dicts.contactPage.subtitle };
}

/** FAQ bilingual hardcoded — isinya stabil, bukan konten yang diubah penjual. */
const FAQ = [
  {
    q: { id: "Bagaimana cara memesan?", en: "How do I place an order?" },
    a: {
      id: "Pilih rasa yang kamu mau di halaman Menu, tekan “Pesan Sekarang”, lalu isi nama dan nomor WhatsApp kamu. Kamu bisa ambil di toko atau diantar, lalu pilih metode pembayaran.",
      en: "Pick the flavors you want on the Menu page, tap “Order now”, then fill in your name and WhatsApp number. Choose pickup or delivery, then pick a payment method.",
    },
  },
  {
    q: { id: "Apakah harus pesan dari jauh-jauh hari?", en: "Do I have to order days in advance?" },
    a: {
      id: "Tidak wajib. Kami tetap menerima pesanan sampai batas pre-order yang tertera di halaman utama. Kalau stok suatu rasa habis, rasanya tidak akan muncul sebagai pilihan.",
      en: "Not necessarily. We keep taking orders until the pre-order deadline shown on the homepage. Once a flavor runs out, it disappears from the menu.",
    },
  },
  {
    q: { id: "Metode pembayaran apa saja yang tersedia?", en: "Which payment methods are available?" },
    a: {
      id: "QRIS (semua e-wallet & mobile banking) dan transfer bank. Kalau kamu pilih transfer, kamu perlu upload bukti transfer supaya pesanan diproses.",
      en: "QRIS (any e-wallet or mobile banking) and bank transfer. For bank transfer you need to upload your payment proof so we can process the order.",
    },
  },
  {
    q: { id: "Kalau QRIS saya sudah scan tapi belum masuk?", en: "What if I scanned the QRIS but it did not go through?" },
    a: {
      id: "Kadang butuh beberapa detik. Halaman pesanan akan otomatis terupdate begitu pembayaran masuk. Kalau lebih dari 5 menit belum terdeteksi, QRIS-nya kadaluarsa dan kamu bisa scan ulang dari halaman pesanan.",
      en: "It can take a few seconds. Your order page updates automatically as soon as the payment lands. If it is not detected after 5 minutes, the QRIS expires and you can request a fresh one from your order page.",
    },
  },
  {
    q: { id: "Apakah bisa diantar ke tempat saya?", en: "Do you deliver to my area?" },
    a: {
      id: "Bisa, untuk area yang tercakup di daftar zona pengiriman. Saat memesan kamu memilih zona, lalu menandai titik lokasi di peta supaya kami tahu persis ke mana harus dikirim.",
      en: "Yes, for areas covered by our delivery zones. While ordering you pick a zone, then drop a pin on the map so we know exactly where to send it.",
    },
  },
  {
    q: { id: "Bisa ganti rasa kalau sudah pesan?", en: "Can I change flavors after ordering?" },
    a: {
      id: "Bisa, selama pesanan belum kami mulai buat. Chat WhatsApp kami secepatnya, dan kami cek dulu ketersediaan stoknya.",
      en: "Yes, as long as we have not started making it. Message us on WhatsApp as early as possible and we will check availability first.",
    },
  },
] as const;

export default async function ContactPage() {
  const [settings, dicts, lang] = await Promise.all([
    getSettings(),
    getI18nDict(),
    getLang(),
  ]);

  const hours = lang === "en" ? settings?.hours_en : settings?.hours_id;
  const deadline = lang === "en" ? settings?.deadline_en : settings?.deadline_id;
  const story = lang === "en" ? settings?.description_en : settings?.description_id;
  const cp = dicts.contactPage;

  return (
    <>
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        {/* Header */}
        <header className="mb-10 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
            <Headphones className="size-6" />
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
            {cp.title}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-base text-cocoa-500">
            {cp.subtitle}
          </p>
        </header>

        {/* ================= KONTAK ================= */}
        <section
          id="contact"
          className="overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50"
        >
          <div className="border-b border-cocoa-200 bg-cream-100/60 px-5 py-4">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-900">
              <MessageCircle className="size-5 text-matcha-700" />
              {cp.contactTitle}
            </h2>
            <p className="mt-0.5 text-sm text-cocoa-500">{cp.contactSubtitle}</p>
          </div>

          <div className="divide-y divide-cocoa-100">
            {settings?.whatsapp ? (
              <a
                href={waLink(settings.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-5 py-4 transition hover:bg-matcha-50"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-matcha-500 text-white">
                  <MessageCircle className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-cocoa-900">
                    {cp.chatWhatsApp}
                  </span>
                  <span className="block text-xs text-cocoa-500 tabular" dir="ltr">
                    {settings.whatsapp}
                  </span>
                </span>
              </a>
            ) : null}

            {settings?.instagram ? (
              <a
                href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-5 py-4 transition hover:bg-berry-50"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-berry-500 text-white">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-5"
                    aria-hidden
                  >
                    <rect x="2" y="2" width="20" height="20" rx="5" />
                    <circle cx="12" cy="12" r="4" />
                    <circle
                      cx="17.5"
                      cy="6.5"
                      r="0.8"
                      fill="currentColor"
                      stroke="none"
                    />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-cocoa-900">
                    {cp.openInstagram}
                  </span>
                  <span className="block text-xs text-cocoa-500">
                    @{settings.instagram.replace(/^@/, "")}
                  </span>
                </span>
              </a>
            ) : null}

            {hours ? (
              <div className="flex items-center gap-3 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
                  <Clock className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-cocoa-900">
                    {dicts.contact.hours}
                  </span>
                  <span className="block text-xs text-cocoa-500">{hours}</span>
                </span>
              </div>
            ) : null}

            {deadline ? (
              <div className="flex items-center gap-3 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-honey-400 text-cocoa-900">
                  <Timer className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-cocoa-900">
                    {dicts.contact.deadline}
                  </span>
                  <span className="block text-xs text-cocoa-500">{deadline}</span>
                </span>
              </div>
            ) : null}

            {settings?.address ? (
              <div className="flex items-center gap-3 px-5 py-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
                  <MapPin className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-cocoa-900">
                    {cp.mapTitle}
                  </span>
                  {settings.maps_url ? (
                    <a
                      href={settings.maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs text-cocoa-500 underline decoration-cocoa-300 underline-offset-2 hover:text-cocoa-800"
                    >
                      {settings.address}
                    </a>
                  ) : (
                    <span className="block text-xs text-cocoa-500">
                      {settings.address}
                    </span>
                  )}
                </span>
              </div>
            ) : null}
          </div>

          {settings?.whatsapp ? (
            <div className="px-5 pb-5">
              <Link
                href="/order"
                className="btn-primary w-full justify-center !py-3 text-sm"
              >
                {dicts.nav.order}
              </Link>
            </div>
          ) : null}
        </section>

        {/* ================= FAQ ================= */}
        <section id="faq" className="mt-8">
          <h2 className="text-lg font-extrabold text-cocoa-900">{cp.faqTitle}</h2>
          <p className="mt-0.5 text-sm text-cocoa-500">{cp.faqSubtitle}</p>

          <div className="mt-4 divide-y divide-cocoa-100 overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50">
            {FAQ.map((item, i) => (
              <details key={i} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-cocoa-900 transition hover:bg-cream-100 [&::-webkit-details-marker]:hidden">
                  <span>{item.q[lang]}</span>
                  <ChevronDown className="size-4 shrink-0 text-cocoa-400 transition group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-sm leading-relaxed text-cocoa-600">
                  {item.a[lang]}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ================= BRAND STORY ================= */}
        <section
          id="story"
          className="mt-8 overflow-hidden rounded-2xl border border-cocoa-200 bg-cocoa-900 text-cream-100"
        >
          <div className="bg-seigaha px-5 py-8 sm:px-8 sm:py-10">
            <span className="chip border border-cream-50/25 bg-cream-50/10 text-cream-100">
              <Sparkles className="size-3.5" />
              {cp.storyTitle}
            </span>
            <h2 className="mt-4 text-2xl font-extrabold text-cream-50">
              {settings?.store_name ?? "Rumakomugi"}
            </h2>
            {settings?.brand_line ? (
              <p className="mt-1 text-[11px] font-bold tracking-[0.18em] text-honey-300/80 uppercase">
                {settings.brand_line}
              </p>
            ) : null}
            <p className="mt-4 text-sm leading-relaxed text-cream-200/80">
              {story}
            </p>
          </div>
        </section>

        {/* ================= CTA ================= */}
        <section className="mt-8 rounded-2xl border border-cocoa-200 bg-cream-50 px-5 py-6 text-center">
          <h2 className="text-base font-extrabold text-cocoa-900">
            {cp.otherQuestions}
          </h2>
          <p className="mt-1 text-sm text-cocoa-500">{cp.otherQuestionsHint}</p>
          {settings?.whatsapp ? (
            <a
              href={waLink(settings.whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-4 !py-3 text-sm"
            >
              <MessageCircle className="size-4" />
              {cp.chatWhatsApp}
            </a>
          ) : null}
        </section>
      </main>

      <SiteFooter settings={settings} />
    </>
  );
}