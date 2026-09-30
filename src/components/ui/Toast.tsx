"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, { icon: ReactNode; ring: string; bar: string }> = {
  success: {
    icon: <CheckCircle2 className="size-5 text-matcha-600" />,
    ring: "ring-matcha-200",
    bar: "bg-matcha-500",
  },
  error: {
    icon: <XCircle className="size-5 text-berry-500" />,
    ring: "ring-berry-500/20",
    bar: "bg-berry-500",
  },
  info: {
    icon: <Info className="size-5 text-cocoa-500" />,
    ring: "ring-cocoa-200",
    bar: "bg-cocoa-400",
  },
  warning: {
    icon: <TriangleAlert className="size-5 text-honey-500" />,
    ring: "ring-honey-300/50",
    bar: "bg-honey-400",
  },
};

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, title: string, description?: string) => {
      const id = ++counter;
      setToasts((prev) => [...prev.slice(-3), { id, kind, title, description }]);
      setTimeout(() => dismiss(id), kind === "error" ? 7000 : 4500);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, description) => push("success", title, description),
      error: (title, description) => push("error", title, description),
      info: (title, description) => push("info", title, description),
      warning: (title, description) => push("warning", title, description),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl bg-white p-3.5 shadow-xl ring-1 ${STYLES[t.kind].ring} animate-[fade-up_0.25s_ease-out]`}
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${STYLES[t.kind].bar}`} />
            <div className="shrink-0 pl-1.5">{STYLES[t.kind].icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-cocoa-800">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-[13px] leading-snug text-cocoa-500">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-1 text-cocoa-300 transition hover:bg-cocoa-50 hover:text-cocoa-600"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast harus dipakai di dalam <ToastProvider>");
  return ctx;
}
