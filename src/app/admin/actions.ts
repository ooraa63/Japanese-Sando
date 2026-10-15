"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_PHOTO_BUCKET } from "@/lib/reviews";
import type {
  AdminReviewListResult,
  AdminUser,
  Category,
  DashboardStats,
  DeliveryZone,
  Order,
  OrderStatus,
  ProfileMenuItem,
  SalesSummary,
  SalesTransaction,
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
    "review_not_found",
    "flavor_not_found",
    "invalid_price",
    "invalid_payload",
    "invalid_stock",
    "slug_taken",
    // migration-54: mode combo (isi paket terkunci) — jumlah rasa yang
    // dicentang harus sama dengan jumlah slot.
    "invalid_bundle_fixed",
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
  offset = 0,
  /** Migration-51: batasi pesanan ke satu batch pre-order. Null = semua batch. */
  poBatchId?: number | null
): Promise<ActionResult<{ orders: Order[]; total: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_orders", {
    p_status: status,
    p_search: search.trim() || null,
    p_limit: limit,
    p_offset: offset,
    p_po_batch_id: poBatchId ?? null,
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

/**
 * Halaman Mutasi — daftar transaksi (sales history) + ringkasan revenue.
 *
 * Filter:
 *   - p_from_date / p_to_date (UTC, inclusive end-to-date = akhir hari)
 *   - p_flavor_id (null = semua rasa)
 *   - p_search (kode pesanan, nama, telepon)
 *
 * Hanya menghitung pesanan berstatus `accepted`, `ready`, `delivered`
 * sebagai revenue (lihat RPC admin_list_mutasi).
 */
export async function getMutasiAction(params: {
  fromDate?: string | null;
  toDate?: string | null;
  flavorId?: number | null;
  search?: string;
  limit?: number;
  offset?: number;
  /** Migration-51: batasi mutasi ke satu batch pre-order. Null = semua batch. */
  poBatchId?: number | null;
}): Promise<
  ActionResult<{
    summary: SalesSummary;
    transactions: SalesTransaction[];
    total: number;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_mutasi", {
    p_from_date: params.fromDate || null,
    p_to_date: params.toDate || null,
    p_flavor_id: params.flavorId ?? null,
    p_search: params.search?.trim() || null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
    p_po_batch_id: params.poBatchId ?? null,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  const payload = (data ?? {}) as {
    summary: SalesSummary;
    transactions: SalesTransaction[];
    total: number;
  };
  return {
    ok: true,
    data: {
      summary: payload.summary ?? {
        revenue_total: 0,
        orders_count: 0,
        pcs_sold: 0,
        revenue_today: 0,
        orders_today: 0,
        top_flavors: [],
      },
      transactions: payload.transactions ?? [],
      total: payload.total ?? 0,
    },
  };
}

/* ============================================================================
 *  DELIVERY ZONES (admin CRUD)
 * ========================================================================== */

export interface AdminDeliveryZone extends DeliveryZone {
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  requires_address: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export async function getDeliveryZonesAction(): Promise<ActionResult<AdminDeliveryZone[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_zones");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminDeliveryZone[]) ?? [] };
}

export async function saveDeliveryZoneAction(
  payload: Record<string, unknown>
): Promise<ActionResult<AdminDeliveryZone>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_upsert_zone", {
    p_payload: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: data as AdminDeliveryZone };
}

export async function deleteDeliveryZoneAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_zone", { p_id: id });
  if (error) return { ok: false, error: humanize(error.message) };
  revalidatePath("/admin/settings");
  return { ok: true };
}

/* ============================================================================
 *  ADMIN AKUN
 * ========================================================================== */

export async function getAdminsAction(): Promise<ActionResult<AdminUser[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminUser[]) ?? [] };
}

/**
 * Customer row dari `admin_list_customers()`. Sudah didedupe by
 * (email + phone_normalized) — 1 customer = 1 row.
 * Migration-31.
 */
