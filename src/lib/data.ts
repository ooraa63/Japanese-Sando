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
 * Menu dua tingkat: kategori -> rasa.
 * Satu panggilan RPC supaya tidak perlu join di client.
 */
export const getPublicMenu = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_menu");

  if (error) {
    console.error("Gagal memuat menu:", error.message);
    return [];
  }
  return (data as Category[]) ?? [];
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
