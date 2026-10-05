import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Category,
  CustomerOrderSummary,
  CustomerProfile,
  Flavor,
  StoreSettings,
} from "@/lib/types";

/** Ambil pengaturan toko. Aman dipanggil tanpa login. */
export const getSettings = cache(async (): Promise<StoreSettings | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Gagal memuat pengaturan:", error.message);
    return null;
  }
  return (data as StoreSettings) ?? null;
});

/** Ambil semua rasa yang tampil di etalase. */
export const getActiveFlavors = cache(async (): Promise<Flavor[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flavors")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("Gagal memuat daftar rasa:", error.message);
    return [];
  }
  return (data as Flavor[]) ?? [];
});

/**
 * Hasil `public_menu()`: kategori beserta rasa-rasanya, plus daftar bundle
 * berdiri sendiri (category_id IS NULL).
 */
export interface PublicMenuResult {
  categories: Category[];
  bundles: Array<{
    id: number;
    category_id: number | null;
    slug: string;
    name_id: string;
    name_en: string;
    desc_id: string;
    desc_en: string;
    price: number;
    required_qty: number;
    image_url: string | null;
    is_active: boolean;
    is_featured: boolean;
    sort_order: number;
  }>;
}

/**
 * Menu dua tingkat: kategori -> rasa + bundle berdiri sendiri.
 * Satu panggilan RPC supaya tidak perlu join di client.
 */
export const getPublicMenu = cache(async (): Promise<PublicMenuResult> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_menu");

  if (error) {
    console.error("Gagal memuat menu:", error.message);
    return { categories: [], bundles: [] };
  }
  // Backward-compat: kalau RPC masih return array (sebelum migrasi 11),
  // perlakukan sebagai array of categories.
  if (Array.isArray(data)) {
    return { categories: (data as Category[]) ?? [], bundles: [] };
  }
  const obj = (data ?? {}) as PublicMenuResult;
  const categories = obj.categories ?? [];
  const topLevelBundles = obj.bundles ?? [];

  // RPC `public_menu` mengembalikan:
  //   - top-level `bundles`: hanya bundle dengan category_id IS NULL
  //   - per-kategori `categories[].bundles`: bundle yang terkait kategori itu
  //     ATAU berdiri sendiri (NULL) — jadi tiap kategori bisa dapat duplikat
  //     bundle berdiri sendiri.
  // Untuk konsistensi tampilan, kita gabung semua bundle aktif (unik by id)
  // dan buang field `bundles` per-kategori supaya tidak bikin ambigu.
  const byId = new Map<number, (typeof topLevelBundles)[number]>();
  for (const b of topLevelBundles) byId.set(b.id, b);
  for (const c of categories) {
    for (const b of c.bundles ?? []) byId.set(b.id, b);
  }
  const bundles = [...byId.values()].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });

  // Hapus `bundles` per-kategori dari output supaya tidak ambigu dan tidak
  // membengkakkan payload (frontend pakai `bundles` top-level saja).
  const slimCategories = categories.map((c) => {
    const { bundles: _ignored, ...rest } = c;
    void _ignored;
    return rest as Category;
  });

  return { categories: slimCategories, bundles };
});

/** Ambil semua rasa termasuk yang nonaktif (khusus dashboard). */
export const getAllFlavors = cache(async (): Promise<Flavor[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("flavors")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    console.error("Gagal memuat daftar rasa:", error.message);
    return [];
  }
  return (data as Flavor[]) ?? [];
});

/**
 * Ambil profil customer yang sedang login. Null kalau belum login atau
 * user Supabase belum punya baris di customer_profiles.
 *
 * Dipakai oleh halaman /order untuk auto-fill identitas dan oleh halaman
 * /account untuk menampilkan info akun. RPC `customer_profile()` dibuat
 * security-definer dan membaca dari auth context, jadi aman dipanggil
 * tanpa RLS khusus.
 */
export const getCustomerProfile = cache(async (): Promise<CustomerProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_profile");
  if (error) {
    // Kemungkinan user belum login atau tabel belum ada. Diam saja supaya
    // halaman publik tetap jalan tanpa memunculkan error.
    if (error.message !== "JWT expired" && !/does not exist/i.test(error.message)) {
      console.error("Gagal memuat profil customer:", error.message);
    }
    return null;
  }
  return (data as CustomerProfile | null) ?? null;
});

/**
 * Daftar pesanan milik customer yang sedang login, urut terbaru dulu.
 * Null kalau RPC tidak tersedia atau user belum login.
 */
export const getCustomerOrders = cache(async (): Promise<CustomerOrderSummary[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_orders");
  if (error) {
    if (!/does not exist/i.test(error.message)) {
      console.error("Gagal memuat pesanan customer:", error.message);
    }
    return [];
  }
  return (data as CustomerOrderSummary[] | null) ?? [];
});
