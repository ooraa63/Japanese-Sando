// ===== Domain types (cerminan tabel public di Supabase) =====

import type { Dict } from "@/lib/i18n/en";

export type { Dict };

export type Language = "id" | "en";

export type OrderStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "ready"
  | "delivered"
  | "cancelled";

export type PaymentMethod = "transfer";
export type DeliveryMethod = "pickup" | "delivery";

export interface Category {
  id: number;
  slug: string;
  name_id: string;
  name_en: string;
  desc_id: string;
  desc_en: string;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  /** Stok per-kategori — diisi di dashboard admin. */
  stock_enabled: boolean;
  stock: number;
  /** Hanya diisi di listing admin */
  flavor_count?: number;
  /** Hanya diisi di public_menu() */
  flavors?: Flavor[];
  /** Bundle eksplisit yang terkait kategori ini. */
  bundles?: Bundle[];
}

export interface Flavor {
  id: number;
  slug: string;
  name_id: string;
  name_en: string;
  desc_id: string;
  desc_en: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  stock_enabled: boolean;
  stock: number;
  sort_order: number;
  likes_count: number;
  category_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface BankAccount {
  bank: string;
  number: string;
  holder: string;
}

export interface StoreSettings {
  id: number;
  store_name: string;
  tagline_id: string;
  tagline_en: string;
  description_id: string;
  description_en: string;
  whatsapp: string;
  address: string;
  maps_url: string;
  instagram: string;
  tiktok: string;
  hours_id: string;
  hours_en: string;
  deadline_id: string;
  deadline_en: string;
  min_order: number;
  max_per_order: number;
  delivery_fee: number;
  free_shipping_min: number;
  bank_accounts: BankAccount[];
  qris_enabled: boolean;
  qris_image_url: string | null;
  announcement_id: string;
  announcement_en: string;
  is_preorder_open: boolean;
  /** Foto background halaman depan */
  hero_image_url: string | null;
  hero_image_mobile_url: string | null;
  /** Catatan cara pengambilan */
  pickup_note_id: string;
  pickup_note_en: string;
  delivery_note_id: string;
  delivery_note_en: string;
  /** Daftar zona delivery yang bisa dipilih pembeli. */
  delivery_zones: DeliveryZone[];
  /** Foto tambahan untuk hero carousel (desktop). */
  hero_carousel_urls?: string[];
  /** Foto tambahan untuk hero carousel (mobile) — tidak disamakan dengan desktop. */
  hero_mobile_carousel_urls?: string[];
  /** Logo & tagline di bawah nama toko */
  logo_url: string | null;
  brand_line: string;
  updated_at: string;
}

/**
 * Zona pengiriman — selain opsi "ambil di toko" (id='pickup'), penjual
 * dapat menambah zona lain (mis. 'Vihara Tian En', 'UVERS'). Tiap zona
 * punya ongkir dan catatan yang ditampilkan ke pembeli.
 */
export interface DeliveryZone {
  id: string;
  name_id: string;
  name_en: string;
  fee: number;
  note_id?: string;
  note_en?: string;
}

/**
 * Bundle eksplisit — paket kombinasi yang penjual jual sebagai item
 * tersendiri. Saat pembeli memilih bundle, mereka wajib memilih
 * `required_qty` pcs rasa (biasanya dari kategori yang sama).
 */
export interface Bundle {
  id: number;
  category_id: number | null;
  slug: string;
  name_id: string;
  name_en: string;
  desc_id: string;
  desc_en: string;
  price: number;
  /** Jumlah slot rasa yang harus dipilih saat beli. */
  required_qty: number;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
}

/** Slot pilihan rasa di dalam bundle (di sisi order). */
export interface BundleSlotPick {
  slot: number;
  flavor_id: number;
}

export interface OrderItem {
  flavor_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Order {
  id: number;
  order_code: string;
  customer_name: string;
  customer_email: string | null;
  instagram: string | null;
  phone: string;
  delivery_method: DeliveryMethod;
  delivery_zone: string;
  address: string | null;
  address_note: string | null;
  lat: number | null;
  lng: number | null;
  payment_method: PaymentMethod;
  transfer_method: string | null;
  payment_proof_path: string | null;
  note: string;
  admin_note: string;
  subtotal: number;
  delivery_fee: number;
  total_price: number;
  item_count: number;
  status: OrderStatus;
  language: Language;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

export interface TrackedOrder {
  order_code: string;
  customer_name: string;
  phone: string;
  status: OrderStatus;
  delivery_method: DeliveryMethod;
  address: string | null;
  payment_method: PaymentMethod;
  note: string;
  subtotal: number;
  delivery_fee: number;
  total_price: number;
  item_count: number;
  language: Language;
  created_at: string;
  updated_at: string;
  items: OrderItem[];
}

/** Satu baris keranjang: rasa + jumlah. */
export interface CartLine {
  flavor: Flavor;
  qty: number;
}

/**
 * Bundle yang sudah ada di keranjang pembeli. Setiap bundle punya
 * `required_qty` slot; tiap slot menyimpan flavor_id yang dipilih.
 *
 * Backend (`create_order(p_bundles)`) menerima array seperti ini:
 *   [{ bundle_id, slots: [{flavor_id}, ...] }]
 * dan akan menyimpan stok per-rasa + memvalidasi kecocokan kategori.
 */
export interface CartBundleEntry {
  /** Id baris keranjang (uniq per entry). Dipakai untuk hapus / edit. */
  id: string;
  bundle: Bundle;
  /** Isi slot: untuk slot 1..N, simpan flavorId yang dipilih. */
  slots: Array<number | null>;
}

/**
 * Snapshot invoice yang disimpan di sessionStorage setelah pesanan dibuat.
 * Dipakai oleh halaman sukses untuk menampilkan rincian seperti invoice
 * tanpa harus query database lagi (RLS menutup akses publik ke tabel orders).
 */
export interface InvoiceLineItem {
  /** Nama jenis makanan (mis. "Sando Sandwich"), kosong untuk item tanpa kategori. */
  category: string;
  /** Total PCS untuk jenis makanan ini (paket dihitung per jenis). */
  qty: number;
  /** Harga satuan rerata (= base / qty), untuk tampilan di invoice. */
  unit_price: number;
  /** Total harga untuk jenis makanan ini setelah paket. */
  line_total: number;
  /** Rincian per rasa di dalam jenis makanan ini. */
  flavors: Array<{
    name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;
}

/**
 * Item flat dari RPC publik `public_invoice` / `track_order` — tidak
 * dikelompokkan per kategori, hanya daftar baris dari tabel `order_items`.
 */
export interface InvoiceFlatItem {
  flavor_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

/** Bundle entry di invoice publik (RPC) + snapshot lokal. */
export interface InvoiceBundleEntry {
  bundle_id: number;
  bundle_name: string;
  /** Tiap slot: flavor yang dipilih di slot tsb. */
  slots: Array<{
    slot: number;
    flavor_id: number;
    flavor_name: string;
  }>;
}

export interface InvoiceSnapshot {
  order_code: string;
  customer_name: string;
  phone: string;
  address: string | null;
  note: string;
  payment_method: PaymentMethod;
  transfer_method: string | null;
  delivery_method: DeliveryMethod;
  created_at: string;
  language: Language;
  /** Item dikelompokkan per kategori (format lengkap, dari sessionStorage). */
  items?: InvoiceLineItem[];
  /** Item flat (dari RPC publik). Opsional: jika `items` tidak ada, gunakan ini. */
  flat_items?: InvoiceFlatItem[];
  /**
   * Bundle yang ada di pesanan ini (dari RPC publik `public_invoice`).
   * Tiap bundle berisi slot-slot berisi nama rasa yang dipilih. Snapshot
   * lokal (sessionStorage) mungkin menyimpan versi lebih lengkap dengan
   * `unit_price` per-slot.
   */
  bundles?: InvoiceBundleEntry[];
  subtotal: number;
  delivery_fee: number;
  /** Hemat dari paket (base - subtotal). 0 kalau tidak ada paket / tidak diketahui. */
  saving: number;
  total: number;
}

export interface DashboardStats {
  pending_orders: number;
  accepted_orders: number;
  ready_orders: number;
  total_orders: number;
  revenue_today: number;
  orders_today: number;
  revenue_month: number;
  flavor_count: number;
  sales_by_flavor: Array<{ flavor_name: string; qty: number }>;
}

/** Buyer opsional — kalau customer login, profil ini tersedia untuk auto-fill. */
export interface CustomerProfile {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  instagram: string | null;
  created_at: string;
  updated_at: string;
}

/** Ringkasan pesanan milik customer (untuk halaman /account). */
export interface CustomerOrderSummary {
  id: number;
  order_code: string;
  status: OrderStatus;
  subtotal: number;
  delivery_fee: number;
  total_price: number;
  item_count: number;
  delivery_method: DeliveryMethod;
  delivery_zone: string;
  created_at: string;
  updated_at: string;
  language: Language;
}

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "staff";
  is_active: boolean;
  created_at: string;
  /** Hanya diisi di daftar akun (Pengaturan) */
  last_sign_in?: string | null;
  confirmed?: boolean;
}
