"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminUser,
  Category,
  DashboardStats,
  Order,
  OrderStatus,
  StoreSettings,
} from "@/lib/types";

/* =============================================================================
 *  AUTENTIKASI
 * ========================================================================== */

export interface ActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

/** Pesan error Postgres -> bahasa manusia. */
function humanize(error: string | undefined): string {
  if (!error) return "generic";
  const code = error.trim();
  const known = [
    "invalid_email",
    "invalid_instagram",
    "user_not_found",
    "last_admin",
    "invalid_name",
    "name_too_long",
    "invalid_phone",
    "invalid_payment_method",
    "invalid_delivery_method",
    "address_required",
    "proof_required",
    "empty_cart",
    "too_many_items",
    "invalid_quantity",
    "flavor_unavailable",
    "insufficient_stock",
    "below_min_order",
    "preorder_closed",
    "settings_missing",
    "not_authorized",
    "status_unchanged",
    "order_not_found",
    "flavor_not_found",
    "invalid_price",
    "invalid_payload",
    "invalid_stock",
    "slug_taken",
  ];
  return known.includes(code) ? code : "generic";
}

export async function signInAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // GoTrue kadang balas 500 (mis. "Database error querying schema") kalau
    // sisi database project bermasalah. Itu bukan password salah, jadi
    // kasih pesan yang berbeda supaya tidak membingungkan.
    if (/unexpected_failure|querying schema|internal/i.test(error.message)) {
      return { ok: false, error: "authUnavailable" };
    }
    return { ok: false, error: "invalid" };
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) {
    await supabase.auth.signOut();
    return { ok: false, error: "not_authorized" };
  }

  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}

/**
 * Berapa akun admin yang terdaftar. Berguna untuk memastikan akun yourself
 * sudah masuk tabel `admins` (bisa dicek dari dashboard lewat SQL).
 */
export async function getAdminCountAction(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_admin_count");
  if (error) return -1;
  return (data as number) ?? 0;
}

/**
 * Menambahkan akun admin.
 *
 * DIHAPUS dari antarmuka (form login tidak lagi menampilkan "buat akun"),
 * karena pendaftaran lewat website bisa membuat akun yang tidak punya izin
 * dan membingungkan. Akun dibuat dari dashboard Supabase:
 *   Authentication -> Users -> Add user
 * User pertama yang dibuat otomatis masuk tabel `admins` oleh trigger
 * `on_first_user_created`. Untuk user berikutnya, jalankan SQL ini di
 * SQL Editor Supabase:
 *
 *   insert into public.admins (user_id, email, full_name, role)
 *   select id, email, raw_user_meta_data->>'full_name', 'staff'
 *   from auth.users where email = 'email-kamu@example.com'
 *   on conflict (user_id) do update set is_active = true;
 */
export async function grantAdminRoleAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "invalid_email" };

  const supabase = await createClient();

  // Hanya admin yang sudah aktif boleh menambah admin lain.
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "not_authorized" };

  const { data: users, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) return { ok: false, error: "generic" };

  const user = users?.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) return { ok: false, error: "user_not_found" };

  const { error } = await supabase.from("admins").upsert(
    {
      user_id: user.id,
      email: user.email ?? email,
      full_name:
        (user.user_metadata?.full_name as string | undefined) ?? "",
      role: "staff",
      is_active: true,
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: "generic" };

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Mencabut akses admin dari sebuah akun. */
export async function revokeAdminRoleAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { ok: false, error: "invalid_email" };

  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "not_authorized" };

  // Jangan sampai admin terakhir kehilangan akses.
  const { count } = await supabase
    .from("admins")
    .select("user_id", { count: "exact", head: true })
    .eq("is_active", true);
  if ((count ?? 0) <= 1) return { ok: false, error: "last_admin" };

  const { error } = await supabase
    .from("admins")
    .update({ is_active: false })
    .eq("user_id", userId);
  if (error) return { ok: false, error: "generic" };

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/* =============================================================================
 *  PEMBACAAN DATA ADMIN
 * ========================================================================== */

