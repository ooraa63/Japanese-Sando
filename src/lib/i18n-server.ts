import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Language } from "./types";
import { en, type Dict } from "./i18n/en";
import { id } from "./i18n/id";
import { LANG_COOKIE, langFromCookie } from "./i18n/shared";

const DICTS: Record<Language, Dict> = { id, en };

/**
 * Ambil kamus bahasa di Server Component berdasarkan cookie.
 * Dipakai di halaman yang dirender di server agar tidak ada kedipan teks.
 */
export const getLang = cache(async (): Promise<Language> => {
  const store = await cookies();
  return langFromCookie(store.get(LANG_COOKIE)?.value);
});

export const getI18nDict = cache(async (): Promise<Dict> => {
  const lang = await getLang();
  return DICTS[lang];
});
