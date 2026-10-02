import type {
  BundleBreakdown,
  BundleTier,
  DeliveryMethod,
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
 * Hitung harga akhir dari jumlah pcs memakai daftar paket milik seller.
 *
 * Seller bebas menentukan paketnya, misal:
 *   [{ qty: 2, price: 35000 }, { qty: 4, price: 65000 }]
 *
 * Aturannya: paket DI TUMPUK — pakai paket dengan qty terbesar yang masih
 * muat, sebanyak mungkin, lalu sisanya dibayar harga satuan.
 *
 *   1 pcs -> satuan              = 18.000
 *   2 pcs -> paket 2             = 35.000
 *   3 pcs -> paket 2 + 1 satuan  = 53.000
 *   4 pcs -> paket 4             = 65.000
 *   5 pcs -> paket 4 + 1 satuan  = 83.000
 *   6 pcs -> paket 4 + paket 2   = 100.000
 *   8 pcs -> paket 4 x2          = 130.000
 */
export function calcBundle(
  totalItems: number,
  avgUnitPrice: number,
  tiers: BundleTier[],
  enabled = true
): BundleBreakdown {
  const base = totalItems * avgUnitPrice;
  const plain: BundleBreakdown = {
    tiers: [],
    leftover: totalItems,
    bundleTotal: 0,
    leftoverTotal: base,
    base,
    total: base,
    saving: 0,
  };
  if (!enabled || totalItems < 2) return plain;

  const valid = tiers
    .filter((t) => t.qty >= 2 && t.price >= 0)
    .sort((a, b) => b.qty - a.qty);
  if (valid.length === 0) return plain;

  // Paket ditumpuk: ambil yang qty-nya terbesar selama masih muat.
  const used: BundleTier[] = [];
  let left = totalItems;
  while (left >= 2) {
    const tier = valid.find((t) => t.qty <= left);
    if (!tier) break;
    used.push(tier);
    left -= tier.qty;
  }

  const bundleTotal = used.reduce((sum, t) => sum + t.price, 0);
  const coveredQty = used.reduce((sum, t) => sum + t.qty, 0);
  const leftover = totalItems - coveredQty;
  const leftoverTotal = leftover * avgUnitPrice;
  const total = bundleTotal + leftoverTotal;

  // Kalau paketnya ternyata tidak lebih murah dari beli satuan, pakai satuan.
  if (total >= base) return plain;

  return { tiers: used, leftover, bundleTotal, leftoverTotal, base, total, saving: base - total };
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

export function paymentLabel(method: PaymentMethod, lang: Language): string {
  if (method === "cash") return lang === "en" ? "Pay in cash" : "Bayar tunai";
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

export function clampQty(qty: number, max: number): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.max(1, Math.min(Math.floor(qty), Math.max(1, max)));
}

export function remainingStock(flavor: { stock_enabled: boolean; stock: number }): number | null {
  return flavor.stock_enabled ? flavor.stock : null;
}

export function isSoldOut(flavor: { is_active: boolean; stock_enabled: boolean; stock: number }): boolean {
  return !flavor.is_active || (flavor.stock_enabled && flavor.stock <= 0);
}
