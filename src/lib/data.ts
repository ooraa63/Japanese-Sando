import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Category, Flavor, StoreSettings } from "@/lib/types";

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
  return {
    categories: obj.categories ?? [],
    bundles: obj.bundles ?? [],
  };
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
