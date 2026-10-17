/**
 * Struktur navigasi admin — SATU sumber kebenaran.
 *
 * LATAR BELAKANG (Steven 17-10-2026, gambar 3):
 * Sebelas menu admin dijajekan datar di satu sidebar. Steven: "jangan semua
 * yang gambar 3 itu dijadikan 1 side bar... identitas toko, ataupun Batch,
 * lalu ringkasan bisnis, seting, dsb kita pisahkan."
 *
 * Revisi kedua Steven (18-10-2026), setelah yang pertama masih terasa ribet:
 * "yang ada keseluruhan seperti yang Order, Mutasi, Customer, Menu itu jadi
 * satu bagian lalu nanti yang PO ada bagian tersendiri lagi". Jadi semua yang
 * dipakai operasional harian dikumpulkan jadi SATU aplikasi, dan Pre-order
 * dipisah karena punya jadwal dan stok sendiri.
 *
 * Jumlah menu tetap sebelas, tidak ada yang ditambah atau dihapus — hanya
 * dikelompokkan ulang:
 *
 *  - **Operasional** — Dashboard, Pesanan, Mutasi Penjualan, Pelanggan,
 *    Ulasan, Menu & Paket, Ambil & Kirim. Semuanya yang dibuka sambil
 *    menjalankan toko, jadi tidak perlu pindah-pindah aplikasi.
 *  - **Batch PO** — satu-satunya isi: Batch PO. Dipisah karena jadwal buka /
 *    tutup dan stok batch punya aturan sendiri.
 *  - **Identitas Toko** — apa yang dilihat pembeli.
 *  - **Pengaturan** — setelan sistem.
 *
 * CATATAN PENTING soal `?tab=`
 *   Menu Pengaturan dan Identitas Toko sama-sama hidup di `/admin/settings`,
 *   hanya berbeda tab. Supaya sidebar bisa menandai yang aktif dengan benar,
 *   `SettingsClient` membaca tab dari URL (`?tab=...`), bukan dari state saja.
 *   Jangan menambah item dengan `href` yang sama tapi `tab` berbeda tanpa
 *   menyambungkan `SettingsClient` — kalau tidak, keduanya akan sama-sama
 *   aktif.
 */

import {
  CalendarRange,
  LayoutDashboard,
  Settings as SettingsIcon,
  Store,
} from "lucide-react";

/** Nama bagian di dalam satu aplikasi, mis. "PESANAN" atau "PELANGGAN". */
export type AdminSectionId =
  | "ringkasan"
  | "pesanan"
  | "penjualan"
  | "pelanggan"
  | "produk"
  | "pengiriman"
  | "preorder"
  | "identitas"
  | "komunikasi"
  | "pembayaran"
  | "tampilan"
  | "akun";

export type AdminAppId = "operations" | "po" | "identity" | "settings";

export interface AdminNavItem {
  href: string;
  /**
   * Nilai `?tab=` yang membuat item ini aktif. `null` untuk halaman biasa.
   * Item dengan `tab` hanya boleh dipakai kalau halamannya MEMBACA query itu
   * (saat ini cuma `/admin/settings`).
   */
  tab?: string | null;
  section: AdminSectionId;
}

