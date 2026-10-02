/**
 * Uji alur admin: buat akun pertama, lalu uji terima/tolak pesanan
 * beserta pengembalian stok.
 *
 *   node scripts/test-admin.mjs
 *
 * Kalau project Supabase mengaktifkan "Confirm email", akun tidak akan
 * langsung punya sesi. Script ini akan melaporkannya.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}
loadEnv();

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// GoTrue menolak email dengan "+" / TLD .test, jadi pakai bentuk sederhana.
const EMAIL = `sando-tester-${Date.now()}@example.com`;
const PASSWORD = "SandoTest123!";
const FULL_NAME = "Tester Otomatis";

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) {
    pass++;
    console.log(`  OK   ${name}`);
  } else {
    fail++;
    console.log(`  GAGAL ${name} ${extra}`);
  }
}

const anonHeaders = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

async function rpc(name, args = {}, token = null) {
  const headers = token
    ? { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : anonHeaders;
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

async function rest(table, query = "", token = null) {
  const headers = token
    ? { apikey: KEY, Authorization: `Bearer ${token}` }
    : { apikey: KEY, Authorization: `Bearer ${KEY}` };
  const res = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null };
}

console.log("\n=== 1. Masuk sebagai admin ===");
const adminCountBefore = (await rpc("public_admin_count")).body;
console.log(`  admin terdaftar: ${adminCountBefore}`);

let session = null;

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  const body = await res.json();
  session = body.access_token ?? null;
  check("berhasil masuk dengan email + password", res.ok && Boolean(session),
    JSON.stringify(body).slice(0, 160));
} else if (adminCountBefore === 0) {
  const res = await fetch(`${BASE}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, data: { full_name: FULL_NAME } }),
  });
  const body = await res.json();
  session = body.access_token ?? null;
  check("pendaftaran akun pertama berhasil", res.ok && Boolean(body.id),
    JSON.stringify(body).slice(0, 160));
} else {
  console.log("  (isi ADMIN_EMAIL + ADMIN_PASSWORD untuk menguji dashboard admin)");
}

if (!session) {
  console.log("\n  Tidak bisa lanjut tanpa sesi.");
  console.log("  Set ADMIN_EMAIL dan ADMIN_PASSWORD, lalu jalankan ulang.\n");
  process.exit(1);
}

const auth = { apikey: KEY, Authorization: `Bearer ${session}`, "Content-Type": "application/json" };

async function rpcAuth(name, args = {}) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

console.log("\n=== 2. Hak akses admin ===");
const isAdmin = await rpcAuth("is_admin");
check("is_admin() = true setelah daftar", isAdmin.body === true, JSON.stringify(isAdmin.body));

const users = await rest("admins", "select=email,role&limit=5", session);
check("bisa membaca daftar admin", users.ok && Array.isArray(users.body), JSON.stringify(users.body));
console.log(`       admin terdaftar: ${users.body?.map((u) => u.email).join(", ")}`);

console.log("\n=== 3. Statistik & daftar pesanan ===");
const stats = await rpcAuth("admin_dashboard_stats");
check("statistik dashboard terbaca", stats.ok && typeof stats.body?.pending_orders === "number",
  JSON.stringify(stats.body).slice(0, 200));

const list = await rpcAuth("admin_list_orders", { p_status: null, p_search: null, p_limit: 50, p_offset: 0 });
check("daftar pesanan terbaca", list.ok && Array.isArray(list.body?.orders),
  JSON.stringify(list.body).slice(0, 200));
console.log(`       total pesanan: ${list.body?.total}`);

console.log("\n=== 4. Terima / tolak pesanan + pengembalian stok ===");
const created = await rpc("create_order", {
  p_customer_name: "Siti Aminah",
  p_phone: "085711223344",
  p_payment_method: "cash",
  p_delivery_method: "pickup",
  p_items: [{ flavor_id: 2, quantity: 3 }],
});
check("pesanan uji dibuat", created.ok && Boolean(created.body?.order_code),
  JSON.stringify(created.body));
const orderId = created.body?.id;

const searchByName = await rpcAuth("admin_list_orders", { p_search: "Siti", p_limit: 10, p_offset: 0 });
check("pencarian pesanan berdasarkan nama",
  searchByName.ok && (searchByName.body?.orders?.length ?? 0) >= 1
    && searchByName.body.orders.every((o) => o.customer_name.includes("Siti")),
  JSON.stringify(searchByName.body).slice(0, 160));

const searchByCode = await rpcAuth("admin_list_orders", {
  p_search: created.body?.order_code,
  p_limit: 10,
  p_offset: 0,
});
check("pencarian pesanan berdasarkan kode", searchByCode.ok && (searchByCode.body?.orders?.length ?? 0) === 1,
  JSON.stringify(searchByCode.body).slice(0, 160));

const searchNone = await rpcAuth("admin_list_orders", { p_search: "zzzTidakAda", p_limit: 10, p_offset: 0 });
check("pencarian tanpa hasil mengembalikan array kosong",
  searchNone.ok && Array.isArray(searchNone.body?.orders) && searchNone.body.orders.length === 0);

const filterPending = await rpcAuth("admin_list_orders", {
  p_status: "pending",
  p_search: null,
  p_limit: 50,
  p_offset: 0,
});
check("filter status berjalan",
  filterPending.ok && filterPending.body.orders.every((o) => o.status === "pending"),
  JSON.stringify(filterPending.body?.orders?.map((o) => o.status)).slice(0, 120));

const stockOf = async (id) =>
  (await rest("flavors", `select=stock&id=eq.${id}&limit=1`)).body[0].stock;

const stockAfterOrder = await stockOf(2);
check("stok berkurang 3 setelah pesanan dibuat", stockAfterOrder <= 17, `stok=${stockAfterOrder}`);

const accepted = await rpcAuth("admin_update_order_status", {
  p_order_id: orderId,
  p_new_status: "accepted",
  p_admin_note: "Dicatat oleh test",
});
check("pesanan bisa DITERIMA", accepted.ok, JSON.stringify(accepted.body));

const ready = await rpcAuth("admin_update_order_status", {
  p_order_id: orderId,
  p_new_status: "ready",
});
check("pesanan bisa ditandai SIAP", ready.ok, JSON.stringify(ready.body));

const delivered = await rpcAuth("admin_update_order_status", {
  p_order_id: orderId,
  p_new_status: "delivered",
});
check("pesanan bisa ditandai SELESAI", delivered.ok, JSON.stringify(delivered.body));

// Pesanan kedua untuk menguji pengembalian stok
const created2 = await rpc("create_order", {
  p_customer_name: "Rina Dewi",
  p_phone: "081377889900",
  p_payment_method: "cash",
  p_delivery_method: "pickup",
  p_items: [{ flavor_id: 2, quantity: 4 }],
});
const orderId2 = created2.body?.id;
const stockBeforeReject = await stockOf(2);

const rejected = await rpcAuth("admin_update_order_status", {
  p_order_id: orderId2,
  p_new_status: "rejected",
});
check("pesanan bisa DITOLAK", rejected.ok, JSON.stringify(rejected.body));

const stockAfterReject = await stockOf(2);
check(
  `stok kembali +4 setelah ditolak (${stockBeforeReject} -> ${stockAfterReject})`,
  stockAfterReject === stockBeforeReject + 4
);

const backToPending = await rpcAuth("admin_update_order_status", {
  p_order_id: orderId2,
  p_new_status: "pending",
});
check("pesanan bisa dikembalikan ke menunggu", backToPending.ok, JSON.stringify(backToPending.body));

const stockAfterUndo = await stockOf(2);
check(
  `stok dipesan ulang saat dikembalikan (${stockAfterReject} -> ${stockAfterUndo})`,
  stockAfterUndo === stockBeforeReject
);

// Bersihkan: tolak lagi supaya stok netral
await rpcAuth("admin_update_order_status", { p_order_id: orderId2, p_new_status: "rejected" });
await rpcAuth("admin_update_order_status", { p_order_id: orderId, p_new_status: "cancelled" });
await rpcAuth("admin_update_order_status", { p_order_id: orderId, p_new_status: "pending" });
await rpcAuth("admin_update_order_status", { p_order_id: orderId, p_new_status: "cancelled" });
await rpcAuth("admin_update_order_status", { p_order_id: orderId, p_new_status: "pending" });

console.log("\n=== 5. Tolak status tidak valid ===");
const bogus = await rpcAuth("admin_update_order_status", {
  p_order_id: orderId,
  p_new_status: "entah",
});
check("status ngawur ditolak", !bogus.ok, JSON.stringify(bogus.body));

const ghost = await rpcAuth("admin_update_order_status", {
  p_order_id: 99999999,
  p_new_status: "accepted",
});
check("pesanan tidak ada ditolak", !ghost.ok, JSON.stringify(ghost.body));

console.log("\n=== 6. Simpan produk & pengaturan ===");
/** Baca nama toko yang sedang dipakai supaya test tidak mengubahnya. */
async function currentStoreName() {
  const res = await rest("store_settings", "select=store_name&id=eq.1&limit=1", session);
  return res.body?.[0]?.store_name ?? "Rumakomugi";
}
console.log(`  nama toko sekarang: ${await currentStoreName()}`);

