"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LogIn, Mail, ShieldCheck, User } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import {
  signInAction,
  signUpFirstAdminAction,
  type ActionResult,
} from "@/app/admin/actions";

export function AuthForm({
  mode,
  nextPath,
}: {
  mode: "login" | "setup";
  nextPath?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [isSetup, setIsSetup] = useState(mode === "setup");
  const [state, setState] = useState<ActionResult & { needsEmailConfirm?: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setState(null);
    startTransition(async () => {
      const result: ActionResult<undefined> & { needsEmailConfirm?: boolean } = isSetup
        ? await signUpFirstAdminAction(null, formData)
        : await signInAction(null, formData);

      if (result.ok) {
        if (result.needsEmailConfirm) {
          setState({ ok: true, needsEmailConfirm: true });
          return;
        }
        router.replace(nextPath && nextPath.startsWith("/admin") ? nextPath : "/admin");
        router.refresh();
        return;
      }
      setState(result);
    });
  }

  if (state?.needsEmailConfirm) {
    return (
      <div className="card p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-matcha-100 text-matcha-600">
          <Mail className="size-6" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-cocoa-900">
          {t.admin.login.setupTitle}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-cocoa-500">
          {t.admin.login.checkEmail}
        </p>
        <button
          type="button"
          onClick={() => setIsSetup(false)}
          className="btn-outline mt-6 w-full"
        >
          {t.admin.login.submit}
        </button>
      </div>
    );
  }

  const errorMessage = (() => {
    if (!state?.error) return null;
    switch (state.error) {
      case "invalid":
        return t.admin.login.invalid;
      case "not_authorized":
        return t.errors.not_authorized;
      case "passwordMismatch":
        return t.admin.login.passwordMismatch;
      case "passwordTooShort":
        return t.admin.login.passwordTooShort;
      case "email":
        return t.admin.login.invalid;
      case "fullName":
        return t.admin.login.setupTitle;
      case "rate_limited":
        return t.admin.login.rateLimited;
      case "authUnavailable":
        return t.admin.login.authUnavailable;
      default:
        return t.admin.login.signupFailed;
    }
  })();

  return (
    <div className="card p-6 sm:p-7">
      <div className="mb-6 flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
          {isSetup ? <ShieldCheck className="size-5" /> : <KeyRound className="size-5" />}
        </span>
        <div>
          <h1 className="text-xl leading-tight font-extrabold text-cocoa-900">
            {isSetup ? t.admin.login.setupTitle : t.admin.login.title}
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-cocoa-500">
            {isSetup ? t.admin.login.setupSubtitle : t.admin.login.subtitle}
          </p>
        </div>
      </div>

      <form action={submit} className="space-y-4">
        {isSetup ? (
          <div>
            <label htmlFor="fullName" className="label">
              {t.admin.login.fullName}
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
              <input
                id="fullName"
                name="fullName"
                required
                minLength={2}
                className="input pl-10"
                placeholder="Nama kamu"
                autoComplete="name"
              />
            </div>
          </div>
        ) : null}

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
              minLength={isSetup ? 8 : undefined}
              className="input pl-10"
              placeholder="••••••••"
              autoComplete={isSetup ? "new-password" : "current-password"}
            />
          </div>
        </div>

        {isSetup ? (
          <div>
            <label htmlFor="confirmPassword" className="label">
              {t.admin.login.confirmPassword}
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                className="input pl-10"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="rounded-xl bg-berry-500/10 px-3.5 py-2.5 text-sm font-semibold text-berry-600">
            {errorMessage}
          </p>
        ) : null}

        <SubmitButton
          pending={pending}
          label={
            isSetup
              ? pending
                ? t.common.saving
                : t.admin.login.setupTitle
              : pending
                ? t.admin.login.submitting
                : t.admin.login.submit
          }
        />
      </form>

      {!isSetup ? (
        <button
          type="button"
          onClick={() => {
            setIsSetup(true);
            setState(null);
          }}
          className="mt-5 w-full text-center text-sm font-semibold text-cocoa-400 transition hover:text-cocoa-700"
        >
          {t.admin.login.needAccount}{" "}
          <span className="text-matcha-600 underline underline-offset-2">
            {t.admin.login.createAccount}
          </span>
        </button>
      ) : null}
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