export interface AdminCustomerRow {
  /** Synthetic id `email_key|phone_normalized` (gak ada di tabel orders). */
  id: string;
  customer_name: string;
  customer_email: string | null;
  instagram: string | null;
  phone: string;
  phone_normalized: string;
  /** Order code paling baru (untuk referensi). */
  last_order_code: string;
  /** Status order paling baru. */
  last_status: OrderStatus;
  /** ISO timestamp dari order pertama. */
  first_order_at: string;
  /** ISO timestamp dari order paling baru (dipakai untuk sorting). */
  last_order_at: string;
  /** Total order milik customer ini. */
  order_count: number;
  /** Total nominal seluruh order milik customer ini. */
  total_spent: number;
}

/**
 * Daftar pelanggan unik (phone_normalized) untuk broadcast. RPC publik
 * `admin_list_customers` sudah disiapkan di migration-12 (dan di-group ulang
 * per identitas di migration-31).
 */
export async function getCustomersAction(poBatchId?: number | null): Promise<
  ActionResult<AdminCustomerRow[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_customers", {
    p_po_batch_id: poBatchId ?? null,
  });
  if (error) return { ok: false, error: humanize(error.message) };
  return { ok: true, data: (data as AdminCustomerRow[]) ?? [] };
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

/**
 * Stok per-kategori. Penjual memilih menu dari halaman Menu & Stok, lalu
 * klik +/- untuk mengubah stok kategori.
 *
 * Catatan: RPC `admin_set_stock` versi lama (2 argumen, menulis ke
 * `store_settings.total_stock`) sudah TIDAK dipakai lagi — stok yang dibaca
 * `create_order` dan ditampilkan ke pembeli ada di `categories.stock`.
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

/* =============================================================================
 *  MENU PROFIL (sheet tab "Profil" di bottom nav)
 *  Bar menu + isi popup-nya dikelola penuh dari dashboard.
 *  Tabel & RPC: supabase/migration-41.sql
 * ========================================================================== */

export async function listProfileMenuItemsAction(): Promise<
  ActionResult<ProfileMenuItem[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || !data) return { ok: false, error: "not_authorized" };

  const { data: rows, error: sErr } = await supabase.rpc(
    "admin_list_profile_menu_items"
  );
  if (sErr) return { ok: false, error: humanize(sErr.message) };

  const payload = (rows ?? {}) as { items?: ProfileMenuItem[] };
  return { ok: true, data: payload.items ?? [] };
}

export async function saveProfileMenuItemAction(
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_profile_menu_item", {
    p_payload: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  // Sheet profil ada di root layout, jadi harus disegarkan dari root.
  revalidatePath("/", "layout");
  revalidatePath("/admin/profile-menu");
  return { ok: true };
}

export async function deleteProfileMenuItemAction(
  id: number
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_profile_menu_item", {
    p_id: id,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  revalidatePath("/admin/profile-menu");
  return { ok: true };
}

/* =============================================================================
 *  FAQ (isi halaman /faq + section FAQ di /contact)
 *  Sebelumnya hardcoded di src/lib/faq.ts. Sekarang pindah ke tabel
 *  `faq_items` (supabase/migration-46.sql) supaya penjual bisa menambah,
 *  mengubah, dan menyembunyikan pertanyaan dari dashboard.
 * ========================================================================== */

/** Bar FAQ versi admin: termasuk yang disembunyikan dari pembeli. */
export interface AdminFaqItem {
  id: number;
  question_id: string;
  question_en: string;
  answer_id: string;
  answer_en: string;
  sort_order: number;
  is_active: boolean;
}

export async function listFaqAction(): Promise<ActionResult<AdminFaqItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || !data) return { ok: false, error: "not_authorized" };

  const { data: rows, error: sErr } = await supabase.rpc("admin_list_faq");
  if (sErr) return { ok: false, error: humanize(sErr.message) };

  const payload = (rows ?? {}) as { items?: AdminFaqItem[] };
  return { ok: true, data: payload.items ?? [] };
}

export async function saveFaqAction(
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_faq", { p_payload: payload });
  if (error) return { ok: false, error: humanize(error.message) };

  // `/faq` dan `/contact` dua-duanya membaca isi yang sama, jadi keduanya
  // harus disegarkan.
  revalidatePath("/profile-menu/faq");
  revalidatePath("/profile-menu/contact");
  revalidatePath("/admin/faq");
  return { ok: true };
}

