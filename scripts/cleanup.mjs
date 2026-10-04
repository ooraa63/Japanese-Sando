/**
 * Bersihkan state database setelah pengujian:
 *  - hapus semua pesanan uji
 *  - buang rasa & jenis makanan kembar
 *  - samakan slug ke bentuk baku dari nama ("Cookies & Cream" -> "cookies-cream")
 *  - pastikan semua rasa tertaut ke jenis makanan yang aktif
 *  - kembalikan pengaturan & paket harga ke nilai siap-jualan
 *
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

const c = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const beforeOrders = await c.query(`select count(*)::int as n from public.orders;`);
const beforeFlavors = await c.query(`select slug, stock from public.flavors order by sort_order;`);

await c.query(`delete from public.orders;`);
await c.query(`delete from public.stock_logs;`);

// Buang rasa & jenis makanan kembar. Yang sudah dipakai pesanan tidak
// dihapus -- hanya yang benar-benar duplikat. Dicocokkan dari nama
// (case- dan spasi-agnostic) supaya varian slug lama seperti
// "cookiescream" vs "cookies-cream" tetap dianggap kembar.
await c.query(`
  delete from public.flavors f
  using public.flavors d
  where lower(regexp_replace(btrim(f.name_id), '[^a-z0-9]+', '', 'g')) =
        lower(regexp_replace(btrim(d.name_id), '[^a-z0-9]+', '', 'g'))
    and f.id > d.id
    and not exists (select 1 from public.order_items oi where oi.flavor_id = f.id);`);

await c.query(`
  delete from public.categories c
  using public.categories d
  where lower(regexp_replace(btrim(c.name_id), '[^a-z0-9]+', '', 'g')) =
        lower(regexp_replace(btrim(d.name_id), '[^a-z0-9]+', '', 'g'))
    and c.id > d.id
    and not exists (select 1 from public.flavors f where f.category_id = c.id);`);

// Samakan slug ke bentuk baku dari nama supaya URL rapi & konsisten.
await c.query(`
  update public.flavors
  set slug = trim(both '-' from regexp_replace(lower(name_id), '[^a-z0-9]+', '-', 'g'));`);
await c.query(`
  update public.categories
  set slug = trim(both '-' from regexp_replace(lower(name_id), '[^a-z0-9]+', '-', 'g'));`);

// Buang sisa produk uji dari test (mis. "Croissant Mentega"). Hanya produk
// yang namanya menandai dirinya sebagai uji, jadi produk asli aman.
await c.query(`
  delete from public.flavors
  where lower(name_id) like '%croissant%'
     or lower(name_id) like '%uji%'
     or lower(name_id) like '%test%'
     or lower(name_id) like '%pajah%'
     or lower(name_id) like '%dummy%'
     or lower(name_id) like '%contoh%';`);

await c.query(`
  delete from public.categories
  where lower(slug) = 'croissant'
     or lower(name_id) like '%uji%'
     or lower(name_id) like '%test%'
     or lower(name_id) like '%pajah%'
     or lower(name_id) like '%dummy%';`);

// Pastikan semua rasa tertaut ke jenis makanan yang aktif
await c.query(`
  update public.flavors set category_id = (
    select id from public.categories where is_active order by sort_order, id limit 1)
  where category_id is null
     or not exists (select 1 from public.categories c where c.id = flavors.category_id);`);

await c.query(`update public.flavors set stock = 20;`);
await c.query(`alter sequence public.order_code_seq restart with 1;`);

// Paket harga milik jenis makanan (bukan pengaturan toko)
await c.query(`
  update public.categories
  set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
  where is_active and (bundle_tiers is null or jsonb_array_length(bundle_tiers) = 0);`);

// Kembalikan pengaturan ke nilai siap-jualan. Nama toko SENGAJA tidak diubah.
await c.query(`
  update public.store_settings set
    is_preorder_open = true,
    stock_enabled   = true,
    total_stock     = 20,
    delivery_fee    = 0,
    max_per_order   = 20,
    min_order       = 1
  where id = 1;`);

const { rows: cfg } = await c.query(`
  select store_name, stock_enabled, total_stock, is_preorder_open, brand_line
  from public.store_settings where id = 1;`);
const { rows: cats } = await c.query(`
  select c.slug, c.name_id, c.bundle_tiers,
         (select count(*) from public.flavors f where f.category_id = c.id)::int as rasa
  from public.categories c where c.is_active order by c.sort_order, c.id;`);
const { rows: flavors } = await c.query(`
  select name_id, slug, price from public.flavors where is_active order by sort_order, id;`);

const s = cfg[0];
console.log(`Pesanan dihapus: ${beforeOrders.rows[0].n}`);
console.log(`\nRasa (dari ${beforeFlavors.rows.length} baris):`);
for (const f of flavors) {
  console.log(`  ${f.name_id.padEnd(20)} ${f.slug.padEnd(20)} Rp${Number(f.price).toLocaleString("id-ID")}`);
}

console.log("\nPengaturan toko:");
console.log(`  nama toko    : ${s.store_name}`);
console.log(`  pre-order    : ${s.is_preorder_open ? "dibuka" : "ditutup"}`);
console.log(`  stok         : ${s.stock_enabled ? `${s.total_stock} pcs` : "tak terbatas"}`);
console.log(`  brand line   : ${s.brand_line || "-"}`);

console.log("\nJenis makanan & paket harga:");
for (const cat of cats) {
  const tiers = (cat.bundle_tiers || [])
    .map((t) => `${t.qty} pcs = Rp${Number(t.price).toLocaleString("id-ID")}`)
    .join(", ");
  console.log(`  ${cat.name_id} (${cat.slug}): ${cat.rasa} rasa | ${tiers || "tanpa paket"}`);
}

console.log("\nCatatan: user auth TIDAK dihapus.");
await c.end();
