/**
 * Struktur navigasi admin — SATU sumber kebenaran.
 *
 * SEJARAH PERUBAHAN
 *
 * 17-10-2026 sore — sebelas menu admin dijajekan datar di satu sidebar, lalu
 * dipecah jadi enam aplikasi (gambar 2 Steven). Steven: "jangan semua yang
 * gambar 3 itu dijadikan 1 side bar".
 *
 * 18-10-2026 sore — enam aplikasi masih terasa ribet. Steven: "yang ada
 * keseluruhan seperti yang Order, Mutasi, Customer, Menu itu jadi satu bagian
 * lalu nanti yang PO ada bagian tersendiri lagi". Enam aplikasi jadi tiga.
 *
 * 18-10-2026 malam — tiga penyesuaian lagi dari Steven:
 *   1. "Yang Operation itu di sidebar jangan double, gak perlu ada judulnya kayak
 *      Summary Orders, gak perlu langsung tab nya aja" -> app Operasional memakai
 *      sidebar DAFTAR FLAT tanpa judul bagian.
 *   2. "Di yang PO, buat jadi ada 2, 1 untuk berlangsung sama untuk menambahkan
 *      dan satu lagi yang sudah berlalu" -> app Batch PO punya dua menu.
 *   3. "Yang setting yang Identity, itu semua barnya dipindah ke side bar aja" ->
 *      semua tab `/admin/settings` pindah ke sidebar, dan app "Identitas Toko"
 *      yang dulu ada menghilang: semuanya jadi satu app "Pengaturan". Deretan tab
 *      di atas halaman SettingsClient DIHAPUS, sidebar jadi satu-satunya cara
 *      pindah section.
 *
 * Jumlah menu tetap sebelas, tidak ada yang ditambah atau dihapus:
 *
 *  - **Operasional** — semua yang dibuka sambil menjalankan toko.
 *  - **Batch PO** — dua menu: yang sedang berjalan (beserta tambah batch) dan
 *    yang sudah berlalu.
 *  - **Pengaturan** — seluruh isi Pengaturan, termasuk Menu Profil dan
 *    Pengumuman.
 *
 * CATATAN PENTING soal `?tab=`
 *   Dua aplikasi memakai `?tab=` sebagai pemisah menunya: `settings` (delapan
 *   tab pengaturan) dan `po` (berlangsung / sudah berlalu). Supaya sidebar bisa
 *   menandai yang aktif, kedua halamannya MEMBACA query itu, bukan cuma punya
 *   state lokal. Jangan menambah item dengan `href` yang sama tapi `tab`
 *   berbeda tanpa menyambungkan pembaca query-nya — kalau tidak, keduanya akan
 *   sama-sama aktif.
 */

import { CalendarRange, LayoutDashboard, Settings as SettingsIcon } from "lucide-react";

/** Nama bagian di dalam satu aplikasi, mis. "PELANGGAN" atau "PEMBAYARAN". */
export type AdminSectionId =
  | "identitas"
  | "pengiriman"
  | "pembayaran"
  | "ketersediaan"
  | "akun"
  | "komunikasi";

export type AdminAppId = "operations" | "po" | "settings";

export interface AdminNavItem {
  href: string;
  /**
   * Nilai `?tab=` yang membuat item ini aktif.
   *
   * WAJIB diisi kalau `href`-nya dipakai lebih dari satu menu, dan halamannya
   * harus MEMBACA query itu. Untuk halaman yang cuma punya satu menu (mis.
   * `/admin/orders`), biarkan `undefined` supaya tidak ikut campur dengan
   * pemisah `?tab=` milik aplikasi lain.
   */
  tab?: string;
  /**
   * Bagian tempat item ini ditampilkan di sidebar. Kalau `undefined` untuk
   * SELURUH item sebuah aplikasi, sidebar-nya dirender sebagai daftar flat
   * tanpa judul bagian — dipakai app Operasional dan app Batch PO atas
   * permintaan Steven, supaya menunya tidak dobel dengan label yang sudah ada.
   */
  section?: AdminSectionId;
}

export interface AdminApp {
  id: AdminAppId;
  /** Halaman yang dibuka ketika lempengnya diklik. */
  href: string;
  /** Prefix untuk menentukan "sedang berada di aplikasi ini". */
  match: string;
  /**
   * Prefix tambahan yang juga masuk ke aplikasi ini — dipakai untuk halaman
   * editor yang tidak punya tombol sendiri di sidebar tapi tetap bagian dari
   * topik aplikasi (`/admin/faq` dan `/admin/terms` adalah editor halaman yang
   * dibuka dari "Menu Profil").
   */
  extraMatches?: string[];
  /** Nilai `?tab=` yang MASUK ke aplikasi ini. */
  tabs?: string[];
  /**
   * `?tab=` yang dianggap aktif kalau URL tidak menyertakannya. WAJIB diisi
   * kalau `tabs` diisi — tanpa ini `/admin/settings` tanpa query akan tidak
   * cocok dengan aplikasi mana pun dan sidebar ikut hilang.
   */
  defaultTab?: string;
  icon: typeof SettingsIcon;
  /**
   * Warna lempeng di launcher. WAJIB ditulis utuh sebagai string literal —
   * jangan dirakit dari template literal, Tailwind tidak akan melihatnya
   * (gotcha #131).
   */
  tile: string;
  items: AdminNavItem[];
}

