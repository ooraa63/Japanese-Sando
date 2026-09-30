import type { Language } from "../types";

/** Nama cookie bahasa. Dibaca server (layout) dan ditulis client (toggle). */
export const LANG_COOKIE = "js_lang";

export function isLanguage(value: string | undefined | null): value is Language {
  return value === "id" || value === "en";
}

/** Terjemahkan nilai cookie menjadi bahasa yang sah (default: id). */
export function langFromCookie(value: string | undefined | null): Language {
  return isLanguage(value) ? value : "id";
}
