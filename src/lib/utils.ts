import type {
  DeliveryMethod,
  InvoiceSnapshot as Invoice,
  Language,
  Order,
  OrderStatus,
  PaymentMethod,
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
      order.delivery_method === "delivery" ? "Method: Delivery" : "Method: Pickup"
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
      order.delivery_method === "delivery" ? "Metode: Diantar" : "Metode: Ambil di tempat"
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
  return lang === "en" ? "Collect in store" : "Ambil di toko";
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
