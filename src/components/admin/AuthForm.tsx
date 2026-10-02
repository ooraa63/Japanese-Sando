"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LogIn, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { signInAction, type ActionResult } from "@/app/admin/actions";

export function AuthForm({ nextPath }: { nextPath?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setState(null);
    startTransition(async () => {
      const result = await signInAction(null, formData);

      if (result.ok) {
        router.replace(nextPath && nextPath.startsWith("/admin") ? nextPath : "/admin");
        router.refresh();
        return;
      }
      setState(result);
    });
  }

  const errorMessage = (() => {
    if (!state?.error) return null;
    switch (state.error) {
      case "invalid":
        return t.admin.login.invalid;
      case "not_authorized":
        return t.admin.login.noAccess;
      case "authUnavailable":
        return t.admin.login.authUnavailable;
      default:
        return t.admin.login.invalid;
    }
  })();

  return (
    <div className="card p-6 sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h1 className="text-xl leading-tight font-extrabold text-cocoa-900">
            {t.admin.login.title}
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-cocoa-500">
            {t.admin.login.subtitle}
          </p>
        </div>
      </div>

      <form action={submit} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            {t.admin.login.email}
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              id="email"
              name="email"
              type="email"
              required
              className="input pl-10"
              placeholder="owner@example.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="label">
            {t.admin.login.password}
          </label>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              id="password"
              name="password"
              type="password"
              required
              className="input pl-10"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
        </div>

        {errorMessage ? (
          <p className="rounded-xl bg-berry-500/10 px-3.5 py-2.5 text-sm font-semibold text-berry-600">
            {errorMessage}
          </p>
        ) : null}

        <SubmitButton
          pending={pending}
          label={pending ? t.admin.login.submitting : t.admin.login.submit}
        />
      </form>
    </div>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <button type="submit" disabled={pending} className="btn-primary w-full">
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />}
      {label}
    </button>
  );
}
