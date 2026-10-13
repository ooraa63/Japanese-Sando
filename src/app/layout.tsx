import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { LANG_COOKIE, langFromCookie } from "@/lib/i18n/shared";
import { CartProvider } from "@/components/customer/CartProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { CustomerAuthProvider } from "@/components/customer/CustomerAuthProvider";
import { AuthModal } from "@/components/customer/AuthModal";
import { MobileBottomNav } from "@/components/customer/MobileBottomNav";
import { getCustomerProfile, getProfileMenuItems } from "@/lib/data";
import { DEFAULT_STORE_NAME } from "@/lib/brand";

// Playfair (serif) DIHAPUS 12-10-2026 — semua judul sekarang sans-serif.
// Font Playfair sengaja tidak di-load supaya tidak ada request font sia-sia.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${DEFAULT_STORE_NAME} — Pre-order Sando Sandwich`,
    template: `%s | ${DEFAULT_STORE_NAME}`,
  },
  description:
    "Japanese sando dibuat fresh khusus pre-order. Pilih rasa favoritmu, bayar transfer atau cash on delivery.",
  keywords: [
    "japanese sando",
    "sando sandwich",
    "pre order",
    "sandwich",
    "roti lapis",
    "cash on delivery",
  ],
  authors: [{ name: DEFAULT_STORE_NAME }],
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: SITE_URL,
    siteName: DEFAULT_STORE_NAME,
    title: `${DEFAULT_STORE_NAME} — Pre-order Sando Sandwich`,
    description:
      "Japanese sando dibuat fresh khusus pre-order. Roti sederhana, rasa luar biasa.",
    images: [{ url: "/hero-sando.jpg", width: 1242, height: 1242, alt: DEFAULT_STORE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${DEFAULT_STORE_NAME} — Pre-order Sando Sandwich`,
    description: "Japanese sando dibuat fresh khusus pre-order.",
    images: ["/hero-sando.jpg"],
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

  // Profil customer digunakan untuk header (tombol "Akun saya" vs "Masuk")
  // dan auto-fill identitas di /order. RPC `customer_profile()` return
  // null kalau belum login — aman dipanggil untuk semua visitor.
  const initialProfile = await getCustomerProfile();

  // Bar menu sheet Profil (tab paling kanan bottom nav). Datanya diambil
  // di sini supaya sheet ter-render dari server dan tidak flash kosong.
  const profileMenu = await getProfileMenuItems();

  return (
    // `data-scroll-behavior` dipakai Next.js 16 agar navigasi antar halaman
    // tetap langsung ke atas, bukan smooth-scroll.
    <html
      lang={lang}
      data-scroll-behavior="smooth"
      className={jakarta.variable}
    >
      <body className="min-h-dvh antialiased">
        <I18nProvider initialLang={lang}>
          <ToastProvider>
            <CartProvider>
              <CustomerAuthProvider initialProfile={initialProfile}>
                {children}
                <AuthModal />
                <MobileBottomNav profileMenu={profileMenu} />
              </CustomerAuthProvider>
            </CartProvider>
          </ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