export async function deleteFaqAction(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_faq", { p_id: id });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/profile-menu/faq");
  revalidatePath("/profile-menu/contact");
  revalidatePath("/admin/faq");
  return { ok: true };
}

/* ==========================================================================
 *  SYARAT & KETENTUAN (isi halaman /syarat-ketentuan)
 *  Teksnya sebelumnya cuma satu kalimat di `profile_menu_items.body_id`, jadi
 *  tidak ada tempat yang bisa manage daftar bagian. Sekarang pindah ke tabel
 *  `terms_sections` (supabase/migration-47.sql), pola yang sama seperti FAQ.
 * ========================================================================== */

/** Bar Ketentuan versi admin: termasuk yang disembunyikan dari pembeli. */
export interface AdminTermItem {
  id: number;
  title_id: string;
  title_en: string;
  body_id: string;
  body_en: string;
  sort_order: number;
  is_active: boolean;
}

export async function listTermsAction(): Promise<ActionResult<AdminTermItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || !data) return { ok: false, error: "not_authorized" };

  const { data: rows, error: sErr } = await supabase.rpc("admin_list_terms");
  if (sErr) return { ok: false, error: humanize(sErr.message) };

  const payload = (rows ?? {}) as { items?: AdminTermItem[] };
  return { ok: true, data: payload.items ?? [] };
}

export async function saveTermsAction(
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_terms", { p_payload: payload });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/profile-menu/syarat-ketentuan");
  revalidatePath("/admin/terms");
  return { ok: true };
}

export async function deleteTermsAction(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_terms", { p_id: id });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/profile-menu/syarat-ketentuan");
  revalidatePath("/admin/terms");
  return { ok: true };
}

/* ==========================================================================
 *  BATCH PRE-ORDER (PO)
 *  Gantikan tombol buka/tutup pre-order. Setiap batch punya jendela pemesanan
 *  sendiri, satu tanggal pengambilan, dan stok sendiri per jenis menu.
 *  Tabel + RPC: supabase/migration-49.sql
 * ========================================================================== */

/** Status tampilan batch, dihitung di SQL supaya satu sumber kebenaran. */
export type PoBatchStatus = "buka" | "akan_dibuka" | "selesai" | "nonaktif";

export interface PoBatchStockCell {
  category_id: number;
  nama: string;
  stock: number;
}

export interface PoBatch {
  id: number;
  label: string;
  /** Tanggal ISO (YYYY-MM-DD). */
  open_at: string;
  close_at: string;
  pickup_date: string;
  is_active: boolean;
  status: PoBatchStatus;
  terjual: number;
  pcs_terjual: number;
  pendapatan: number;
  /** Di-index dengan String(category_id). */
  stok: Record<string, PoBatchStockCell>;
}

export interface PoCategoryLite {
  id: number;
  nama: string;
  aktif: boolean;
}

export interface PoData {
  batches: PoBatch[];
  kategori: PoCategoryLite[];
}

export async function listPoBatchesAction(): Promise<ActionResult<PoData>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || !data) return { ok: false, error: "not_authorized" };

  const { data: rows, error: sErr } = await supabase.rpc("admin_list_po_batches");
  if (sErr) return { ok: false, error: humanize(sErr.message) };

  const payload = (rows ?? {}) as Partial<PoData>;
  return { ok: true, data: { batches: payload.batches ?? [], kategori: payload.kategori ?? [] } };
}

export async function savePoBatchAction(
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_po_batch", { p_payload: payload });
  if (error) return { ok: false, error: humanize(error.message) };

  // Halaman beranda, /order, dan dashboard semua membaca batch.
  revalidatePath("/");
  revalidatePath("/order");
  revalidatePath("/admin");
  revalidatePath("/admin/po");
  return { ok: true };
}

export async function deletePoBatchAction(id: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_po_batch", { p_id: id });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/");
  revalidatePath("/order");
  revalidatePath("/admin");
  revalidatePath("/admin/po");
  return { ok: true };
}

/* ============================================================================
 *  DETAIL SATU BATCH — dipakai halaman /admin/po/[id]
 * ========================================================================== */

