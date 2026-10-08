/**
 * Lihat detail bundle termasuk harga coret (read-only).
 *   node scripts/check-bundle-price.js
 */
const { Client } = require("pg");

function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(`
    select b.id, b.name_id, b.name_en, b.required_qty, b.category_id,
           b.is_active,
           b.price,
           b.compare_price,
           case
             when b.compare_price is null then 'tidak ada harga coret'
             when b.compare_price > b.price
               then 'POTONGAN ' || round((100.0 * (b.compare_price - b.price) / b.compare_price)) || '%'
             else 'compare_price tidak lebih besar dari price (tidak tampil)'
           end as status_diskon
      from public.bundles b
     order by b.id
  `);
  console.log("\n=== Bundle & harga coret ===\n");
  console.table(rows);

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});