"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Language } from "../types";
import { en, type Dict } from "./en";
import { id } from "./id";
import { LANG_COOKIE } from "./shared";

const DICTS: Record<Language, Dict> = { id, en };

interface I18nValue {
  lang: Language;
  t: Dict;
  setLang: (l: Language) => void;
  toggle: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export { isLanguage, langFromCookie, LANG_COOKIE } from "./shared";

export function I18nProvider({
  children,
  initialLang = "id",
}: {
  children: ReactNode;
  initialLang?: Language;
}) {
  // Bahasa awal datang dari cookie (dibaca server di layout), jadi tidak
  // perlu efek tambahan untuk membaca localStorage.
  const [lang, setLangState] = useState<Language>(initialLang);

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    document.documentElement.lang = next;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const toggle = useCallback(() => {
    setLang(lang === "id" ? "en" : "id");
  }, [lang, setLang]);

  const value = useMemo<I18nValue>(
    () => ({ lang, t: DICTS[lang], setLang, toggle }),
    [lang, setLang, toggle]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n harus dipakai di dalam <I18nProvider>");
  return ctx;
}