const newFlavor = await rpcAuth("admin_save_flavor", {
  p_payload: {
    name_id: "Rasa Uji Otomatis",
    name_en: "Automated Test Flavor",
    desc_id: "Dibuat oleh test",
    price: 22000,
    stock_enabled: true,
    stock: 5,
    is_active: true,
    is_featured: false,
    sort_order: 99,
  },
});
check("produk baru bisa ditambahkan", newFlavor.ok && Boolean(newFlavor.body?.id),
  JSON.stringify(newFlavor.body));
const newFlavorId = newFlavor.body?.id;

const updated = await rpcAuth("admin_save_flavor", {
  p_payload: { id: newFlavorId, name_id: "Rasa Uji Diperbarui", price: 25000, stock: 3 },
});
check("produk bisa diperbarui", updated.ok, JSON.stringify(updated.body));

const restocked = await rpcAuth("admin_set_stock", { p_flavor_id: newFlavorId, p_stock: 9 });
check("stok bisa diatur manual", restocked.ok, JSON.stringify(restocked.body));

const deleted = await rpcAuth("admin_delete_flavor", { p_flavor_id: newFlavorId });
check("produk bisa dihapus", deleted.ok, JSON.stringify(deleted.body));

const settingsSaved = await rpcAuth("admin_save_settings", {
  p_payload: { store_name: currentStoreName(), min_order: 1, whatsapp: "" },
});
check("pengaturan bisa disimpan", settingsSaved.ok, JSON.stringify(settingsSaved.body));

console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`  Akun test: ${EMAIL}`);
console.log(`${"=".repeat(46)}\n`);

process.exit(fail > 0 ? 1 : 0);
