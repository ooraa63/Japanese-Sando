// Bukti bahwa pembelian bundle MENGURANGI stok kategori yang sama dengan
// pembelian rasa biasa (create_order mengurangi categories.stock satu pcs per
// slot bundle). Kita panggil create_order lewat RPC lewat PostgREST dengan
// service role supaya boleh (RPC butuh auth), lalu cek stok sebelum/sesudah.
//
// Jalankan: node scripts/verify-bundle-stock.mjs
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const { rows: bundleRows } = await client.query(
  `select b.id, b.name_id, b.required_qty, b.category_id,
          (select f.id from flavors f
            where f.is_active
              and (b.category_id is null or f.category_id = b.category_id)
            order by f.id limit 1) as sample_flavor_id
     from bundles b where b.is_active limit 1`
);
if (bundleRows.length === 0) {
  console.log("Tidak ada bundle aktif untuk dites.");
  await client.end();
  process.exit(0);
}

const bundle = bundleRows[0];
console.log("Bundle:", bundle);

const catId =
  bundle.category_id ??
  (
    await client.query(
      `select category_id from flavors where id = $1`,
      [bundle.sample_flavor_id]
    )
  ).rows[0].category_id;

const before = await client.query(
  `select stock from categories where id = $1`,
  [catId]
);
console.log("\nStok kategori", catId, "SEBELUM:", before.rows[0].stock);

// Panggil expire_stale_qris_orders sebagai "pembeli" uji: tidak realistis.
// Lebih aman: simulasikan pengurangan yang sama persis seperti create_order
// di dalam transaksi, lalu rollback supaya data produksi tidak berubah.
await client.query("begin");
// Item biasa: 1 pcs rasa #1. Bundle: required_qty slot rasa #1.
const sample = bundle.sample_flavor_id;
const items = [{ flavor_id: sample, quantity: 1 }];
const slots = Array.from({ length: bundle.required_qty }, () => ({
  flavor_id: sample,
}));

const { data, error } = await client.query(
  `select public.create_order(
     p_customer_name => 'Uji Bundle',
     p_phone => '080000000000',
     p_payment_method => 'qris_midtrans',
     p_delivery_method => 'pickup',
     p_items => $1::jsonb,
     p_bundles => $2::jsonb
   )`,
  [JSON.stringify(items), JSON.stringify([{ bundle_id: bundle.id, slots }])]
);
console.log("\ncreate_order:", error ? "GAGAL: " + error.message : "berhasil");

if (!error) {
  const after = await client.query(
    `select stock from categories where id = $1`,
    [catId]
  );
  const delta = before.rows[0].stock - after.rows[0].stock;
  const expected = 1 + bundle.required_qty;
  console.log("Stok kategori", catId, "SESUDAH:", after.rows[0].stock);
  console.log(
    `\nSelisih stok: ${delta} (harus ${expected} = 1 item biasa + ${bundle.required_qty} slot bundle)`
  );
  console.log(delta === expected ? "✅ BUNCLE BENAR" : "❌ SELISIH TIDAK COCOK");
}

await client.query("rollback");
console.log("\n[transaksi di-rollback — data produksi tidak berubah]");
await client.end();