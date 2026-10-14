"use client";

/**
 * Lonceng notifikasi untuk pembeli.
 *
 * Steven 14-10-2026: "itu notifnya kan belum ada fungsi ... ketika sudah po,
 * admin butuh verif dulu apakah pesanan sudah siap dibuat, atau direject atau
 * sudah diantar, setiap ada perubahan itu, notif bisa muncul. Lalu juga di
 * admin bisa set pemberitahuan, seperti mungkin ada promo atau apa langsung
 * muncul untuk semua."
 *
 * Cara kerjanya (detail di `src/lib/notifications.ts`):
 * - Status pesanan dipoll tiap 15 detik lewat RPC `track_order`, untuk kode
 *   pesanan yang ada di riwayat lokal. Berubah -> notifikasi baru.
 * - Pengumuman admin diambil dari `public_list_announcements()`. Yang belum
 *   pernah dimasukkan ke lonceng -> notifikasi baru.
 *
 * POLLING, bukan realtime: Steven sendiri yang memilih. Alasannya stabil di
 * Vercel (tanpa channel yang harus tetap hidup) dan tidak butuh RLS
 * realtime. Batasnya: notifikasi muncul paling lambat 15 detik setelah status
 * berubah — untuk kasus "pesananku sudah siap" itu sudah jauh lebih baik
 * daripada tidak ada notifikasi sama sekali.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Bell, Check, Store, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { readOrderHistory } from "@/lib/utils";
import {
  NOTIF_POLL_MS,
  ORDER_STATUS_TEXT_EN,
  ORDER_STATUS_TEXT_ID,
  addNotification,
  getNotificationServerSnapshot,
  getNotificationSnapshot,
  getSeenAnnouncements,
  getSeenOrderStatus,
  markAllNotificationsRead,
  setSeenAnnouncements,
  setSeenOrderStatus,
  subscribeNotifications,
} from "@/lib/notifications";

/** Batas jumlah baris notifikasi yang ditampilkan di panel. */
const MAX_SHOWN = 20;

