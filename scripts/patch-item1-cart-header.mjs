// Patch item 1: keranjang beranda jadi ikon troli kecil di header.
// (Steven 16-10-2026, gambar 1)
import { patchFile } from "./_patch.mjs";

/* ---------------- QuickAdd.tsx ---------------- */
// 1. Context ikut membawa `flavors` supaya tombol header bisa menampilkan isi
//    keranjang tanpa menerima prop berlapis-lapis.
// 2. `CartDock` (bar gelap full-width) DIHAPUS dari beranda.
const quickAdd = [
  [
    `import { useCart } from "@/components/customer/CartProvider";
import { CartDock } from "@/components/customer/CartDock";
import { OrderBundleModal } from "@/components/customer/OrderBundleModal";`,
    `import { useCart } from "@/components/customer/CartProvider";
import { CartHeaderButton } from "@/components/customer/CartHeaderButton";
import { OrderBundleModal } from "@/components/customer/OrderBundleModal";`,
  ],
  [
    `interface QuickAddValue {
  /** Buka popup tambah cepat untuk satu rasa. */
  openFlavor: (flavor: Flavor) => void;
  /** Buka popup pilih isi paket. */
  openBundle: (bundle: Bundle) => void;
  /** Kunci keranjang boleh dibuka dari beranda (selalu true saat provider ada). */
  enabled: boolean;
}`,
    `interface QuickAddValue {
  /** Buka popup tambah cepat untuk satu rasa. */
  openFlavor: (flavor: Flavor) => void;
  /** Buka popup pilih isi paket. */
  openBundle: (bundle: Bundle) => void;
  /** Kunci keranjang boleh dibuka dari beranda (selalu true saat provider ada). */
  enabled: boolean;
  /**
   * Daftar rasa untuk merakit isi keranjang (nama, harga, foto).
   *
   * Tombol troli di header membutuhkannya: yang tersimpan di localStorage hanya
   * id rasa, jadi tanpa katalog halaman tidak bisa menampilkan apa isi keranjang.
   */
  flavors: Flavor[];
}`,
  ],
  [
    `export function QuickAddProvider({
  categories,
  whatsapp,
  children,
}: {
  categories: Category[];
  /** Nomor WhatsApp toko; diteruskan ke dock keranjang di beranda. */
  whatsapp?: string | null;
  children: React.ReactNode;
}) {
  const [flavor, setFlavor] = useState<Flavor | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const soldCounts = useSoldCounts();
  const { t } = useI18n();

  const openFlavor = useCallback((f: Flavor) => setFlavor(f), []);
  const openBundle = useCallback((b: Bundle) => setBundle(b), []);
  const closeFlavor = useCallback(() => setFlavor(null), []);
  const closeBundle = useCallback(() => setBundle(null), []);

  const value = useMemo<QuickAddValue>(
    () => ({ openFlavor, openBundle, enabled: true }),
    [openFlavor, openBundle]
  );

  // Steven 15-10-2026: "Pada home, tambahkan keranjang juga jadi ketika mereka
  // klik masukkan ke keranjang yang di home, mereka juga bisa lihat ada apa aja."
  //
  // Dipasang DI DALAM provider (bukan di \`page.tsx\`) supaya langsung berakses
  // ke \`categories\` yang sudah ada di tangan, dan supaya tidak terpasang dua
  // kali kalau nanti beranda memakai provider ini lagi di tempat lain.
  //
  // Tidak ada \`onCheckout\`: beranda belum punya alur langkah, jadi tombol di
  // dalam sheet dibawa ke \`/order\` (lihat \`CartDock\`).
  const flavors = useMemo(() => flatFlavors(categories), [categories]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddModal flavor={flavor} onClose={closeFlavor} />
      <OrderBundleModal
        bundle={bundle}
        categories={categories}
        soldCounts={soldCounts}
        open={bundle != null}
        onClose={closeBundle}
      />
      <CartDock
        flavors={flavors}
        whatsapp={whatsapp}
        emptyText={t.cart.emptyOnHome}
      />
    </QuickAddContext.Provider>
  );
}`,
    `export function QuickAddProvider({
  categories,
  children,
}: {
  categories: Category[];
  children: React.ReactNode;
}) {
  const [flavor, setFlavor] = useState<Flavor | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const soldCounts = useSoldCounts();

  const openFlavor = useCallback((f: Flavor) => setFlavor(f), []);
  const openBundle = useCallback((b: Bundle) => setBundle(b), []);
  const closeFlavor = useCallback(() => setFlavor(null), []);
  const closeBundle = useCallback(() => setBundle(null), []);

  // Steven 15-10-2026: "Pada home, tambahkan keranjang juga..." Daftar rasa ini
  // yang dipakai tombol troli di header untuk merakit isi keranjang.
  const flavors = useMemo(() => flatFlavors(categories), [categories]);

  const value = useMemo<QuickAddValue>(
    () => ({ openFlavor, openBundle, enabled: true, flavors }),
    [openFlavor, openBundle, flavors]
  );

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <QuickAddModal flavor={flavor} onClose={closeFlavor} />
      <OrderBundleModal
        bundle={bundle}
        categories={categories}
        soldCounts={soldCounts}
        open={bundle != null}
        onClose={closeBundle}
      />
    </QuickAddContext.Provider>
  );
}

/**
 * Tombol troli keranjang untuk dipasang di header beranda.
 *
 * Sengaja memakai \`useQuickAdd()\` (bukan menerima \`flavors\` sebagai prop)
 * supaya \`page.tsx\` tidak perlu memanggil \`flatFlavors\` sendiri dan daftar
 * rasa tetap punya satu sumber kebenaran.
 */
export function HomeCartButton() {
  const ctx = useQuickAdd();
  if (!ctx) return null;
  return <CartHeaderButton flavors={ctx.flavors} />;
}`,
  ],
];