export interface AdminApp {
  id: AdminAppId;
  /** Halaman yang dibuka ketika lempengnya diklik. */
  href: string;
  /** Prefix untuk menentukan "sedang berada di aplikasi ini". */
  match: string;
  /**
   * Prefix tambahan yang juga masuk ke aplikasi ini.
   *
   * Dipakai untuk halaman editor yang tidak punya tombol sendiri di sidebar
   * tapi tetap adalah bagian dari topik aplikasi — `/admin/faq` dan
   * `/admin/terms` adalah editor halaman yang dibuka dari "Menu Profil", jadi
   * keduanya tetap harus menampilkan sidebar "Identitas Toko".
   */
  extraMatches?: string[];
  /**
   * Nilai `?tab=` yang MASUK ke aplikasi ini, dipakai hanya oleh aplikasi yang
   * landing-nya di `SETTINGS_PATH`. Tanpa ini, `/admin/settings` akan selalu
   * jatuh ke aplikasi pertama yang cocok karena keduanya `match`-nya sama.
   */
  tabs?: string[];
  icon: typeof Store;
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
 * Tab default `/admin/settings` kalau query string-nya kosong. `SettingsClient`
 * juga memakai ini, jadi keduanya tidak boleh berbeda.
 */
export const TAB_DEFAULT = "identity";

/**
 * `href` aplikasi pertama harus sama dengan lempengnya supaya sidebar masuk
 * ke "dalam aplikasi" begitu lempeng diklik.
 *
 * Pengecualian `identity` dan `settings`: keduanya landing di
 * `SETTINGS_PATH`, jadi `match` keduanya sama dan yang membedakan hanya
 * `?tab=`. Keduanya juga landing di tab yang berbeda supaya lempeng dan
 * sidebar tidak membuka halaman yang sama persis.
 *
 * Urutan di dalam aplikasi mengikuti urutan pakai Steven, bukan urutan alfabet:
 * yang paling sering dibuka paling atas.
 */
export const ADMIN_APPS: AdminApp[] = [
  {
    id: "operations",
    href: "/admin/dashboard",
    match: "/admin/dashboard",
    icon: LayoutDashboard,
    tile: "from-matcha-400 to-matcha-700",
    items: [
      { href: "/admin/dashboard", section: "ringkasan" },
      { href: "/admin/orders", section: "pesanan" },
      { href: "/admin/sales", section: "penjualan" },
      { href: "/admin/customers", section: "pelanggan" },
      { href: "/admin/reviews", section: "pelanggan" },
      { href: "/admin/menu", section: "produk" },
      { href: "/admin/pickup-delivery", section: "pengiriman" },
    ],
  },
  {
    id: "po",
    href: "/admin/po",
    match: "/admin/po",
    icon: CalendarRange,
    tile: "from-cocoa-500 to-cocoa-800",
    items: [{ href: "/admin/po", section: "preorder" }],
  },
  {
    id: "identity",
    href: "/admin/settings?tab=identity",
    match: "/admin/settings",
    extraMatches: ["/admin/faq", "/admin/terms"],
    /* `contact` dan `shipping` sengaja tidak jadi item sidebar: menu lama juga
       cuma punya satu item "Pengaturan", tab itu masih bisa dibuka lewat
       deretan tab di dalam halaman. */
    tabs: ["identity", "contact", "hours", "shipping"],
    icon: Store,
    tile: "from-berry-400 to-berry-700",
    items: [
      { href: "/admin/settings", tab: "identity", section: "identitas" },
      { href: "/admin/settings", tab: "hours", section: "identitas" },
      { href: "/admin/profile-menu", section: "komunikasi" },
      { href: "/admin/announcements", section: "komunikasi" },
    ],
  },
  {
    id: "settings",
    href: "/admin/settings?tab=payment",
    match: "/admin/settings",
    tabs: ["payment", "availability", "home", "admin"],
    icon: SettingsIcon,
    tile: "from-violet-400 to-violet-700",
    items: [
      { href: "/admin/settings", tab: "payment", section: "pembayaran" },
      { href: "/admin/settings", tab: "availability", section: "tampilan" },
      { href: "/admin/settings", tab: "home", section: "tampilan" },
      { href: "/admin/settings", tab: "admin", section: "akun" },
    ],
  },
];

/**
 * Aplikasi yang sedang dibuka, atau `null` di layar awal.
 *
 * `tab` wajib ikut dibaca karena `SETTINGS_PATH` dipakai dua aplikasi: tanpa
 * itu, `/admin/settings?tab=payment` akan menampilkan sidebar "Identitas Toko".
 * `match` juga sudah mencakup `href` tiap item, supaya `/admin/po` tetap masuk
 * aplikasi sendiri walau `match`-nya menunjuk halaman lain.
 */
export function appForPath(pathname: string, tab?: string | null): AdminApp | null {
  if (pathname === "/admin" || pathname === "/admin/") return null;

  if (pathname === SETTINGS_PATH || pathname.startsWith(SETTINGS_PATH + "/")) {
    return ADMIN_APPS.find((a) => a.tabs?.includes(tab || TAB_DEFAULT)) ?? null;
  }

  return (
    ADMIN_APPS.find((a) => {
      const prefixes = [a.match, ...a.items.map((i) => i.href), ...(a.extraMatches ?? [])];
      return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
    }) ?? null
  );
}