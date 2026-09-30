"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminUser,
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

/** Apakah sudah ada akun admin? (untuk menentukan halaman setup) */
export async function getAdminCountAction(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_admin_count");
  if (error) return -1;
  return (data as number) ?? 0;
}

const signupSchema = z.object({
  fullName: z.string().trim().min(2, "fullName"),
  email: z.string().trim().email("email"),
  password: z.string().min(8, "passwordTooShort"),
  confirmPassword: z.string(),
});

export async function signUpFirstAdminAction(
  _prev: ActionResult | null,
  formData: FormData
): Promise<ActionResult & { needsEmailConfirm?: boolean }> {
  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path[0];
    if (path === "confirmPassword") return { ok: false, error: "passwordMismatch" };
    return { ok: false, error: String(path ?? "generic") };
  }

  const { fullName, email, password, confirmPassword } = parsed.data;
  if (password !== confirmPassword) return { ok: false, error: "passwordMismatch" };

  const supabase = await createClient();

  // Hanya boleh jika belum ada admin sama sekali.
  const { data: count } = await supabase.rpc("public_admin_count");
  if ((count as number) > 0) return { ok: false, error: "not_authorized" };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    if (error.message.includes("rate limit") || error.message.includes("Email rate")) {
      return { ok: false, error: "rate_limited" };
    }
    return { ok: false, error: "signupFailed" };
  }

  // Kalau Supabase meminta konfirmasi email, session belum dibuat.
  if (!data.session) {
    return { ok: true, needsEmailConfirm: true };
  }

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "signupFailed" };

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

export async function setStockAction(
  flavorId: number,
  stock: number
): Promise<ActionResult> {
  if (!Number.isInteger(stock) || stock < 0) return { ok: false, error: "invalid_stock" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_stock", {
    p_flavor_id: flavorId,
    p_stock: stock,
    p_note: null,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/admin/menu");
  revalidatePath("/");
  revalidatePath("/order");
  return { ok: true };
}

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
