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

export type PaymentMethod = "transfer" | "cash";
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
  /** Logo & tagline di bawah nama toko */
  logo_url: string | null;
  brand_line: string;
  updated_at: string;
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
  phone: string;
  delivery_method: DeliveryMethod;
  address: string | null;
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
