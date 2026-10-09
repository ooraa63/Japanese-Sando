"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingBag } from "lucide-react";
import type { Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { formatIDR } from "@/lib/utils";

/**
 * Halaman favorit.
 *
 * "Like" di project ini dicatat dua tempat: `localStorage`
 * (key `like:flavor:<id>`, ditulis optimistic di FlavorCard) dan tabel
 * `flavor_likes` di server. Halaman ini memakai yang di localStorage —
 * jadi daftar terasa instan tanpa memanggil API, dan tetap benar setelah
 * reload di perangkat yang sama.
 *
 * Kalau someday customer login lintas perangkat, barulah perlu RPC
 * "list_my_liked_flavors". Sekarang belum ada, dan tidak perlu.
 */

/* ---------- sumber data: localStorage ---------- */

/** Snapshot harus referensinya STABIL, kalau tidak useSyncExternalStore
 *  loop tak terbatas (lihat gotchas.md #23). Jadi hasilnya di-cache
 *  dan hanya diganti kalau isi storage-nya benar-benar berbeda. */
let cachedRaw: string | null = null;
let cachedList: number[] = [];

function readLikedIds(): number[] {
  let raw = "";
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith("like:flavor:")) continue;
      if (window.localStorage.getItem(key) !== "1") continue;
      raw += key + ";";
    }
  } catch {
    return [];
  }
  if (raw === cachedRaw) return cachedList;

  cachedRaw = raw;
  cachedList = raw
    .split(";")
    .filter(Boolean)
    .map((k) => Number(k.replace("like:flavor:", "")))
    .filter((id) => Number.isFinite(id));
  return cachedList;
}

/** Halaman ini tidak butuh pembaruan langsung; cukup baca saat dibuka. */
function subscribe() {
  return () => {};
}

const EMPTY: number[] = [];

export function FavoritesClient({
  categories,
}: {
  categories: Category[];
}) {
  const { t, lang } = useI18n();

  // null = masih di server / belum baca storage (SSR + hidrasi pertama).
  const liked = useSyncExternalStore(subscribe, readLikedIds, () => EMPTY);

  const likedSet = new Set(liked);
  const items: Flavor[] = categories
    .flatMap((c) => c.flavors ?? [])
    .filter((f) => likedSet.has(f.id));

  return (
    <div>
      {items.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-cocoa-100">
            <Heart className="size-6 text-cocoa-400" />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-cocoa-900">
            {lang === "en" ? "No favorites yet" : "Belum ada favorit"}
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-cocoa-500">
            {lang === "en"
              ? "Tap the heart on any flavor to keep it here."
              : "Tekan ikon hati di rasa mana saja supaya tersimpan di sini."}
          </p>
          <Link href="/#menu" className="btn-primary mt-5">
            <ShoppingBag className="size-4" />
            {t.nav.menu}
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((f) => {
            const name = lang === "en" ? f.name_en : f.name_id;
            return (
              <li key={f.id}>
                <Link
                  href="/order"
                  className="flex items-center gap-3 rounded-2xl border border-cocoa-200/70 bg-white p-2.5 transition hover:border-berry-400 hover:shadow-md"
                >
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-cream-100">
                    {f.image_url ? (
                      <Image
                        src={f.image_url}
                        alt=""
                        fill
                        sizes="56px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-grain font-display text-lg font-bold text-white/40">
                        {name.charAt(0)}
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-cocoa-900">
                      {name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-berry-500">
                      <Heart className="size-3 fill-current" />
                      {t.home.liked}
                    </span>
                  </span>

                  <span className="shrink-0 text-sm font-extrabold text-cocoa-900 tabular">
                    {formatIDR(f.price, lang)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}