export async function getDashboardStatsAction(): Promise<
  ActionResult<DashboardStats>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: data as DashboardStats };
}

export async function getOrdersAction(
  status: OrderStatus | null,
  search: string,
  limit = 60,
  offset = 0
): Promise<ActionResult<{ orders: Order[]; total: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_orders", {
    p_status: status,
    p_search: search.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  const payload = data as { orders: Order[]; total: number };
  return { ok: true, data: { orders: payload.orders ?? [], total: payload.total ?? 0 } };
}

export async function getSettingsAction(): Promise<ActionResult<StoreSettings>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || !data) return { ok: false, error: "not_authorized" };

  const { data: settings, error: sErr } = await supabase
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (sErr) return { ok: false, error: "generic" };
  return { ok: true, data: settings as StoreSettings };
}

export async function getAdminsAction(): Promise<ActionResult<AdminUser[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminUser[]) ?? [] };
}

export interface AdminCustomerRow {
  id: number;
  order_code: string;
  customer_name: string;
  customer_email: string | null;
  instagram: string | null;
  phone: string;
  phone_normalized: string;
  created_at: string;
  status: OrderStatus;
  order_count: number;
  total_spent: number;
}

export interface AdminAnnouncement {
  id: number;
  title: string;
  body_md: string;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

/**
 * Daftar pelanggan unik (phone_normalized) untuk broadcast. RPC publik
 * `admin_list_customers` sudah disiapkan di migration-12.
 */
export async function getCustomersAction(): Promise<
  ActionResult<AdminCustomerRow[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_customers");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminCustomerRow[]) ?? [] };
}

/* =============================================================================
 *  ANNOUNCEMENTS (popup iklan di homepage)
 * ========================================================================== */

export async function getAnnouncementsAction(): Promise<
  ActionResult<AdminAnnouncement[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_announcements");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminAnnouncement[]) ?? [] };
}

export async function saveAnnouncementAction(
  payload: Record<string, unknown>
): Promise<ActionResult<{ id: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_announcement", {
    p_payload: payload,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/announcements");
  revalidatePath("/");
  return { ok: true, data: { id: (data as { id: number }).id } };
}

export async function deleteAnnouncementAction(
  id: number
): Promise<ActionResult<{ deleted: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_announcement", {
    p_id: id,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/announcements");
  revalidatePath("/");
  return { ok: true, data: data as { deleted: boolean } };
}

/* =============================================================================
 *  UBAH DATA
 * ========================================================================== */

const orderStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "ready",
  "delivered",
  "cancelled",
]);

export async function updateOrderStatusAction(
  orderId: number,
  newStatus: string,
  adminNote?: string
): Promise<ActionResult> {
  const status = orderStatusSchema.safeParse(newStatus);
  if (!status.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_order_status", {
    p_order_id: orderId,
    p_new_status: status.data,
    p_admin_note: adminNote?.trim() || null,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/menu");
  return { ok: true };
}

export async function saveFlavorAction(
  payload: Record<string, unknown>
): Promise<ActionResult<{ id: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_flavor", { p_payload: payload });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: { id: (data as { id: number }).id } };
}

export async function deleteFlavorAction(
  flavorId: number
): Promise<ActionResult<{ deactivated: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_flavor", {
    p_flavor_id: flavorId,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: data as { deactivated: boolean } };
}

export async function saveBundleAction(
  payload: Record<string, unknown>
): Promise<ActionResult<{ id: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_bundle", { p_payload: payload });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: { id: (data as { id: number }).id } };
}

export async function deleteBundleAction(
  bundleId: number
): Promise<ActionResult<{ deactivated: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_bundle", {
    p_bundle_id: bundleId,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: data as { deactivated: boolean } };
}