/** Baris stok per jenis menu di satu batch. */
export interface PoBatchStockRow {
  category_id: number;
  nama: string;
  /** Sisa stok yang masih bisa dipesan. */
  sisa: number;
  /** PCS yang sudah terjual di batch ini (rejected/cancelled tidak dihitung). */
  terjual: number;
  /** Diturunkan: sisa + terjual. Stok awal tidak disimpan di database. */
  stok_awal: number;
}

/** Bundle (paket) yang bisa dipilih Steven untuk satu batch (migration-52). */
export interface PoBatchBundleRow {
  bundle_id: number;
  nama: string;
  desc: string;
  /** Harga bawaan dari tabel `bundles`. */
  harga_bawaan: number;
  /** Berapa pcs yang harus dipilih pembeli untuk satu paket. */
  required_qty: number;
  /** True kalau bundle ini dipakai di batch ini. */
  dipakai: boolean;
  /**
   * Harga khusus batch. Tidak bisa diset dari UI lagi (14-10-2026) dan
   * selalu null di database — harga Effective tetap mengikuti menu utama.
   */
  harga_batch: number | null;
}

export interface PoBatchDetailSummary {
  terjual: number;
  pcs_terjual: number;
  pendapatan: number;
  pending: number;
  selesai: number;
  ditolak: number;
}

export interface PoBatchDetail {
  batch: {
    id: number;
    label: string;
    open_at: string;
    close_at: string;
    pickup_date: string;
    is_active: boolean;
    status: PoBatchStatus;
  };
  stok: PoBatchStockRow[];
  /** Semua bundle aktif + apakah dipakai di batch ini (migration-52). */
  bundles: PoBatchBundleRow[];
  /** True = belum pernah diset, semua bundle aktif boleh dipakai. */
  semua_bundle_aktif: boolean;
  /**
   * Semua rasa aktif + apakah ditampilkan di batch ini (migration-53).
   * Steven mencentang rasa yang mau dimunculin di batch ini.
   */
  flavors: PoBatchFlavorRow[];
  /** True = belum pernah diset, semua rasa aktif ditampilkan. */
  semua_rasa_aktif: boolean;
  ringkasan: PoBatchDetailSummary;
}

/** Satu rasa yang bisa ditampilkan di batch (migration-53). */
export interface PoBatchFlavorRow {
  flavor_id: number;
  nama: string;
  category_id: number | null;
  harga: number;
  /** true = Steven mencentang rasa ini untuk batch ini. */
  dipakai: boolean;
}

const EMPTY_DETAIL_SUMMARY: PoBatchDetailSummary = {
  terjual: 0,
  pcs_terjual: 0,
  pendapatan: 0,
  pending: 0,
  selesai: 0,
  ditolak: 0,
};

/**
 * Detail satu batch: header, rincian stok per jenis menu, dan ringkasan
 * pesanan. RPC `admin_list_po_batch_detail` (migration-51).
 *
 * Kalau batch tidak ada, kembalikan `ok: false` dengan `not_found` supaya
 * halaman bisa menampilkan "batch tidak ada" alih-alih crash.
 */
export async function getPoBatchDetailAction(
  batchId: number
): Promise<ActionResult<PoBatchDetail>> {
  if (!Number.isInteger(batchId) || batchId <= 0) {
    return { ok: false, error: "not_found" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_po_batch_detail", {
    p_batch_id: batchId,
  });
  if (error) {
    if (error.message.includes("batch_not_found")) {
      return { ok: false, error: "not_found" };
    }
    return { ok: false, error: humanize(error.message) };
  }

  const payload = (data ?? {}) as Partial<PoBatchDetail>;
  if (!payload.batch) return { ok: false, error: "not_found" };

  return {
    ok: true,
    data: {
      batch: payload.batch,
      stok: payload.stok ?? [],
      bundles: payload.bundles ?? [],
      semua_bundle_aktif: payload.semua_bundle_aktif ?? true,
      flavors: payload.flavors ?? [],
      semua_rasa_aktif: payload.semua_rasa_aktif ?? true,
      ringkasan: payload.ringkasan ?? EMPTY_DETAIL_SUMMARY,
    },
  };
}

