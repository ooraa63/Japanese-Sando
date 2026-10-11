"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export interface FaqEntry {
  q: string;
  a: string;
}

/**
 * Daftar FAQ gaya akordeon dengan kotak pencarian.
 *
 * Sifat penting:
 *   - Pencarian hanya MENYARING, tidak menutupi jawaban. Setiap hasil tetap
 *     bisa dibuka dengan satu klik, dan jawaban yang terbuka tetap terbuka
 *     saat pengguna mengetik.
 *   - Kunci "terbuka" memakai indeks ke dalam `items` ASLI, bukan ke hasil
 *     filter, supaya jawabannya tidak lompat-lompat saat daftar menyempit.
 *
 * Diterima sebagai teks siap tampil (sudah diterjemahkan di server), bukan
 * sebagai objek dua bahasa, supaya komponen ini tidak perlu tahu soal i18n.
 */
export function FaqList({
  items,
  searchPlaceholder,
  emptyText,
}: {
  items: FaqEntry[];
  searchPlaceholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q)
    );
  }, [items, query]);

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="input pl-10"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-cocoa-500">{emptyText}</p>
      ) : (
        <div className="mt-4 divide-y divide-cocoa-100 overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50">
          {filtered.map((item) => {
            const i = items.indexOf(item);
            const isOpen = open.has(i);
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-bold text-cocoa-900 transition hover:bg-cream-100"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`size-4 shrink-0 text-cocoa-400 transition ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen ? (
                  <p className="px-5 pb-4 text-sm leading-relaxed text-cocoa-600">
                    {item.a}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}