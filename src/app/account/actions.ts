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
   * Kode error mentah dari server (Postgres SQLSTATE, dll) untuk debugging
   * UI. BUKAN untuk ditampilkan langsung ke user — UI harus pakai `error`
   * yang sudah di-humanize.
   */
  errorDebug?: string;
  /**
   * True kalau signup berhasil & Supabase mengirim email verifikasi, dan
   * sesi belum aktif (Confirm email ON). UI menampilkan "cek email kamu".
   */
  requiresVerification?: boolean;
  /** URL untuk OAuth redirect (Google, dsb). Browser yang navigasi ke sini. */
  redirectUrl?: string;
}

/** Kode error lama untuk OAuth — sudah tidak dipakai sejak OAuth dihapus
 * (lihat keputusan D26 di MEMORY/decisions.md). Constant-nya dihapus; kalau
 * RPC lama masih return string `oauth_unavailable` / `oauth_failed`,
 * `humanize()` tetap memetakan hal tak dikenal ke "generic". */

// Helper error code lama untuk OAuth — sekarang gak dipakai (lihat blok
// "OAUTH — DISABLED" di bawah). Tapi dipertahankan kalau ada RPC lama
// yang masih return string ini — biar humanize() gak throw.
//
// Terima PostgrestError (punya `.code` SQLSTATE) atau string message saja
// (untuk backward-compat). Postgres SQLSTATE dipakai untuk mendeteksi
// unique violation (23505), not-null violation (23502), dll — yang gak
// raise dengan `raise exception 'code'` jadi gak bisa di-match dari
// message saja.
function humanize(err: { message?: string; code?: string } | string | undefined | null): string {
  if (!err) return "generic";

  const message = typeof err === "string" ? err : (err.message ?? "");
  const sqlstate = typeof err === "string" ? undefined : err.code;
  const code = message.trim();

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
    "oauth_unavailable",
    "oauth_failed",
  ];
  if (known.includes(code)) return code;

  // Postgres SQLSTATE mapping untuk error yang gak raise secara eksplisit.
  // Lihat https://www.postgresql.org/docs/current/errcodes-appendix.html
  if (sqlstate === "23505") {
    // unique_violation — biasanya phone yang sudah dipakai customer lain.
    if (/phone/i.test(message) || /customer_profiles_phone/i.test(message)) {
      return "phone_taken";
    }
    return "duplicate_value";
  }
  if (sqlstate === "23502") {
    // not_null_violation — field wajib gak diisi.
    return "missing_required_field";
  }
  if (sqlstate === "23514") {
    // check_violation — biasanya validasi internal RPC.
    return "check_violation";
  }
  if (sqlstate === "42501") {
    // insufficient_privilege — RLS atau permission.
    return "not_authorized";
  }

  return "generic";
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
      return { ok: false, error: humanize(profileErr) };
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

  if (error) {
    console.error(
      "updateCustomerProfileAction gagal:",
      error.code,
      error.message
    );
    return {
      ok: false,
      error: humanize(error),
      errorDebug: `${error.code ?? "?"}: ${error.message}`,
    };
  }

  revalidatePath("/", "layout");
  revalidatePath("/account");
  return { ok: true };
}

/* =============================================================================
 *  OAUTH — DISABLED
 * ========================================================================== */
/*
 * Dulu ada `signInWithOAuthAction` (redirect flow) & `signInWithGoogleIdTokenAction`
 * (GIS popup flow). Sudah dihapus karena:
 *   1. Flow saat ini single: signup dengan email+password+identitas lengkap
 *      (nama, phone, dob, IG) di /register, lalu login email+password di /login.
 *   2. Setiap email & phone hanya boleh didaftarkan sekali (lihat migration-22
 *      & 23). OAuth user yang signup otomatis tanpa password = orphan account.
 *
 * Kalau suatu saat mau aktifkan OAuth lagi, tambahkan kembali function-nya
 * (lihat git log: commit ff2c308 atau 570c6ec untuk implementasi terakhirnya).
 */