export function NotificationBell() {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);

  // Snapshot notifikasi harus referensial STABIL: `useSyncExternalStore` akan
  // loop takfinite kalau `getSnapshot` mengembalikan array baru tiap render
  // (lihat MEMORY/gotchas).
  const notifications = useSyncExternalStore(
    subscribeNotifications,
    getNotificationSnapshot,
    getNotificationServerSnapshot
  );

  const unread = notifications.reduce((n, x) => n + (x.read ? 0 : 1), 0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const statusText = useCallback(
    (status: string) => {
      const map = lang === "en" ? ORDER_STATUS_TEXT_EN : ORDER_STATUS_TEXT_ID;
      return map[status] ?? map.pending;
    },
    [lang]
  );

  /* ------------------------------------------------------------------ *
   * Poll status pesanan
   * ------------------------------------------------------------------ */
  const pollOrders = useCallback(async () => {
    const history = readOrderHistory().slice(0, 5);
    if (history.length === 0) return;
    const supabase = createClient();

    for (const entry of history) {
      // Tidak ada nomor telepon di riwayat = tidak ada yang bisa diverifikasi,
      // jadi dilewati (RPC `track_order` butuh kode + telepon).
      if (!entry.order_code || !entry.phone) continue;
      try {
        const { data, error } = await supabase.rpc("track_order", {
          p_code: entry.order_code,
          p_phone: entry.phone,
        });
        if (error || !data) continue;
        const row = data as { status?: string } | null;
        const status = row?.status;
        if (!status) continue;

        const prev = getSeenOrderStatus(entry.order_code);

        // Pesanan yang statusnya BELUM PERNAH disentuh -> catat baseline-nya
        // tanpa membuat notifikasi, supaya pembeli tidak langsung dikira punya
        // notifikasi baru setiap kali buka halaman.
        if (prev == null) {
          setSeenOrderStatus(entry.order_code, status);
          continue;
        }
        if (prev === status) continue;

        setSeenOrderStatus(entry.order_code, status);
        addNotification({
          id: `order:${entry.order_code}:${status}`,
          kind: "order",
          title:
            lang === "en"
              ? `Order ${entry.order_code} updated`
              : `Pesanan ${entry.order_code} diperbarui`,
          body: statusText(status),
          createdAt: new Date().toISOString(),
          read: false,
          href: "/riwayat",
        });
      } catch {
        // Offline / RPC bermasalah — coba lagi di siklus berikutnya.
      }
    }
  }, [lang, statusText]);

  /* ------------------------------------------------------------------ *
   * Ambil pengumuman admin
   * ------------------------------------------------------------------ */
  const pollAnnouncements = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("public_list_announcements");
      if (error || !Array.isArray(data)) return;

      const seen = getSeenAnnouncements();
      const seenSet = new Set(seen);
      const next: string[] = [...seen];

      for (const a of data as Array<{
        id: number;
        title?: string;
        body_md?: string;
        cta_href?: string | null;
        created_at?: string;
      }>) {
        const key = String(a.id);
        if (seenSet.has(key)) continue;
        seenSet.add(key);
        next.push(key);
        addNotification({
          id: `announcement:${key}`,
          kind: "announcement",
          title: a.title?.trim() || (lang === "en" ? "Announcement" : "Pengumuman"),
          body: (a.body_md ?? "").slice(0, 300),
          createdAt: a.created_at ?? new Date().toISOString(),
          read: false,
          href: a.cta_href || undefined,
        });
      }
      setSeenAnnouncements(next);
    } catch {
      // diamkan: notifikasi tidak boleh menggagalkan halaman
    }
  }, [lang]);

  useEffect(() => {
    void pollOrders();
    void pollAnnouncements();

    const timer = window.setInterval(() => {
      void pollOrders();
    }, NOTIF_POLL_MS);

    // Pengumuman tidak sesegera status pesanan, jadi intervalnya lebih
    // jarang supaya tidak memanggil RPC terus-terusan.
    const slow = window.setInterval(() => {
      void pollAnnouncements();
    }, NOTIF_POLL_MS * 8);

    return () => {
      window.clearInterval(timer);
      window.clearInterval(slow);
    };
  }, [pollOrders, pollAnnouncements]);

  /* ------------------------------------------------------------------ *
   * Panel: tutup kalau klik di luar
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = notifications.slice(0, MAX_SHOWN);
  const label = lang === "en" ? "Notifications" : "Notifikasi";

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) markAllNotificationsRead();
        }}
        aria-label={label}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-full text-cocoa-700 transition hover:bg-cocoa-100"
      >
        <Bell className="size-5" />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-berry-500 px-1 text-[10px] leading-4 font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-cocoa-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-cocoa-100 px-4 py-3">
            <p className="text-sm font-bold text-cocoa-900">{label}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={lang === "en" ? "Close" : "Tutup"}
              className="grid size-7 place-items-center rounded-full text-cocoa-500 transition hover:bg-cocoa-100"
            >
              <X className="size-4" />
            </button>
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-cocoa-400">
              {lang === "en" ? "Nothing yet." : "Belum ada notifikasi."}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-cocoa-100 overflow-y-auto">
              {shown.map((n) => {
                const inner = (
                  <>
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-xl ${
                        n.kind === "order"
                          ? "bg-matcha-100 text-matcha-700"
                          : "bg-honey-300/25 text-honey-500"
                      }`}
                    >
                      {n.kind === "order" ? (
                        <Check className="size-4" />
                      ) : (
                        <Store className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-cocoa-900">
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-cocoa-500">
                          {n.body}
                        </span>
                      ) : null}
                    </span>
                  </>
                );
                const cls =
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-cocoa-50";
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        className={cls}
                        onClick={() => setOpen(false)}
                      >
                        {inner}
                      </Link>
                    ) : (
                      <div className={cls}>{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}