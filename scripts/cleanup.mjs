/**
 * Bersihkan semua data uji: pesanan, item, log stok, dan user auth.
 * Stok produk dikembalikan ke 20 (nilai seed awal).
 *   node scripts/cleanup.mjs
 */import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: beforeOrders } = await c.query(`select count(*)::int as n from public.orders;`);
const { rows: beforeFlavors } = await c.query(`select slug, stock from public.flavors order by sort_order;`);

await c.query(`delete from public.order_items;`);
await c.query(`delete from public.orders;`);
await c.query(`delete from public.stock_logs;`);
await c.query(`update public.flavors set stock = 20;`);
await c.query(`alter sequence public.order_code_seq restart with 1;`);

// Kembalikan pengaturan ke nilai siap-jualan. Nama toko SENGAJA tidak diubah.
await c.query(`
  update public.store_settings set
    is_preorder_open = true,
    stock_enabled   = true,
    total_stock     = 20,
    delivery_fee    = 0,
    max_per_order   = 20,
    min_order       = 1,
    bundle_enabled  = true,
    bundle_size     = 2,
    bundle_price    = 35000
  where id = 1;`);

console.log(`Pesanan dihapus: ${beforeOrders[0].n}`);
console.log("\nStok produk:");
for (const f of beforeFlavors) console.log(`  ${f.slug.padEnd(20)} ${f.stock} -> 20`);

const { rows: afterOrders } = await c.query(`select count(*)::int as n from public.orders;`);
const { rows: cfg } = await c.query(`
  select store_name, stock_enabled, total_stock, bundle_enabled, bundle_size,
         bundle_price, is_preorder_open
  from public.store_settings where id = 1;`);
const c0 = cfg[0];
console.log(`\nSisa pesanan: ${afterOrders[0].n}`);
console.log("\nPengaturan toko:");
console.log(`  nama toko    : ${c0.store_name}`);
console.log(`  pre-order    : ${c0.is_preorder_open ? "dibuka" : "ditutup"}`);
console.log(`  stok         : ${c0.stock_enabled ? `${c0.total_stock} pcs` : "tak terbatas"}`);
console.log(
  `  harga paket  : ${c0.bundle_enabled ? `${c0.bundle_size} pcs = Rp${Number(c0.bundle_price).toLocaleString("id-ID")}` : "dimatikan"}`
);
console.log("\nCatatan: user auth TIDAK dihapus.");

await c.end();