export async function setStockAction(
  totalStock: number
): Promise<ActionResult<{ total_stock: number; previous: number }>> {
  if (!Number.isInteger(totalStock) || totalStock < 0) {
    return { ok: false, error: "invalid_stock" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_stock", {
    p_stock: totalStock,
    p_note: null,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: data as { total_stock: number; previous: number } };
}

/**
 * Stok per-kategori (ganti `setStockAction`). Penjual memilih menu dari
 * halaman Menu & Stok, lalu klik +/- untuk mengubah stok kategori.
 */
export async function setCategoryStockAction(
  categoryId: number,
  stock: number
): Promise<ActionResult<{ stock: number; previous: number }>> {
  if (!Number.isInteger(stock) || stock < 0) {
    return { ok: false, error: "invalid_stock" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_category_stock", {
    p_category_id: categoryId,
    p_stock: stock,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: data as { stock: number; previous: number } };
}

export async function togglePreorderAction(open: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_toggle_preorder", { p_open: open });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  return { ok: true };
}

/* =============================================================================
 *  KATEGORI MAKANAN
 * ========================================================================== */

export async function getCategoriesAction(): Promise<ActionResult<Category[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_categories");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as Category[]) ?? [] };
}

export async function getBundlesAction(): Promise<
  ActionResult<
    Array<{
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
    }>
  >
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_bundles");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as Array<{
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
  }>) ?? [] };
}

export async function saveCategoryAction(
  payload: Record<string, unknown>
): Promise<ActionResult<{ id: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_category", {
    p_payload: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: { id: (data as { id: number }).id } };
}

export async function deleteCategoryAction(
  categoryId: number
): Promise<ActionResult<{ deactivated: boolean }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_category", {
    p_category_id: categoryId,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true, data: data as { deactivated: boolean } };
}

export async function getAdminAccountsAction(): Promise<ActionResult<AdminUser[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminUser[]) ?? [] };
}

/** Cabut akses dashboard dari sebuah akun (akun Supabase-nya tetap ada). */
export async function revokeAdminAction(userId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_revoke_user", { p_user_id: userId });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin", "layout");
  return { ok: true };
}

/**
 * Buat akun admin baru.
 *
 * Dua langkah: daftarkan user-nya di Supabase lewat signup, lalu beri akses
 * admin. Butuh "Confirm email" dimatikan di dashboard Supabase, kalau tidak
 * user-nya belum terverifikasi sehingga tidak bisa masuk.
 */
export async function createAdminAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "invalid_email" };
  if (password.length < 8) return { ok: false, error: "weak_password" };
  if (fullName.length < 2) return { ok: false, error: "invalid_name" };

  const supabase = await createClient();

  // Hanya admin aktif yang boleh menambah admin lain
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "not_authorized" };

  // 1. Daftarkan user di Supabase
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (signUpError) {
    // Sudah terdaftar? Coba beri akses saja (user mungkin dibuat manual).
    const { data: granted } = await supabase.rpc("admin_grant_user", { p_email: email });
    if (granted) return { ok: true };
    return { ok: false, error: "email_taken" };
  }

  const newId = signUp.user?.id;
  if (!newId) return { ok: false, error: "signup_failed" };

  // 2. Beri akses admin
  const { error: grantError } = await supabase
    .from("admins")
    .upsert(
      {
        user_id: newId,
        email,
        full_name: fullName,
        role: "owner",
        is_active: true,
      },
      { onConflict: "user_id" }
    );

  if (grantError) return { ok: false, error: "signup_failed" };

  revalidatePath("/admin", "layout");
  revalidatePath("/admin/settings");
  return { ok: true };
}

/* =============================================================================
 *  BATCH PRE-ORDER — SUDAH DIHAPUS
 *  Fitur batch tidak dipakai, jadi tabel & RPC-nya sudah di-drop
 *  (lihat supabase/migration-3.sql).
 * ========================================================================== */

export async function saveSettingsAction(
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_settings", { p_payload: payload });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  revalidatePath("/admin/settings");
  return { ok: true };
}
