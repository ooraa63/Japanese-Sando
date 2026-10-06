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
  /**
   * True kalau signup berhasil & Supabase mengirim email verifikasi, dan
   * sesi belum aktif (Confirm email ON). UI menampilkan "cek email kamu".
   */
  requiresVerification?: boolean;
  /** URL untuk OAuth redirect (Google, dsb). Browser yang navigasi ke sini. */
  redirectUrl?: string;
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
    "phone_taken",
    "user_not_found",
    "signup_failed",
    "not_authenticated",
    "invalid_date_of_birth",
    "phone_already_registered",
    "generic",
  ];
  return known.includes(code) ? code : "generic";
}

/**
 * Validasi tanggal lahir — ISO YYYY-MM-DD, usia minimum 13 tahun (mengikuti
 * kebanyakan eCommerce), BUKAN di masa depan.
 */
function parseDateOfBirth(s: string): string | null {
  if (!s) return null;
  // Tolak kalau bukan YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d.getTime() > now.getTime()) return null;
  // Umur minimum 13 tahun
  const thirteenYearsAgo = new Date(now);
  thirteenYearsAgo.setUTCFullYear(thirteenYearsAgo.getUTCFullYear() - 13);
  if (d.getTime() > thirteenYearsAgo.getTime()) return null;
  return s;
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
  const dobRaw = String(formData.get("dateOfBirth") ?? "").trim();

  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: "invalid_email" };
  if (password.length < 8) return { ok: false, error: "weak_password" };
  if (fullName.length < 2) return { ok: false, error: "invalid_name" };
  if (phone.replace(/\D/g, "").length < 9) return { ok: false, error: "invalid_phone" };

  const dob = parseDateOfBirth(dobRaw);
  if (dobRaw && !dob) return { ok: false, error: "invalid_date_of_birth" };

  const supabase = await createClient();

  // Pre-check: phone sudah dipakai customer lain? Kalau ya, tolak sebelum
  // create auth.users — supaya tidak ada akun yatim yang harus dihapus.
  const { data: phoneOk, error: phoneCheckErr } = await supabase.rpc(
    "is_phone_available",
    { p_phone: phone }
  );
  if (phoneCheckErr) {
    return { ok: false, error: "generic" };
  }
  if (phoneOk === false) {
    return { ok: false, error: "phone_taken" };
  }

  // 1. Daftar user di Supabase Auth. Field identitas disimpan ke
  //    raw_user_meta_data supaya bisa di-bootstrap setelah verifikasi
  //    email (kalau "Confirm email" ON di Supabase).
  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        phone,
        instagram,
        date_of_birth: dob,
      },
    },
  });

  if (signUpError) {
    if (/already registered|already been registered/i.test(signUpError.message)) {
      return { ok: false, error: "email_taken" };
    }
    if (/password/i.test(signUpError.message) && /short|characters/i.test(signUpError.message)) {
      return { ok: false, error: "weak_password" };
    }
    if (/email/i.test(signUpError.message) && /invalid/i.test(signUpError.message)) {
      return { ok: false, error: "invalid_email" };
    }
    return { ok: false, error: "signup_failed" };
  }

  const newId = signUp.user?.id;
  if (!newId) {
    return { ok: false, error: "signup_failed" };
  }

  // 2a. Kalau sesi aktif (Confirm email OFF), langsung simpan profil.
  if (signUp.session) {
    const { error: profileErr } = await supabase.rpc("customer_upsert_own_profile", {
      p_full_name: fullName,
      p_phone: phone,
      p_instagram: instagram || null,
      p_date_of_birth: dob,
    });

    if (profileErr) {
      await supabase.auth.signOut();
      return { ok: false, error: humanize(profileErr.message) };
    }
    revalidatePath("/", "layout");
    return { ok: true };
  }

  // 2b. Confirm email ON: sesi null. Identitas sudah di user_metadata.
  //     Setelah user verifikasi email + login, RPC
  //     `customer_bootstrap_from_metadata` akan membuat customer_profiles.
  revalidatePath("/", "layout");
  return { ok: true, requiresVerification: true };
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
    if (/email not confirmed|email_not_confirmed|not.*verified/i.test(error.message)) {
      return { ok: false, error: "email_not_verified" };
    }
    if (/invalid login credentials/i.test(error.message)) {
      return { ok: false, error: "user_not_found" };
    }
    if (/unexpected_failure|querying schema|internal/i.test(error.message)) {
      return { ok: false, error: "generic" };
    }
    return { ok: false, error: "user_not_found" };
  }

  // Login sukses. Kalau customer_profiles belum ada (mis. signup dengan
  // Confirm email ON), bootstrap dari user_metadata. Best-effort — kalau
  // RPC gagal, login tetap dianggap sukses, user bisa isi profil di /account.
  try {
    await supabase.rpc("customer_bootstrap_from_metadata");
  } catch (e) {
    console.warn("customer_bootstrap_from_metadata gagal:", e);
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
 * Update identitas customer yang sedang login (nama, telepon, IG, DOB).
 * Dipakai dari halaman /account.
 */
const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(9),
  instagram: z.string().trim().max(40).optional().nullable(),
  dateOfBirth: z.string().trim().optional().nullable(),
});

export async function updateCustomerProfileAction(
  _prev: CustomerActionResult | null,
  formData: FormData
): Promise<CustomerActionResult> {
  const raw = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    instagram:
      String(formData.get("instagram") ?? "")
        .trim()
        .replace(/^@/, "")
        .replace(/\s/g, "") || null,
    dateOfBirth: String(formData.get("dateOfBirth") ?? "").trim() || null,
  };
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid_payload" };

  // Validasi tanggal lahir (kalau diisi)
  let dob: string | null = null;
  if (parsed.data.dateOfBirth) {
    dob = parseDateOfBirth(parsed.data.dateOfBirth);
    if (!dob) return { ok: false, error: "invalid_date_of_birth" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("customer_upsert_own_profile", {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_instagram: parsed.data.instagram,
    p_date_of_birth: dob,
  });

  if (error) return { ok: false, error: humanize(error.message) };

  revalidatePath("/", "layout");
  revalidatePath("/account");
  return { ok: true };
}

/* =============================================================================
 *  OAUTH (Google sign-in)
 * ========================================================================== */

/**
 * Mulai OAuth flow (mis. Google). Sign-in & sign-up pakai flow yang sama —
 * Supabase akan otomatis buat akun kalau email belum terdaftar (kalau
 * "Confirm email" OFF) atau kirim link verifikasi (kalau ON).
 *
 * Return `redirectUrl` untuk di-navigate oleh client (`window.location`).
 * Kalau dipanggil dari server langsung (mis. link HTML biasa), pakai
 * `redirect()` ke URL.
 */
export async function signInWithOAuthAction(
  provider: "google" | "github" | "apple" | "facebook"
): Promise<CustomerActionResult<{ url: string }>> {
  const supabase = await createClient();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/account?oauth=1`,
      queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
    },
  });

  if (error) {
    return { ok: false, error: humanize(error.message) };
  }
  if (!data?.url) {
    return { ok: false, error: "oauth_unavailable" };
  }
  return { ok: true, data: { url: data.url } };
}