/* ---------------- SiteHeader.tsx ---------------- */
// Slot `cartButton` supaya header bisa memuat tombol troli. Default undefined
// supaya halaman lain (yang tidak punya katalog rasa) tidak ikut berubah.
const siteHeader = [
  [
    `import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";`,
    `import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";`,
  ],
  [
    `export function SiteHeader({
  storeName = DEFAULT_STORE_NAME,
  logoUrl = null,
  brandLine = "",
}: {
  storeName?: string;
  logoUrl?: string | null;
  brandLine?: string;
}) {`,
    `export function SiteHeader({
  storeName = DEFAULT_STORE_NAME,
  logoUrl = null,
  brandLine = "",
  cartButton = null,
}: {
  storeName?: string;
  logoUrl?: string | null;
  brandLine?: string;
  /**
   * Tombol keranjang untuk header, mis. \`HomeCartButton\`.
   *
   * Steven 16-10-2026: di beranda keranjang pindah dari bar melayang di bawah
   * layar menjadi ikon troli kecil di header, sebelah lonceng notifikasi.
   * Halaman lain tidak mengirim apa pun, jadi header mereka tetap seperti dulu.
   */
  cartButton?: ReactNode;
}) {`,
  ],
  [
    `        <NotificationBell />

        {/* Chip avatar / "Masuk" disembunyikan sementara`,
    `        <NotificationBell />

        {/* Ikon troli keranjang (hanya beranda). Kosong = tidak ada isi. */}
        {cartButton}

        {/* Chip avatar / "Masuk" disembunyikan sementara`,
  ],
  [
    `          <NotificationBell />
          {/* Sama seperti di mobile: chip avatar / "Masuk" ikut disembunyikan`,
    `          <NotificationBell />
          {/* Sama seperti di mobile: ikon troli ikut disembunyikan kalau
              beranda tidak mengirim satu pun. */}
          {cartButton}
          {/* Sama seperti di mobile: chip avatar / "Masuk" ikut disembunyikan`,
  ],
];

/* ---------------- page.tsx ---------------- */
const page = [
  [
    `import { AppHome } from "@/components/customer/AppHome";`,
    `import { AppHome } from "@/components/customer/AppHome";
import { HomeCartButton } from "@/components/customer/QuickAdd";`,
  ],
  [
    `    <QuickAddProvider categories={categories} whatsapp={settings?.whatsapp}>
      <SiteHeader
        storeName={settings?.store_name ?? DEFAULT_STORE_NAME}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />`,
    `    <QuickAddProvider categories={categories}>
      <SiteHeader
        storeName={settings?.store_name ?? DEFAULT_STORE_NAME}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
        cartButton={<HomeCartButton />}
      />`,
  ],
];

for (const [file, edits] of [
  ["src/components/customer/QuickAdd.tsx", quickAdd],
  ["src/components/customer/SiteHeader.tsx", siteHeader],
  ["src/app/page.tsx", page],
]) {
  console.log("OK  " + JSON.stringify(patchFile(file, edits)));
}