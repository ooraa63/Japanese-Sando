"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Cake,
  KeyRound,
  Loader2,
  LogIn,
  Mail,
  Phone,
  User,
  UserPlus,
} from "lucide-react";
import {
  signInCustomerAction,
  signUpCustomerAction,
  type CustomerActionResult,
} from "@/app/account/actions";
import type { Dict } from "@/lib/i18n/en";

type AuthDict = Dict["customerAuth"];

export function CustomerAuthForm({
  mode,
  nextPath,
  dict,
  onSwitchMode,
  onSuccess,
  formAttr,
}: {
  mode: "login" | "register";
  nextPath?: string;
  dict: AuthDict;
  /**
   * Dipakai oleh AuthModal: buka modal dengan mode lain saat user klik
   * "Belum punya akun?" / "Sudah punya akun?". Tidak dipakai di
   * halaman /login & /register (link biasa ke /register / /login).
   */
  onSwitchMode?: (mode: "login" | "register") => void;
  /** Dipanggil setelah login/register sukses — biasanya tutup modal. */
  onSuccess?: () => void;
  /** Set di <form> supaya listener keyboard di AuthModal bisa akses form. */
  formAttr?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<CustomerActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Setelah berhasil register, UI menampilkan "check inbox" selama
  // state.requiresVerification true. Auto-dismiss setelah 30 detik supaya
  // user tidak stuck.
  const [verifyBannerShown, setVerifyBannerShown] = useState(false);
  useEffect(() => {
    if (!verifyBannerShown) return;
    const t = setTimeout(() => setVerifyBannerShown(false), 30_000);
    return () => clearTimeout(t);
  }, [verifyBannerShown]);

  const d = mode === "login" ? dict.login : dict.register;
  // Akses field khusus register (fullName, phone, instagram, dst) lewat
  // `r` supaya TypeScript tidak mengeluh tentang union narrowing.
  const r = mode === "register" ? dict.register : null;

  // Karena `d.errors` adalah union, kita petakan error code dari server ke
  // label yang sesuai. Pakai helper yang akses kedua varian.
  const loginErrors = dict.login.errors;
  const registerErrors = dict.register.errors;

  function errorFor(code: string | undefined): string | undefined {
    if (!code) return undefined;
    // Field yang ada di kedua varian:
    if (code === "invalid_email") return d.errors.invalidEmail;
    if (code === "weak_password") return d.errors.weakPassword;
    if (code === "email_taken") return d.errors.emailTaken;
    if (code === "signup_failed") return d.errors.signupFailed;
    if (code === "not_authenticated") return d.errors.notAuthenticated;
    // Login-only:
    if (code === "user_not_found") return loginErrors.userNotFound;
    if (code === "email_not_verified") return loginErrors.emailNotVerified;
    // Register-only:
    if (code === "invalid_phone") return registerErrors.invalidPhone;
    if (code === "invalid_name") return registerErrors.invalidName;
    if (code === "name_too_long") return registerErrors.nameTooLong;
    if (code === "invalid_date_of_birth") return registerErrors.invalidDateOfBirth;
    return d.errors.generic;
  }

  function submit(formData: FormData) {
    setState(null);
    setVerifyBannerShown(false);
    startTransition(async () => {
      const result =
        mode === "login"
          ? await signInCustomerAction(null, formData)
          : await signUpCustomerAction(null, formData);

      if (result.ok) {
        if (result.requiresVerification) {
          // Email verifikasi dikirim — tampilkan banner "cek inbox",
          // JANGAN redirect (sesi belum aktif).
          setVerifyBannerShown(true);
          onSuccess?.();
          return;
        }
        onSuccess?.();
        const target = nextPath && nextPath.startsWith("/") ? nextPath : "/account";
        router.replace(target);
        router.refresh();
        return;
      }
      setState(result);
    });
  }

  const errorMessage = (() => {
    if (!state?.error) return null;
    return errorFor(state.error) ?? d.errors.generic;
  })();

  return (
    <div className="card p-6 sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-matcha-500 text-white">
          {mode === "login" ? (
            <LogIn className="size-5" />
          ) : (
            <UserPlus className="size-5" />
          )}
        </span>
        <div>
          <h1 className="text-xl leading-tight font-extrabold text-cocoa-900">
            {d.title}
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-cocoa-500">{d.subtitle}</p>
        </div>
      </div>

      <form
        action={submit}
        className="space-y-4"
        {...(formAttr ? { [formAttr]: "true" } : {})}
      >
        {mode === "register" && r ? (
          <div>
            <label htmlFor="fullName" className="label">
              {r.fullName}
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                minLength={2}
                maxLength={80}
                className="input pl-10"
                placeholder={r.fullNamePlaceholder}
                autoComplete="name"
              />
            </div>
          </div>
        ) : null}

        <div>
          <label htmlFor="email" className="label">
            {d.email}
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              id="email"
              name="email"
              type="email"
              required
              className="input pl-10"
              placeholder={d.emailPlaceholder}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="label">
            {d.password}
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="input pl-10"
              placeholder={d.passwordPlaceholder}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          {mode === "register" && r ? (
            <p className="mt-1.5 text-xs text-cocoa-400">{r.passwordHint}</p>
          ) : null}
        </div>

        {mode === "register" && r ? (
          <>
            <div>
              <label htmlFor="phone" className="label">
                {r.phone}
                <span className="ml-1 text-berry-500">*</span>
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  className="input pl-10 tabular"
                  placeholder={r.phonePlaceholder}
                  autoComplete="tel"
                />
              </div>
              <p className="mt-1.5 text-xs text-cocoa-400">{r.phoneHint}</p>
            </div>

            <div>
              <label htmlFor="dateOfBirth" className="label">
                {r.dateOfBirth}
                <span className="ml-1 text-berry-500">*</span>
              </label>
              <div className="relative">
                <Cake className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
                <input
                  id="dateOfBirth"
                  name="dateOfBirth"
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  className="input pl-10"
                  autoComplete="bday"
                />
              </div>
              <p className="mt-1.5 text-xs text-cocoa-400">{r.dateOfBirthHint}</p>
            </div>

            <div>
              <label htmlFor="instagram" className="label">
                {r.instagram}
                <span className="ml-1 text-berry-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-bold text-cocoa-400">
                  @
                </span>
                <input
                  id="instagram"
                  name="instagram"
                  type="text"
                  required
                  className="input pl-10"
                  placeholder={r.instagramPlaceholder}
                  autoComplete="off"
                />
              </div>
              <p className="mt-1.5 text-xs text-cocoa-400">{r.instagramHint}</p>
            </div>
          </>
        ) : null}

        {verifyBannerShown && r ? (
          <p className="rounded-xl bg-matcha-500/10 px-3.5 py-3 text-sm text-matcha-700">
            <strong className="block font-extrabold">{r.verifyEmailTitle}</strong>
            <span className="mt-1 block text-matcha-700/90">{r.verifyEmailDesc}</span>
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-xl bg-berry-500/10 px-3.5 py-2.5 text-sm font-semibold text-berry-600">
            {errorMessage}
          </p>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : mode === "login" ? (
            <LogIn className="size-4" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {pending ? d.submitting : d.submit}
        </button>
      </form>

      {mode === "login" ? (
        <p className="mt-4 text-center text-xs text-cocoa-400">
          {dict.login.forgotPasswordHint}{" "}
          <Link href="/track" className="font-bold text-cocoa-500 hover:text-cocoa-700">
            {dict.login.trackOrder}
          </Link>
        </p>
      ) : null}

      {/* Saat dipakai dari AuthModal: ganti mode tanpa navigate. */}
      {onSwitchMode ? (
        <p className="mt-4 text-center text-sm text-cocoa-500">
          {mode === "login" ? dict.login.haveNoAccount : dict.register.haveAccount}{" "}
          <button
            type="button"
            onClick={() => onSwitchMode(mode === "login" ? "register" : "login")}
            className="font-bold text-matcha-700 underline-offset-2 hover:underline"
          >
            {mode === "login" ? dict.login.registerLink : dict.register.loginLink}
          </button>
        </p>
      ) : null}
    </div>
  );
}