/**
 * Simpan stok per jenis menu untuk satu batch (migration-52).
 *
 * `stock` boleh berisi kategori yang tidak ada di `stok` (kategori baru yang
 * Steven set sekarang juga) dan kategori yang di-row `stok` tapi tidak disebut
 * akan dihapus — jadi yang tersimpan selalu sama persis dengan yang terlihat
 * di layar.
 */
export async function savePoBatchStockAction(
  batchId: number,
  stock: Record<string, number>
): Promise<ActionResult<Array<{ category_id: number; stock: number }>>> {
  const payload: Record<string, { stock: number }> = {};
  for (const [key, value] of Object.entries(stock)) {
    const catId = Number(key);
    if (!Number.isInteger(catId) || catId <= 0) continue;
    payload[key] = { stock: Math.max(0, Math.floor(Number(value) || 0)) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_po_batch_stock", {
    p_batch_id: batchId,
    p_stock: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin");
  revalidatePath("/admin/po");
  revalidatePath(`/admin/po/${batchId}`);
  revalidatePath("/order");
  revalidatePath("/");
  const hasil = data as { stok?: Array<{ category_id: number; stock: number }> } | null;
  return { ok: true, data: hasil?.stok ?? [] };
}

/**
 * Simpan bundle yang ditawarkan untuk satu batch (migration-52).
 *
 * Array KOSONG berarti "semua bundle aktif boleh dipakai" (mode lama) —
 * itulah perilaku default untuk batch yang belum pernah diset.
 *
 * Steven 14-10-2026: "untuk harga tetap ikutin yang utama jadi kita gabisa set
 * harga disini". Karena itu action ini HANYA menerima daftar id paket; kolom
 * `price` selalu dikirim `null`, sehingga `public_po_batch_for_date` jatuh ke
 * `coalesce(pb.price, bu.price)` = harga di menu utama. Harga paket diubah dari
 * halaman Menu, bukan dari halaman batch.
 */
export async function savePoBatchBundlesAction(
  batchId: number,
  bundleIds: number[]
): Promise<ActionResult> {
  const payload = bundleIds
    .filter((id) => Number.isInteger(id) && id > 0)
    .map((id) => ({ bundle_id: id, price: null, is_active: true }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_po_batch_bundles", {
    p_batch_id: batchId,
    p_bundles: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/po");
  revalidatePath(`/admin/po/${batchId}`);
  revalidatePath("/order");
  revalidatePath("/");
  return { ok: true };
}

/* =============================================================================
 *  PENGUMUMAN (popup promo di web pembeli)
 *  Steven 14-10-2026: "di admin bisa set pemberitahuan, seperti mungkin ada
 *  promo atau apa langsung muncul untuk semua".
 *
 *  Tabel + RPC-nya sudah ada sejak migration-13, tapi belum pernah dipakai,
 *  jadi dashboard ini yang pertama kali mengelolanya lewat UI.
 * ========================================================================== */

/** Bar pengumuman versi admin: termasuk yang disembunyikan dari pembeli. */
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

export async function listAnnouncementsAction(): Promise<
  ActionResult<AdminAnnouncement[]>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error || !data) return { ok: false, error: "not_authorized" };

  const { data: rows, error: sErr } = await supabase.rpc(
    "admin_list_announcements"
  );
  if (sErr) return { ok: false, error: humanize(sErr.message) };

  // `admin_list_announcements` mengembalikan jsonb ARRAY langsung (bukan
  // objek `{ items }` seperti RPC FAQ/terms), jadi bentuknya dibungkus di
  // array supaya tetap aman kalau server membalas null.
  const payload = (rows ?? []) as AdminAnnouncement[];
  return { ok: true, data: Array.isArray(payload) ? payload : [] };
}

export async function saveAnnouncementAction(
  payload: Record<string, unknown>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_announcement", {
    p_payload: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  // Popup pengumuman dibaca pembeli dari beranda, jadi root ikut disegarkan.
  revalidatePath("/", "layout");
  revalidatePath("/admin/announcements");
  return { ok: true };
}

export async function deleteAnnouncementAction(
  id: number
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_delete_announcement", {
    p_id: id,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  revalidatePath("/admin/announcements");
  return { ok: true };
}

/* =============================================================================
 *  ULASAN PEMBELI (migration-58)
 * ========================================================================== */

/**
 * Semua ulasan untuk halaman admin, termasuk yang disembunyikan.
 *
 * `admin_list_reviews` sudah memanggil `is_admin()` sendiri dan mengembalikan
 * NULL kalau pemanggil bukan admin, jadi pemeriksa `is_admin` di sini
 * cuma supaya pesannya jelas ("not_authorized") dan bukan `data: null` yang
 * membuat halaman kosong tanpa penjelasan.
 */
export async function listAdminReviewsAction(): Promise<
  ActionResult<AdminReviewListResult>
> {
  const supabase = await createClient();
  const { data: isAdmin, error: aErr } = await supabase.rpc("is_admin");
  if (aErr || !isAdmin) return { ok: false, error: "not_authorized" };

  const { data, error } = await supabase.rpc("admin_list_reviews");
  if (error) return { ok: false, error: humanize(error.message) };
  if (!data) return { ok: false, error: "not_authorized" };

  return {
    ok: true,
    data: data as AdminReviewListResult,
  };
}

/**
 * Sembunyikan / tampilkan lagi ulasan.
 *
 * Ini aksi yang dipakai admin PERTAMA KALI. Kalau ulasan ternyata tidak
 * bermasalah, tombol "Tampilkan lagi" mengembalikannya tanpa data hilang --
 * berbeda dengan `deleteAdminReviewAction` yang permanen.
 */
export async function setReviewVisibilityAction(
  reviewId: number,
  visible: boolean
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_review_visible", {
    p_review_id: reviewId,
    p_visible: visible,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  revalidatePath("/admin/reviews");
  return { ok: true };
}

/**
 * Hapus ulasan permanen, termasuk SEMUA fotonya di storage.
 *
 * Urutannya penting: RPC dulu (hapus baris), baru file. Kalau file dihapus
 * lebih dulu dan RPC-nya gagal, pembeli kehilangan foto tanpa alasan. Setelah
 * baris hilang, RPC mengembalikan daftar `photo_paths` (JSON array) supaya
 * semua file bisa dibersihkan sekaligus.
 *
 * Kegagalan hapus file TIDAK membatalkan aksi: baris ulasan sudah hilang,
 * jadi dari sisi pembeli produknya sudah bersih. File sisa hanya memakan
 * ruang di bucket.
 */
export async function deleteAdminReviewAction(
  reviewId: number
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_review", {
    p_review_id: reviewId,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  const hasil = (data ?? {}) as { photo_paths?: unknown };
  const paths = Array.isArray(hasil.photo_paths)
    ? (hasil.photo_paths as unknown[]).filter(
        (p): p is string => typeof p === "string" && p.length > 0
      )
    : [];
  if (paths.length > 0) {
    try {
      await supabase.storage.from(REVIEW_PHOTO_BUCKET).remove(paths);
    } catch {
      // Bucket penuh atau policy berubah. Ulasannya tetap sudah terhapus.
    }
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/reviews");
  return { ok: true };
}

/**
 * Simpan daftar rasa yang ditampilkan di satu batch (migration-53).
 *
 * Array KOSONG berarti "semua rasa aktif boleh ditampilkan" (mode lama).
 * Begitu Steven mencentang satu rasa, itu yang berlaku — pembeli hanya
 * melihat rasa yang dicentang untuk batch tersebut.
 */
export async function savePoBatchFlavorsAction(
  batchId: number,
  flavors: number[]
): Promise<ActionResult> {
  const payload = flavors
    .filter((id) => Number.isInteger(id) && id > 0)
    .map((id) => ({ flavor_id: id, is_active: true }));

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_save_po_batch_flavors", {
    p_batch_id: batchId,
    p_flavors: payload,
  });
  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/po");
  revalidatePath(`/admin/po/${batchId}`);
  revalidatePath("/order");
  revalidatePath("/");
  return { ok: true };
}
