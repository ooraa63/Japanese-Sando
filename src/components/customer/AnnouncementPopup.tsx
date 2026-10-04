"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Megaphone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Announcement = {
  id: number;
  title: string;
  body_md: string;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
};

/**
 * Popup pengumuman — muncul otomatis di homepage sekali per tab per
 * sessionStorage key. Tombol "Tutup" menyembunyikan untuk sisa session.
 * Tombol CTA membuka link (kalau ada).
 *
 * Pakai RPC `public_list_announcements` (anon boleh panggil) yang return
 * popup aktif diurutkan sort_order asc, created_at desc.
 */
export function AnnouncementPopup() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [shownId, setShownId] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("public_list_announcements");
        if (!Array.isArray(data)) return;
        setItems(data as Announcement[]);
      } catch {
        /* diam — popup sekadar widget */
      }
    })();
  }, []);

  // Tutup otomatis (sesi): simpan id di sessionStorage supaya popup
  // pertama yang belum ditutup akan muncul.
  useEffect(() => {
    if (items.length === 0) return;
    if (typeof window === "undefined") return;
    // Pakai microtask agar tidak langsung setState dalam effect (cascading render).
    queueMicrotask(() => {
      try {
        const dismissedRaw = window.sessionStorage.getItem("ann_dismissed");
        const dismissed: number[] = dismissedRaw
          ? (JSON.parse(dismissedRaw) as number[])
          : [];
        const first = items.find((a) => !dismissed.includes(a.id));
        if (first) setShownId(first.id);
      } catch {
        setShownId(items[0].id);
      }
    });
  }, [items]);

  function close(id: number) {
    if (typeof window !== "undefined") {
      try {
        const raw = window.sessionStorage.getItem("ann_dismissed");
        const arr: number[] = raw ? (JSON.parse(raw) as number[]) : [];
        if (!arr.includes(id)) arr.push(id);
        window.sessionStorage.setItem(
          "ann_dismissed",
          JSON.stringify(arr)
        );
      } catch {
        /* abaikan */
      }
    }
    setShownId(null);
  }

  if (shownId === null) return null;
  const a = items.find((x) => x.id === shownId);
  if (!a) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="close"
        onClick={() => close(a.id)}
        className="absolute inset-0 bg-cocoa-950/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        {a.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.image_url}
            alt=""
            className="aspect-[16/9] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-honey-300 to-berry-500 text-white">
            <Megaphone className="size-16 opacity-80" />
          </div>
        )}
        <button
          type="button"
          aria-label="close"
          onClick={() => close(a.id)}
          className="absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-cocoa-950/50 text-white backdrop-blur-sm transition hover:bg-cocoa-950/70"
        >
          <X className="size-4" />
        </button>
        <div className="space-y-3 p-5">
          <p className="text-[10px] font-bold tracking-[0.18em] text-berry-500 uppercase">
            Pengumuman
          </p>
          <h2 className="font-display text-xl font-extrabold text-cocoa-900">
            {a.title}
          </h2>
          {a.body_md ? (
            <p className="text-sm leading-relaxed text-cocoa-600">{a.body_md}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {a.cta_href ? (
              <a
                href={a.cta_href}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-matcha !py-2.5 !text-sm"
              >
                {a.cta_label ?? "Lihat"}
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => close(a.id)}
            className="text-[12px] font-bold text-cocoa-500 underline-offset-2 hover:text-cocoa-700 hover:underline"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}