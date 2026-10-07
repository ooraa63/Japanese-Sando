"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cake, Loader2, LogOut, Phone, Save, Sparkles, User } from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Dict } from "@/lib/i18n/en";
import { useToast } from "@/components/ui/Toast";
import {
  signOutCustomerAction,
  updateCustomerProfileAction,
  type CustomerActionResult,
} from "@/app/account/actions";

type ProfileDict = Dict["account"]["profile"];

/**
 * Form yang ditampilkan di /account saat user sudah login tapi profil
 * customer_profiles belum ada. Ini terjadi pada:
 *   - User lama (akun ada sebelum signup flow saat ini) yang user_metadata
 *     tidak lengkap atau RPC `customer_bootstrap_from_metadata` gagal.
 *   - Edge case signup dengan Confirm email ON + user_metadata tidak
 *     ter-carry over.
 *
 * Kalau redirect ke /login, /login melihat user masih login → redirect balik
 * ke /account → loop (ERR_TOO_MANY_REDIRECTS, halaman blank). Fix-nya:
 * render form ini, biarkan user lengkapi profil atau sign out.
 */
export function CompleteProfileCard({
  user,
  dict,
  signOutLabel,
}: {
  user: SupabaseUser;
  dict: ProfileDict;
  signOutLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<CustomerActionResult | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const meta = user.user_metadata ?? {};
  const seedName =
    (meta.full_name as string | undefined) ??
    (meta.name as string | undefined) ??
    "";
  const seedPhone = (meta.phone as string | undefined) ?? "";
  const seedDob = (meta.date_of_birth as string | undefined) ?? "";
  const seedIg = (meta.instagram as string | undefined) ?? "";

  function onSubmit(formData: FormData) {
    setState(null);
    startTransition(async () => {
      const result = await updateCustomerProfileAction(null, formData);
      if (result.ok) {
        toast.success("Profil disimpan", "Sekarang kamu bisa lanjut pre-order.");
        setState(null);
        router.refresh();
      } else {
        setState(result);
      }
    });
  }

  function onSignOut() {
    setSigningOut(true);
    void signOutCustomerAction();
    // signOutCustomerAction server-side redirect ke "/" setelah selesai;
    // fallback manual kalau redirect tidak terkirim.
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 800);
  }

  const errorMessage = state?.error
    ? state.error === "invalid_date_of_birth"
      ? "Tanggal lahir tidak valid (usia minimal 13 tahun)."
      : state.error === "invalid_phone"
        ? "Nomor telepon tidak valid."
        : state.error === "invalid_name"
          ? "Nama tidak valid."
          : "Gagal menyimpan. Coba lagi nanti."
    : null;

  return (
    <section className="card overflow-hidden p-6 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-honey-300/30 text-honey-500">
          <Sparkles className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-cocoa-900">
            Lengkapi profil kamu
          </h2>
          <p className="mt-1 text-sm text-cocoa-500">
            Akun kamu sudah aktif, tapi data identitas belum lengkap. Isi
            nomor telepon supaya kami bisa kirim info pesanan via WhatsApp.
          </p>
        </div>
      </div>

      <form action={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
            {dict.emailLabel}
          </p>
          <p className="mt-1 text-sm font-semibold text-cocoa-700" dir="ltr">
            {user.email ?? "—"}
          </p>
        </div>

        <div>
          <label htmlFor="fullName" className="label">
            {dict.fullName}
            <span className="ml-1 text-berry-500">*</span>
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
              defaultValue={seedName}
              className="input pl-10"
              autoComplete="name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="phone" className="label">
            {dict.phone}
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
              defaultValue={seedPhone}
              className="input pl-10 tabular"
              placeholder="08xxxxxxxxxx"
              autoComplete="tel"
            />
          </div>
        </div>

        <div>
          <label htmlFor="dateOfBirth" className="label">
            {dict.dateOfBirth}
          </label>
          <div className="relative">
            <Cake className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              defaultValue={seedDob}
              max={new Date().toISOString().slice(0, 10)}
              className="input pl-10"
              autoComplete="bday"
            />
          </div>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="instagram" className="label">
            {dict.instagram}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-bold text-cocoa-400">
              @
            </span>
            <input
              id="instagram"
              name="instagram"
              type="text"
              defaultValue={seedIg}
              className="input pl-10"
              autoComplete="off"
              placeholder="username"
            />
          </div>
        </div>

        {errorMessage ? (
          <p className="sm:col-span-2 rounded-xl bg-berry-500/10 px-3.5 py-2.5 text-sm font-semibold text-berry-600">
            {errorMessage}
          </p>
        ) : null}

        <div className="sm:col-span-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSignOut}
            disabled={pending || signingOut}
            className="inline-flex items-center gap-1.5 rounded-full bg-cocoa-100 px-3.5 py-2 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-200"
          >
            {signingOut ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <LogOut className="size-3.5" />
            )}
            {signOutLabel}
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {pending ? "Menyimpan…" : "Simpan & lanjut"}
          </button>
        </div>
      </form>
    </section>
  );
}