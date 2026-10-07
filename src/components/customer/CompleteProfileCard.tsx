"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { Dict } from "@/lib/i18n/en";
import { useToast } from "@/components/ui/Toast";
import { updateCustomerProfileAction } from "@/app/account/actions";

type ProfileDict = Dict["account"]["profile"];

/**
 * Form yang ditampilkan di /account saat user sudah login tapi profil
 * belum lengkap (mis. login pertama via Google, yang tidak punya phone
 * di user_metadata). Setelah submit, `customer_upsert_own_profile`
 * akan membuat baris customer_profiles dan halaman otomatis re-render.
 */
export function CompleteProfileCard({
  user,
  dict,
}: {
  user: User;
  dict: ProfileDict;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const googleName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";

  function onSubmit(formData: FormData) {
    startTransition(async () => {
      const result = await updateCustomerProfileAction(null, formData);
      if (result.ok) {
        toast.success("Profil disimpan", "Sekarang kamu bisa lanjut pre-order.");
        router.refresh();
      } else {
        toast.error("Gagal menyimpan", result.error ?? "Coba lagi nanti.");
      }
    });
  }

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
            Akun Google kamu sudah aktif. Isi nomor telepon supaya kami bisa
            hubungi kalau ada perubahan pesanan.
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
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            minLength={2}
            maxLength={80}
            defaultValue={googleName}
            className="input"
            autoComplete="name"
          />
        </div>
        <div>
          <label htmlFor="phone" className="label">
            {dict.phone}
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            required
            className="input tabular"
            placeholder="08xxxxxxxxxx"
            autoComplete="tel"
          />
          <p className="mt-1.5 text-xs text-cocoa-400">
            Wajib untuk konfirmasi pesanan via WhatsApp.
          </p>
        </div>
        <div>
          <label htmlFor="dateOfBirth" className="label">
            {dict.dateOfBirth}
          </label>
          <input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            className="input"
            autoComplete="bday"
          />
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
              className="input pl-10"
              autoComplete="off"
              placeholder="username"
            />
          </div>
        </div>
        <div className="sm:col-span-2 flex items-center justify-end gap-2">
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