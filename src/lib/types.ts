// ===== Domain types (cerminan tabel public di Supabase) =====

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
  /** Stok keseluruhan (bukan per rasa) */
  stock_enabled: boolean;
  total_stock: number;
  /** Foto background halaman depan */
  hero_image_url: string | null;
  hero_image_mobile_url: string | null;
  /** Catatan cara pengambilan */
  pickup_note_id: string;
  pickup_note_en: string;
  delivery_note_id: string;
  delivery_note_en: string;
  /** Harga paket */
  bundle_enabled: boolean;
  bundle_size: number;
  bundle_price: number;
  updated_at: string;
}

/** Harga paket: setiap `bundle_size` pcs jadi satu paket harga tetap. */
export interface BundleInfo {
  bundles: number;
  leftover: number;
  bundle_price: number | null;
  bundle_size?: number;
  unit_price: number;
  total: number;
  saving: number;
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

export interface CartLine {
  flavor: Flavor;
  quantity: number;
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
  /** Stok global */
  stock_enabled: boolean;
  total_stock: number;
  stock_used: number;
  /** Harga paket */
  bundle_enabled: boolean;
  bundle_size: number;
  bundle_price: number;
  sales_by_flavor: Array<{ flavor_name: string; qty: number }>;
}

export interface AdminUser {
  user_id: string;
  email: string;
  full_name: string;
  role: "owner" | "staff";
  is_active: boolean;
  created_at: string;
}
