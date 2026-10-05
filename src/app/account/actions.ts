"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/* =============================================================================
 *  AUTENTIKASI CUSTOMER (buyer)
 * ========================================================================== */

export interface CustomerActionResult<T = undefined> {
  ok: boolean;
  data?: T;
  error?: string;
}

function humanize(error: string | undefined): string {
  if (!error) return "generic";
  const code = error.trim();
  const known = [
    "invalid_email",
    "invalid_instagram",
    "invalid_phone",
    "invalid_name",
    "name_too_long",
    "weak_password",
    "email_taken",
    "user_not_found",
    "signup_failed",
    "not_authenticated",
    "generic",
  ];
  return known.includes(code) ? code : "generic";
}

/**
 * Daftar akun customer baru.
 *
 * Alur:
 * 1. signUp via Supabase Auth (membuat user di auth.users + otomatis
 *    mengirim cookie sesi ke browser).
 * 2. Simpan profil (nama, telepon, IG) via RPC `customer_upsert_own_profile`
 *    yang berjalan dengan security definer + auth.uid().
 *
 * PENTING: Supabase Auth harus punya "Confirm email" yang dimatikan,
 * kalau tidak sesi null dan user harus verifikasi email dulu. Lihat
 * ADMIN-ACCOUNT.md untuk setup.
 */
export async function signUpCustomerAction(
  _prev: CustomerActionResult | null,
  formData: FormData
): Promise<CustomerActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const instagram = String(formData.get("instagram") ?? "").trim().replace(/^@/, "");

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "invalid_email" };
  if (password.length < 8) return { ok: false, error: "weak_password" };
  if (fullName.length < 2) return { ok: false, error: "invalid_name" };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "invalid_phone" };

  const supabase = await createClient();

  // 1. Daftar user di Supabase Auth. Cookie sesi akan ter-set jika
  //    "Confirm email" disabled.
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (signUpError) {
    // Email sudah dipakai? Jangan bocorkan apakah email terdaftar.
    return { ok: false, error: "email_taken" };
  }

  const newId = signUp.user?.id;
  if (!newId) {
    // Tidak ada sesi = "Confirm email" enabled dan user belum verifikasi.
    return { ok: false, error: "signup_failed" };
  }

  // 2. Simpan profil identitas di customer_profiles via RPC.
  //    RPC ini akan raise exception kalau validasi gagal — kita petakan
  //    ke error code yang sudah ada di tabel humanize.
  const { error: profileErr } = await supabase.rpc("customer_upsert_own_profile", {
    p_full_name: fullName,
    p_phone: phone,
    p_instagram: instagram || null,
  });

  if (profileErr) {
    // Kalau profil gagal disimpan, hapus auth user supaya tidak ada
    // akun tanpa profil (best-effort). signOut untuk membersihkan sesi.
    await supabase.auth.signOut();
    return { ok: false, error: humanize(profileErr.message) };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Login untuk customer yang sudah punya akun. */
export async function signInCustomerAction(
  _prev: CustomerActionResult | null,
  formData: FormData
): Promise<CustomerActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { ok: false, error: "invalid_email" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (/invalid login credentials/i.test(error.message)) {
      return { ok: false, error: "user_not_found" };
    }
    if (/unexpected_failure|querying schema|internal/i.test(error.message)) {
      return { ok: false, error: "generic" };
    }
    return { ok: false, error: "user_not_found" };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Logout customer — hapus sesi + redirect ke beranda. */
export async function signOutCustomerAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Update identitas customer yang sedang login (nama, telepon, IG).
 * Dipakai dari halaman /account.
 */
const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9),
  instagram: z.string().trim().max(40).optional().nullable(),
});

export async function updateCustomerProfileAction(
  _prev: CustomerActionResult | null,
  formData: FormData
): Promise<CustomerActionResult> {
  const parsed = profileSchema.safeParse({
    fullName: String(formData.get("fullName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    instagram: String(formData.get("instagram") ?? "")
      .trim()
      .replace(/^@/, "")
      .replace(/\s/g, "") || null,
  });
  if (!parsed.success) return { ok: false, error: "invalid_payload" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_upsert_own_profile", {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_instagram: parsed.data.instagram,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  revalidatePath("/account");
  return { ok: true };
}