/** Halaman "/admin/settings" tanpa `?tab=` — dipakai untuk pencocokan. */
export const SETTINGS_PATH = "/admin/settings";

/**
 * Dua mode halaman Batch PO, sesuai dua menunya di sidebar app PO:
 * yang sedang berjalan (dan tempatnya menambah batch) dan yang sudah berlalu.
 *
 * Dideklarasikan DI SINI, bukan di halaman PO, karena keduanya harus tahu
 * daftar yang sama: sidebar (untuk menandai aktif) dan `po/page.tsx` (untuk
 * menyaring daftar batch). Kalau hanya salah satu yang tahu, satu sisi diam-diam
 * tidak sinkron.
 */
export const PO_TABS = ["berlangsung", "selesai"] as const;
export type PoTab = (typeof PO_TABS)[number];

/**
 * `href` aplikasi pertama harus sama dengan lempengnya supaya sidebar masuk ke
 * "dalam aplikasi" begitu lempeng diklik.
 *
 * Pengecualian `settings`: landing-nya di `SETTINGS_PATH`, yang juga jadi
 * prefix `/admin/faq` dan `/admin/terms`. Yang membedakan menunya hanya
 * `?tab=`, jadi lempeng dan sidebar harus membuka tab yang BERBEDA supaya tidak
 * membuka halaman yang sama persis.
 *
 * Urutan item mengikuti urutan pakai Steven, bukan urutan alfabet: yang paling
 * sering dibuka paling atas.
 */
export const ADMIN_APPS: AdminApp[] = [
  {
    id: "operations",
    href: "/admin/dashboard",
    match: "/admin/dashboard",
    icon: LayoutDashboard,
    tile: "from-matcha-400 to-matcha-700",
    /* Tidak ada `section` sama sekali = sidebar flat, sesuai permintaan
       Steven 18-10-2026. */
    items: [
      { href: "/admin/dashboard" },
      { href: "/admin/orders" },
      { href: "/admin/sales" },
      { href: "/admin/customers" },
      { href: "/admin/reviews" },
      { href: "/admin/menu" },
      { href: "/admin/pickup-delivery" },
    ],
  },
  {
    id: "po",
    href: "/admin/po?tab=berlangsung",
    match: "/admin/po",
    icon: CalendarRange,
    tile: "from-cocoa-500 to-cocoa-800",
    tabs: [...PO_TABS],
    defaultTab: PO_TABS[0],
    /* Flat juga — dua menu tidak perlu judul bagian. */
    items: [
      { href: "/admin/po", tab: PO_TABS[0] },
      { href: "/admin/po", tab: PO_TABS[1] },
    ],
  },
  {
    id: "settings",
    href: "/admin/settings?tab=identity",
    match: "/admin/settings",
    extraMatches: ["/admin/faq", "/admin/terms"],
    tabs: ["identity", "contact", "hours", "shipping", "payment", "availability", "home", "admin"],
    defaultTab: "identity",
    icon: SettingsIcon,
    tile: "from-berry-400 to-berry-700",
    items: [
      { href: "/admin/settings", tab: "identity", section: "identitas" },
      { href: "/admin/settings", tab: "contact", section: "identitas" },
      { href: "/admin/settings", tab: "hours", section: "identitas" },
      { href: "/admin/settings", tab: "shipping", section: "pengiriman" },
      { href: "/admin/settings", tab: "payment", section: "pembayaran" },
      { href: "/admin/settings", tab: "availability", section: "ketersediaan" },
      { href: "/admin/settings", tab: "home", section: "akun" },
      { href: "/admin/settings", tab: "admin", section: "akun" },
      { href: "/admin/profile-menu", section: "komunikasi" },
      { href: "/admin/announcements", section: "komunikasi" },
    ],
  },
];

/**
 * Aplikasi yang sedang dibuka, atau `null` di layar awal.
 *
 * Dua syarat harus benar BERBARENGAN: path-nya cocok dengan prefix aplikasi,
 * DAN — kalau aplikasi itu memakai `?tab=` sebagai pemisah menu — tabnya juga
 * cocok. `?tab=` wajib ikut diteruskan: tanpa itu `/admin/settings?tab=payment`
 * akan salah tampil dan `/admin/po` tanpa query tidak akan masuk app mana pun.
 *
 * `match` sudah mencakup `href` tiap item plus `extraMatches`, supaya
 * `/admin/po/[id]` tetap masuk app Batch PO dan `/admin/faq` masuk app
 * Pengaturan.
 */
export function appForPath(pathname: string, tab?: string | null): AdminApp | null {
  if (pathname === "/admin" || pathname === "/admin/") return null;

  const cocok = (a: AdminApp) => {
    const prefixes = [a.match, ...a.items.map((i) => i.href), ...(a.extraMatches ?? [])];
    const cocokPath = prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!cocokPath) return false;
    if (!a.tabs) return true;
    return a.tabs.includes(tab || a.defaultTab || "");
  };

  return ADMIN_APPS.find(cocok) ?? null;
}

/** `?tab=` yang sedang aktif untuk sebuah aplikasi, dengan fallback defaultTab. */
export function activeTabFor(app: AdminApp, tab?: string | null): string | null {
  if (!app.tabs) return null;
  return tab || app.defaultTab || null;
}