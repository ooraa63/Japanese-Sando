/**
 * Label sidebar admin, dipetakan ke daftar aplikasi `ADMIN_APPS`.
 *
 * Dipisah dari `layout.tsx` karena dipakai DI DUA tempat: `AdminShell` untuk
 * sidebar, dan `AdminLauncher` untuk ringkasan di bawah judul lempeng. Kalau
 * tiap tempat punya salinan, keduanya bisa menampilkan teks berbeda untuk menu
 * yang sama — persis yang terjadi sebelumnya, saat lempeng menulis "Ringkasan ·
 * Pesanan · Penjualan" sementara sidebar sudah berubah.
 */

import type { getI18nDict } from "@/lib/i18n-server";
import { ADMIN_APPS } from "@/lib/admin-nav";

type Dicts = Awaited<ReturnType<typeof getI18nDict>>;

/** Kunci label menu: `href`, ditambah `?tab=` kalau menunya punya tab. */
export function labelKey(href: string, tab?: string): string {
  return tab ? `${href}?tab=${tab}` : href;
}

/**
 * Peta `{ "href?tab=x": "Label" }` untuk seluruh menu di sidebar.
 *
 * Dijumlahkan dari `ADMIN_APPS`, bukan ditulis daftar panjang sendiri, supaya
 * menu baru yang ditambah di `admin-nav.ts` otomatis dapat labelnya.
 *
 * PENTING: label tab Pengaturan diambil dari `admin.settings.*` — teks yang
 * sama persis dengan isi halamannya. Sebelumnya labelnya ditulis ulang di
 * `admin.nav.*` dan akibatnya melenceng: sidebar menulis "Kategori &
 * Ketersediaan" padahal tab itu isinya cuma sakelar "Status pre-order".
 */
export function labelPerMenu(dicts: Dicts): Record<string, string> {
  const n = dicts.admin.nav;
  const s = dicts.admin.settings;
  const perApp = {
    operations: {
      "/admin/dashboard": n.dashboard,
      "/admin/orders": n.orders,
      "/admin/sales": n.salesReport,
      "/admin/customers": n.customers,
      "/admin/reviews": n.reviews,
      "/admin/menu": n.menuCatalog,
      "/admin/pickup-delivery": n.pickupDelivery,
    },
    po: {
      "/admin/po?tab=berlangsung": n.poOngoing,
      "/admin/po?tab=selesai": n.poPast,
    },
    settings: {
      "/admin/settings?tab=identity": s.identity,
      "/admin/settings?tab=contact": s.contact,
      "/admin/settings?tab=hours": s.orderRules,
      "/admin/settings?tab=shipping": s.pickupDeliveryTitle,
      "/admin/settings?tab=payment": s.payments,
      "/admin/settings?tab=availability": s.availability,
      "/admin/settings?tab=home": s.homeTab,
      "/admin/settings?tab=admin": s.accountTitle,
      "/admin/profile-menu": n.profileMenu,
      "/admin/announcements": n.announcements,
    },
  } as const;

  const out: Record<string, string> = {};
  for (const app of ADMIN_APPS) {
    const peta = perApp[app.id as keyof typeof perApp] as Record<string, string>;
    for (const item of app.items) {
      const kunci = labelKey(item.href, item.tab);
      out[kunci] = peta[kunci] ?? kunci;
    }
  }
  return out;
}