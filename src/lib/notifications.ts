/**
 * Notifikasi sisi pembeli — lonceng di header.
 *
 * Steven 14-10-2026: "itu notifnya kan belum ada fungsi, saya mau begini,
 * kan pesanan bisa dilihat dari riwayat local storage, jadi nanti misal ada
 * perubahan status orderan misal sudah selesai atau siap ada di notif itu,
 * contoh kan ketika sudah po, admin butuh verif dulu apakah pesanan sudah siap
 * dibuat, atau direject atau sudah diantar, setiap ada perubahan itu, notif
 * bisa muncul. Lalu juga di admin bisa set pemberitahuan, seperti mungkin ada
 * promo atau apa langsung muncul untuk semua."
 *
 * Dua sumber notifikasi, keduanya tanpa tabel baru:
 *
 * 1. **Status pesanan sendiri.** Daftar kode pesanan diambil dari riwayat
 *    localStorage (`js_order_history_v1`, yang sudah menyimpan kode + telepon).
 *    Tiap 15 detik `track_order(code, phone)` dipanggil untuk beberapa
 *    pesanan terbaru; kalau statusnya berbeda dari status terakhir yang
 *    tercatat, dibuat notifikasi baru.
 *
 * 2. **Pengumuman admin.** Tabel `announcements` + RPC
 *    `public_list_announcements()` sudah ada sejak migration-13 tapi belum
 *    pernah dipakai — di sini dinyalakan.
 *
 * Kenapa status disimpan di localStorage dan bukan tabel `notifications`?
 * Karena riwayat pesanan pun sudah murni lokal (permintaan Steven: "beda HP
 * beda history"), jadi notifikasi ikut konsisten dengan itu: tidak ada akun
 * yang perlu ditautkan, dan pembeli yang ganti HP memang tidak punya
 * riwayat lama untuk dichotom.
 *
 * Semua bacaan localStorage lewat `useSyncExternalStore` dengan snapshot yang
 * DI-CACHE di level modul — kalau `getSnapshot` mengembalikan array baru tiap
 * panggilan, React akan loop takfinite (lihat MEMORY/gotchas).
 */

export type NotificationKind = "order" | "announcement";

export interface AppNotification {
  /** Unik & stabil: dipakai sebagai React key dan sebagai penanda "sudah dibaca". */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  read: boolean;
  /** Halaman tujuan kalau notifikasi diklik (opsional). */
  href?: string;
}

const NOTIF_KEY = "js_notifications_v1";
/** Status terakhir yang "sudah dilihat" per kode pesanan. */
const SEEN_STATUS_KEY = "js_seen_order_status_v1";
/** Id pengumuman yang sudah pernah dimasukkan ke lonceng. */
const SEEN_ANNOUNCE_KEY = "js_seen_announcements_v1";

/** Batas notifikasi yang disimpan, supaya localStorage tidak membengkak. */
const NOTIF_LIMIT = 50;
/** Jeda polling status pesanan (ms) — Steven memilih polling 15 detik. */
export const NOTIF_POLL_MS = 15_000;

/* ------------------------------------------------------------------ *
 * Penyimpanan + snapshot
 * ------------------------------------------------------------------ */

let cachedRaw: string | null = null;
let cachedList: AppNotification[] = [];
const listeners = new Set<() => void>();

function emit() {
  cachedRaw = null;
  for (const fn of listeners) fn();
}

function readRaw(): AppNotification[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(NOTIF_KEY);
  } catch {
    return [];
  }
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  if (!raw) {
    cachedList = [];
    return cachedList;
  }
  try {
    const parsed = JSON.parse(raw);
    cachedList = Array.isArray(parsed) ? (parsed as AppNotification[]) : [];
  } catch {
    cachedList = [];
  }
  return cachedList;
}

function writeList(list: AppNotification[]) {
  if (typeof window === "undefined") return;
  cachedRaw = null;
  try {
    window.localStorage.setItem(NOTIF_KEY, JSON.stringify(list.slice(0, NOTIF_LIMIT)));
  } catch {
    // storage penuh / mode privat — notifikasi tetap jalan di memori sesi ini.
  }
  emit();
}

export function getNotificationSnapshot(): AppNotification[] {
  return readRaw();
}

/**
 * Snapshot untuk server render — harus nilai yang STABIL, bukan array baru.
 *
 * `useSyncExternalStore` membandingkan hasil snapshot dengan `Object.is`, jadi
 * `return []` di dalam fungsi akan mengembalikan referensi BARU tiap panggilan
 * -> React menganggap store selalu berubah -> loop takfinite. Karena itu array
 * kosongnya dinaikkan ke konstanta modul sekali saja (dibiarkan immutable,
 * tidak pernah di-mutate).
 */
const SERVER_SNAPSHOT: AppNotification[] = [];

export function getNotificationServerSnapshot(): AppNotification[] {
  return SERVER_SNAPSHOT;
}

export function subscribeNotifications(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === NOTIF_KEY) fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Tambahkan notifikasi kalau id-nya belum ada.
 *
 * Id yang sama tidak boleh masuk dua kali: kalau tidak, polling 15 detik akan
 * membuat lonceng meledak jadi puluhan notifikasi yang isinya sama.
 */
export function addNotification(n: AppNotification) {
  const list = readRaw();
  if (list.some((x) => x.id === n.id)) return;
  writeList([n, ...list]);
}

export function markAllNotificationsRead() {
  const list = readRaw();
  if (!list.some((x) => !x.read)) return;
  writeList(list.map((x) => ({ ...x, read: true })));
}

export function clearNotifications() {
  writeList([]);
}

/* ------------------------------------------------------------------ *
 * Baseline: status pesanan & pengumuman yang sudah pernah dilihat
 * ------------------------------------------------------------------ */

function readMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // diabaikan, sama seperti writeList
  }
}

export function getSeenOrderStatus(code: string): string | null {
  return readMap(SEEN_STATUS_KEY)[code] ?? null;
}

export function setSeenOrderStatus(code: string, status: string) {
  const map = readMap(SEEN_STATUS_KEY);
  map[code] = status;
  writeMap(SEEN_STATUS_KEY, map);
}

export function getSeenAnnouncements(): string[] {
  const raw = readMap(SEEN_ANNOUNCE_KEY);
  return Object.keys(raw);
}

export function setSeenAnnouncements(ids: string[]) {
  const map: Record<string, string> = {};
  for (const id of ids) map[id] = "1";
  writeMap(SEEN_ANNOUNCE_KEY, map);
}

/* ------------------------------------------------------------------ *
 * Teks status pesanan untuk notifikasi
 * ------------------------------------------------------------------ */

export const ORDER_STATUS_TEXT_ID: Record<string, string> = {
  pending: "Pesanan kamu masuk, menunggu dikonfirmasi penjual",
  accepted: "Pesanan kamu sudah dikonfirmasi penjual",
  rejected: "Pesanan kamu ditolak, buka detailnya ya",
  ready: "Pesanan kamu sudah siap diambil",
  delivered: "Pesanan kamu sudah diantar",
  cancelled: "Pesanan kamu dibatalkan",
};

export const ORDER_STATUS_TEXT_EN: Record<string, string> = {
  pending: "Your order was received and is waiting for the seller",
  accepted: "The seller accepted your order",
  rejected: "Your order was rejected, please check the details",
  ready: "Your order is ready for pickup",
  delivered: "Your order has been delivered",
  cancelled: "Your order was cancelled",
};