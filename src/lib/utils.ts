import type {
  DeliveryMethod,
  InvoiceSnapshot as Invoice,
  Language,
  Order,
  OrderStatus,
  PaymentMethod,
  ShippingDiscount,
} from "./types";

export const SITE_NAME = "Japanese Sando";

/** Rp18.000 */
export function formatIDR(value: number, lang: Language = "id"): string {
  if (lang === "en") return `Rp ${value.toLocaleString("en-US")}`;
  return value.toLocaleString("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });
}

export function formatPlain(value: number, lang: Language = "id"): string {
  return value.toLocaleString(lang === "en" ? "en-US" : "id-ID");
}

export function formatDateTime(iso: string, lang: Language = "id"): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function formatDate(iso: string, lang: Language = "id"): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/**
 * Tanggal lengkap dengan nama hari + jam, misal:
 *   "Jum'at, 2 Oktober 2026, 19.24"
 * Dipakai di dashboard admin supaya jelas kapan pesanan masuk.
 */
export function formatFullDateTime(iso: string, lang: Language = "id"): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function formatTime(iso: string, lang: Language = "id"): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", {
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function formatRelative(iso: string, lang: Language = "id"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  const rtf = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "id", {
    numeric: "auto",
  });
  if (Math.abs(mins) < 60) return rtf.format(-mins, "minute");
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

/** 0812-3456-7890 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^62/, "0");
  const local = digits.startsWith("0") ? digits : `0${digits}`;
  return local.replace(/(\d{4})(\d{4})(\d+)/, "$1-$2-$3");
}

/** https://wa.me/6281234567890 */
export function waLink(phone: string, message = ""): string {
  const digits = phone.replace(/\D/g, "");
  const base = digits.startsWith("62")
    ? digits
    : digits.startsWith("0")
      ? `62${digits.slice(1)}`
      : `62${digits}`;
  return `https://wa.me/${base}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Link wa.me berisi ringkasan pesanan, siap kirim ke pembeli. */
export function waOrderLink(phone: string, order: Order, lang: Language): string {
  const lines: string[] = [];
  if (lang === "en") {
    lines.push(`Hello ${order.customer_name}!`, "");
    lines.push(`Order *${order.order_code}* — Japanese Sando`);
    for (const it of order.items) {
      lines.push(`• ${it.quantity}x ${it.flavor_name} — ${formatIDR(it.line_total, lang)}`);
    }
    lines.push("");
    lines.push(`Subtotal: ${formatIDR(order.subtotal, lang)}`);
    if (order.delivery_fee > 0) {
      lines.push(`Delivery: ${formatIDR(order.delivery_fee, lang)}`);
    }
    lines.push(`*Total: ${formatIDR(order.total_price, lang)}*`);
    lines.push(
      `Method: ${deliveryLabel(order.delivery_method, "en")}`
    );
  } else {
    lines.push(`Halo ${order.customer_name}!`, "");
    lines.push(`Pesanan *${order.order_code}* — Japanese Sando`);
    for (const it of order.items) {
      lines.push(`• ${it.quantity}x ${it.flavor_name} — ${formatIDR(it.line_total, lang)}`);
    }
    lines.push("");
    lines.push(`Subtotal: ${formatIDR(order.subtotal, lang)}`);
    if (order.delivery_fee > 0) {
      lines.push(`Ongkir: ${formatIDR(order.delivery_fee, lang)}`);
    }
    lines.push(`*Total: ${formatIDR(order.total_price, lang)}*`);
    lines.push(
      `Metode: ${deliveryLabel(order.delivery_method, "id")}`
    );
  }
  return waLink(phone, lines.join("\n"));
}

/**
 * Harga sebuah bundle termurah di toko — untuk teaser di beranda.
 * Mengembalikan null kalau tidak ada bundle aktif.
 */
export function cheapestBundle(
  bundles: Array<{ price?: number; required_qty?: number; is_active?: boolean }>
): { qty: number; price: number } | null {
  let best: { qty: number; price: number } | null = null;
  for (const b of bundles) {
    if (!b.is_active || !b.price || !b.required_qty) continue;
    if (b.price <= 0) continue;
    if (!best || b.price < best.price) {
      best = { qty: b.required_qty, price: b.price };
    }
  }
  return best;
}

const STATUS_KEY: Record<OrderStatus, { id: string; en: string; color: string }> = {
  pending: { id: "Menunggu", en: "Pending", color: "amber" },
  accepted: { id: "Diterima", en: "Accepted", color: "blue" },
  ready: { id: "Siap diambil", en: "Ready", color: "violet" },
  delivered: { id: "Selesai", en: "Completed", color: "emerald" },
  rejected: { id: "Ditolak", en: "Rejected", color: "red" },
  cancelled: { id: "Dibatalkan", en: "Cancelled", color: "slate" },
};

export function statusMeta(status: OrderStatus) {
  return STATUS_KEY[status];
}

export function statusLabel(status: OrderStatus, lang: Language): string {
  const m = STATUS_KEY[status];
  return lang === "en" ? m.en : m.id;
}

/** Urutan status untuk timeline progress pembeli */
export const CUSTOMER_FLOW: OrderStatus[] = ["pending", "accepted", "ready", "delivered"];

/**
 * Status yang boleh dipilih admin.
 *
 * Tidak ada "Batalkan" dari sisi penjual — untuk membatalkan cukup pakai
 * "Tolak", yang sama-sama mengembalikan stok ke rak.
 */
export const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["ready", "rejected"],
  ready: ["delivered", "rejected"],
  delivered: [],
  rejected: ["pending"],
  // Status lama (dibatalkan sebelum perubahan ini) masih bisa dikembalikan.
  cancelled: ["pending"],
};

/** Daftar status yang ditampilkan di filter dashboard. */
export const ADMIN_STATUS_FILTERS: OrderStatus[] = [
  "pending",
  "accepted",
  "ready",
  "delivered",
  "rejected",
];

export function paymentLabel(_method: PaymentMethod, lang: Language): string {
  return lang === "en" ? "Bank transfer" : "Transfer bank";
}

export function deliveryLabel(method: DeliveryMethod, lang: Language): string {
  if (method === "delivery") return lang === "en" ? "Delivery" : "Diantar";
  if (method === "courier") return lang === "en" ? "Booked courier" : "Pesan Kurir";
  return lang === "en" ? "Collect in store" : "Ambil di toko";
}

/**
 * `YYYY-MM-DD` -> objek Date di zona waktu LOKAL.
 *
 * `new Date("2026-10-17")` di-parse sebagai UTC tengah malam, lalu
 * diformat dengan `toLocaleDateString` di zona waktu offset negatif seperti
 * WIB (UTC+7) — hasilnya bergeser ke HARI SEBELUMNYA. Karena tanggal ambil
 * adalah tanggal kalender biasa (bukan momen absolut), komponennya harus
 * dibaca manual.
 */
export function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return new Date(iso);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Tanggal ambil dalam bahasa pembeli, mis. "Jumat, 17 Oktober 2026". */
export function formatPickupDate(iso: string, lang: Language): string {
  return parseIsoDate(iso).toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Nomor pesanan acak untuk afflict draft keranjang di sisi pembeli. */
export function draftKey(): string {
  return "js_cart_v1";
}

/* =============================================================================
 *  INVOICE SNAPSHOT — untuk halaman sukses setelah pesanan dibuat.
 * ========================================================================== */

/** Kunci sessionStorage yang dipakai untuk menyimpan invoice terakhir. */
const INVOICE_KEY = "last_invoice";

/**
 * Simpan invoice ke sessionStorage. Dipanggil tepat sebelum navigasi ke
 * `/order/success/[code]` supaya halaman sukses bisa menampilkan invoice
 * lengkap tanpa harus query DB lagi (tabel `orders` RLS-nya tertutup untuk
 * publik).
 */
export function saveInvoice(invoice: Invoice): void {
  try {
    window.sessionStorage.setItem(INVOICE_KEY, JSON.stringify(invoice));
  } catch {
    // SessionStorage tidak tersedia / penuh — abaikan, halaman sukses akan
    // menampilkan versi ringkas dan pembeli tetap bisa melacak via /track.
  }
}

/** Ambil invoice dari sessionStorage, atau null kalau tidak ada / kode tidak cocok. */
export function readInvoice(orderCode: string | null): Invoice | null {
  if (!orderCode) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(INVOICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Invoice;
    if (!parsed || parsed.order_code !== orderCode) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Memori klien untuk invoice yang ditarik dari RPC publik. Dipakai agar
 * halaman sukses dapat menampilkan invoice walaupun sessionStorage sudah
 * hilang (mis. user refresh halaman / buka link langsung dari history).
 */
let invoiceMemory: Invoice | null = null;

/**
 * Tarik invoice: coba memori -> sessionStorage -> RPC publik `public_invoice`.
 * Return `null` kalau semua sumber kosong (kode salah / RPC gagal).
 *
 * Promise.resolve supaya signature bisa dipanggil langsung di hook klien
 * tanpa `useEffect`.
 */
export async function fetchInvoice(orderCode: string): Promise<Invoice | null> {
  if (!orderCode) return null;
  // 1. Memori (hasil RPC sebelumnya di tab ini)
  if (invoiceMemory && invoiceMemory.order_code === orderCode) {
    return invoiceMemory;
  }
  // 2. SessionStorage (snapshot dari submit order)
  const fromStorage = readInvoice(orderCode);
  if (fromStorage) {
    invoiceMemory = fromStorage;
    return fromStorage;
  }
  // 3. RPC publik (hanya di browser). `public_invoice` adalah
  // `security definer`, jadi ANON client boleh memanggil tanpa login.
  if (typeof window === "undefined") return null;
  try {
    const { createClient } = await import("./supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("public_invoice", {
      p_code: orderCode,
    });
    if (error || !data) return null;
    const remote = data as Invoice;
    if (remote.order_code === orderCode) {
      invoiceMemory = remote;
      return remote;
    }
  } catch {
    // jaringan / RPC error — diam saja, halaman tampil versi ringkas.
  }
  return null;
}

/**
 * Versi sinkron untuk `useSyncExternalStore`. Dipakai sebelum fetch
 * selesai; setelah fetch selesai, snapshot berikutnya akan return data
 * dari memori. Aman untuk dipanggil di server (return null).
 */
export function getInvoiceSnapshot(orderCode: string | null): Invoice | null {
  if (!orderCode) return null;
  if (invoiceMemory && invoiceMemory.order_code === orderCode) {
    return invoiceMemory;
  }
  return readInvoice(orderCode);
}

/** Trigger listener agar komponen yang menunggu invoice dari RPC bisa render ulang. */
const invoiceListeners = new Set<() => void>();
function notifyInvoice(): void {
  for (const l of invoiceListeners) l();
}

/** Subscribe perubahan invoice (untuk `useSyncExternalStore`). */
export function subscribeInvoice(listener: () => void): () => void {
  invoiceListeners.add(listener);
  return () => invoiceListeners.delete(listener);
}

/**
 * Inisialisasi fetch invoice dari RPC publik. Dipanggil dari klien setelah
 * mount. Hasilnya disimpan ke memori dan memberitahu semua listener.
 */
export async function loadInvoiceFromApi(orderCode: string): Promise<void> {
  const data = await fetchInvoice(orderCode);
  // Simpan ke memori dan kasih tahu listener (bahkan kalau null — agar
  // UI bisa berhenti loading).
  if (data) invoiceMemory = data;
  notifyInvoice();
}

/** Sinkronkan memori dari sessionStorage (untuk transisi awal). */
export function primeInvoiceMemory(orderCode: string): void {
  const snap = readInvoice(orderCode);
  if (snap) {
    invoiceMemory = snap;
    notifyInvoice();
  }
}

export function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(Math.floor(qty), Math.max(1, max)));
}

/**
 * Batas produk yang boleh dipilih penjual untuk section "Populer" dan
 * "Terlaris" di beranda.
 *
 * Tiga angka ini harus sama semua tempat: di sini, di `SettingsClient`
 * (UI admin), dan sebagai CHECK constraint `settings_*_flavor_ids_ok`
 * di database (migration-40). Kalau satu berubah, selalu ikut ketiganya.
 */
export const MAX_HOME_PICKS = 3;

/**
 * Batas produk untuk section "Menu Baru" (`store_settings.new_flavor_ids`,
 * migration-43).
 *
 * Sengaja LEBIH BESAR dari {@link MAX_HOME_PICKS}: menu baru biasanya datang
 * beberapa item sekaligus, jadi batas 6 berarti bisa jadi dua baris penuh di
 * grid 3 kolom (permintaan Steven 12-10-2026: satu baris 3 kartu, sama seperti
 * section "Populer" dan "Paket Hemat").
 *
 * Sama seperti di atas, angka ini harus sama di tiga tempat: di sini, di
 * tombol dashboard, dan CHECK constraint `settings_new_flavor_ids_ok`.
 */
export const MAX_NEW_PICKS = 6;

/**
 * Rapaikan daftar id produk yang berasal dari kolom jsonb database.
 *
 * Nilai di DB tidak selalu bersih: bisa bukan array, bisa berisi teks,
 * bisa dobel, dan bisa lebih dari batas. Semua itu dibuang di sini supaya
 * komponen cukup percaya hasilnya. Array kosong berarti "penjual belum
 * memilih" — pemanggil lalu memakai urutan otomatis.
 *
 * `limit` ada karena batas tiap section berbeda (lihat {@link MAX_HOME_PICKS}
 * dan {@link MAX_NEW_PICKS}). Default-nya batas "Populer" supaya pemanggil
 * lama tidak ikut berubah perilaku.
 */
export function normalizeFlavorIds(
  value: unknown,
  limit: number = MAX_HOME_PICKS
): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value) {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isInteger(n) || n <= 0) continue;
    if (out.includes(n)) continue;
    out.push(n);
    if (out.length >= limit) break;
  }
  return out;
}

/* =============================================================================
 *  DISKON ONGKIR BERTINGKAT (migration-46)
 * ========================================================================== */

/** Hasil hitungan ongkir setelah potongan bertingkat diterapkan. */
export interface ShippingQuote {
  /** Ongkir mentah dari zona. */
  fee: number;
  /** Potongan yang terpakai, dalam persen (0 = tidak ada aturan yang aktif). */
  percent: number;
  /** Nominal rupiah yang dipotong dari ongkir. */
  discount: number;
  /** Ongkir yang benar-benar ditagih. */
  finalFee: number;
  /**
   * Minimal belanja dari tier yang terpakai, atau null kalau belum ada tier
   * yang terlampaui. Dipakai untuk teks "potongan X% untuk belanja di atas Y".
   */
  hitMin: number | null;
  /**
   * Tier berikutnya yang BELUM terlampaui. Dipakai untuk teks "belanja lagi
   * Rp x lagi gratis ongkir". Null kalau sudah di tier teratas.
   */
  next: ShippingDiscount | null;
}

/**
 * Hitung ongkir akhir setelah melihat aturan diskon bertingkat pada zona.
 *
 * Aturan yang dipakai adalah tier dengan `min` TERTINGGI yang sudah
 * terlampaui subtotal — jadi diskon tidak bisa saling menumpuk. Ini persis
 * aturan yang dipakai `create_order` di database, jadi angka yang dilihat
 * pembeli sama dengan yang ditagih.
 *
 * `percent` di-clamp ke 0-100 dan `fee` tidak boleh jadi negatif.
 */
export function resolveShipping(
  discounts: ShippingDiscount[] | null | undefined,
  subtotal: number,
  fee: number
): ShippingQuote {
  const base = Math.max(0, Number.isFinite(fee) ? fee : 0);
  const tiers = (Array.isArray(discounts) ? discounts : [])
    .filter(
      (d) =>
        d &&
        Number.isFinite(Number(d.min)) &&
        Number.isFinite(Number(d.percent))
    )
    .map((d) => ({
      min: Math.max(0, Number(d.min)),
      percent: Math.min(100, Math.max(0, Number(d.percent))),
    }))
    .sort((a, b) => a.min - b.min);

  const sub = Math.max(0, Number.isFinite(subtotal) ? subtotal : 0);
  let hit: ShippingDiscount | null = null;
  for (const tier of tiers) {
    if (sub >= tier.min) hit = tier;
  }

  const percent = hit ? hit.percent : 0;
  const discount = Math.round((base * percent) / 100);
  const next = tiers.find((tier) => tier.min > sub) ?? null;

  return {
    fee: base,
    percent,
    discount,
    finalFee: Math.max(0, base - discount),
    hitMin: hit ? hit.min : null,
    next,
  };
}

/* =============================================================================
 *  RIWAYAT PESANAN LOKAL (localStorage)
 * ========================================================================== */

/**
 * Satu baris riwayat pesanan di perangkat pembeli.
 *
 * Sengaja TIDAK disimpan di database: permintaan Steven adalah "beda HP beda
 * history", jadi ini murni lokal di browser. Ditambah 12-10-2026.
 */
export interface OrderHistoryEntry {
  order_code: string;
  customer_name: string;
  /** Dipakai untuk membuka /track tanpa mengetik ulang. */
  phone: string;
  /** Total yang dibayar (sudah termasuk ongkir). */
  total_price: number;
  /** Jumlah item, cuma buat tampilan ringkas. */
  item_count: number;
  /** ISO timestamp saat disimpan. */
  created_at: string;
}

/** Maksimal baris yang disimpan, supaya localStorage tidak membengkak. */
const ORDER_HISTORY_LIMIT = 30;
const ORDER_HISTORY_KEY = "js_order_history_v1";

function parseHistory(raw: string | null): OrderHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is OrderHistoryEntry =>
        !!e && typeof e.order_code === "string" && e.order_code.length > 0
    );
  } catch {
    return [];
  }
}

/** Baca riwayat pesanan di perangkat ini. Selalu array, pernah `[]`. */
export function readOrderHistory(): OrderHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return parseHistory(window.localStorage.getItem(ORDER_HISTORY_KEY));
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------------------
 *  Store untuk `useSyncExternalStore`.
 *
 *  Snapshot WAJIB mengembalikan referensi yang stabil: kalau tiap panggilan
 *  membuat array baru, React menganggap datanya selalu berubah dan render
 *  loop takFinite. Karena itu hasil `JSON.parse` dicache, dan hanya dihitung
 *  ulang kalau string mentah di localStorage benar-benar berbeda.
 *
 *  Ini juga alasan halaman /riwayat tidak memakai `useState` + `useEffect`:
 *  React menandai pemanggilan `setState` sinkron di dalam effect sebagai
 *  pola yang memicu render berlapis.
 * ------------------------------------------------------------------------- */

let historyCache: { raw: string | null; value: OrderHistoryEntry[] } = {
  raw: null,
  value: [],
};
let historyCacheReady = false;
const historyListeners = new Set<() => void>();

function readHistoryStable(): OrderHistoryEntry[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ORDER_HISTORY_KEY);
  } catch {
    raw = null;
  }
  if (!historyCacheReady || historyCache.raw !== raw) {
    historyCache = { raw, value: parseHistory(raw) };
    historyCacheReady = true;
  }
  return historyCache.value;
}

/** Snapshot stabil untuk `useSyncExternalStore`. */
export function getOrderHistorySnapshot(): OrderHistoryEntry[] {
  return readHistoryStable();
}

/**
 * Dengarkan perubahan riwayat: baik dari tab lain (event `storage`) maupun
 * dari tab ini (setelah `pushOrderHistory`).
 */
export function subscribeOrderHistory(listener: () => void): () => void {
  historyListeners.add(listener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", listener);
  }
  return () => {
    historyListeners.delete(listener);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", listener);
    }
  };
}

/**
 * Simpan satu pesanan ke riwayat lokal.
 *
 * Kalau kodenya sudah ada, entri lama DIGANTI dan dikembalikan ke posisi
 * paling atas — jadi pembeli tidak melihat baris kembar setelah menekan
 * "Pesan lagi" dari halaman sukses.
 */
export function pushOrderHistory(entry: OrderHistoryEntry): void {
  if (typeof window === "undefined") return;
  const rest = readOrderHistory().filter((e) => e.order_code !== entry.order_code);
  const next = [entry, ...rest].slice(0, ORDER_HISTORY_LIMIT);
  try {
    window.localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // localStorage penuh / ditolak (mode privat) — riwayat tidak tersimpan,
    // tapi pesanan tetap normal karena pemanggil tidak bergantung pada ini.
    return;
  }
  for (const l of historyListeners) l();
}
