/**
 * Bersihkan semua data uji: pesanan, item, log stok, dan user auth.
 * Stok produk dikembalikan ke 20 (nilai seed awal).
 *   node scripts/cleanup.mjs
 */
import { Client } from "pg";
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

console.log(`Pesanan dihapus: ${beforeOrders[0].n}`);
console.log("\nStok produk:");
for (const f of beforeFlavors) console.log(`  ${f.slug.padEnd(20)} ${f.stock} -> 20`);

const { rows: afterOrders } = await c.query(`select count(*)::int as n from public.orders;`);
console.log(`\nSisa pesanan: ${afterOrders[0].n}`);
console.log("Catatan: user auth TIDAK dihapus, pakai scripts/_reset.mjs bila perlu.");

await c.end();
