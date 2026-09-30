import type { Metadata, Viewport } from "next";
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { LANG_COOKIE, langFromCookie } from "@/lib/i18n/shared";
import { CartProvider } from "@/components/customer/CartProvider";
import { ToastProvider } from "@/components/ui/Toast";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Japanese Sando — Pre-order Sando Sandwich",
    template: "%s | Japanese Sando",
  },
  description:
    "Japanese sando dibuat fresh khusus pre-order. Pilih rasa favoritmu, bayar transfer atau cash on delivery. Roti sederhana, rasa luar biasa.",
  keywords: [
    "japanese sando",
    "sando sandwich",
    "pre order",
    "sandwich",
    "roti lapis",
    "cash on delivery",
  ],
  authors: [{ name: "Japanese Sando" }],
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    siteName: "Japanese Sando",
    title: "Japanese Sando — Pre-order Sando Sandwich",
    description:
      "Japanese sando dibuat fresh khusus pre-order. Roti sederhana, rasa luar biasa.",
    images: [{ url: "/foto-awal.jpeg", width: 1242, height: 1242, alt: "Japanese Sando" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Japanese Sando — Pre-order Sando Sandwich",
    description: "Japanese sando dibuat fresh khusus pre-order.",
    images: ["/foto-awal.jpeg"],
  },
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  themeColor: "#2c1e12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const lang = langFromCookie(cookieStore.get(LANG_COOKIE)?.value);

  return (
    // `data-scroll-behavior` dipakai Next.js 16 agar navigasi antar halaman
    // tetap langsung ke atas, bukan smooth-scroll.
    <html
      lang={lang}
      data-scroll-behavior="smooth"
      className={`${playfair.variable} ${jakarta.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <I18nProvider initialLang={lang}>
          <ToastProvider>
            <CartProvider>{children}</CartProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
