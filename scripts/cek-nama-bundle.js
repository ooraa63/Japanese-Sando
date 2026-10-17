/**
 * Cek cepat: apakah nama paket (bundle) berbeda antara name_id dan name_en,
 * dan apakah sufiks slot di `order_items` selalu memakai name_id.
 *   node scripts/cek-nama-bundle.mjs
 */
const { Client } = require("pg");
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

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  const b = await c.query(
    `select id, name_id, name_en, price, required_qty, is_fixed
       from public.bundles order by id`,
  );
  console.log("== BUNDLE ==");
  for (const r of b.rows) console.log(` ${r.id} | ${r.name_id} | ${r.name_en} | ${r.price}`);

  const o = await c.query(
    `select oi.order_id, o.order_code, oi.flavor_name
       from public.order_items oi
       join public.orders o on o.id = oi.order_id
      where oi.flavor_name ~ '\\([^()]+#[0-9]+\\)$'
      order by oi.order_id, oi.id
      limit 20`,
  );
  console.log("\n== CONTOH SUFISK SLOT ==");
  for (const r of o.rows) console.log(` ${r.order_code} -> ${r.flavor_name}`);

  const n = await c.query(
    `select count(*)::int as beda
       from public.bundles where coalesce(name_id,'') <> coalesce(name_en,'')`,
  );
  console.log(`\nBundle dengan name_id != name_en: ${n.rows[0].beda}`);

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});