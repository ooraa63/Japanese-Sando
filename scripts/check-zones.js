/**
 * Lihat isi tabel delivery_zones + apakah ada kolom catatan pickup.
 * Read-only, aman dijalankan kapan saja.
 *
 *   node scripts/check-zones.js
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
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
    select id, name_id, name_en, fee, kind, is_active,
           requires_address, sort_order, lat, lng, radius_km
      from public.delivery_zones
     order by kind asc, sort_order asc, id asc
  `);
  console.log("\n=== Isi public.delivery_zones ===\n");
  console.table(rows);

  const { rows: cols } = await c.query(`
    select column_name, data_type
      from information_schema.columns
     where table_schema = 'public' and table_name = 'delivery_zones'
     order by ordinal_position
  `);
  console.log("\n=== Kolom delivery_zones ===");
  console.log(cols.map((x) => x.column_name).join(", "));

  // Apakah RPC admin benar-benar menyimpan `kind`?
  const { rows: fn } = await c.query(`
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'admin_upsert_zone'
  `);
  const def = fn[0]?.def ?? "";
  console.log("\n=== admin_upsert_zone ===");
  console.log("menyimpan kolom `kind`? ", /\bkind\b/.test(def) ? "YA" : "TIDAK  <-- gap item 10");

  const { rows: counts } = await c.query(`
    select delivery_method, count(*)::int as jml, sum(total_price)::bigint as total
      from public.orders group by 1 order by 1
  `);
  console.log("\n=== Ringkasan order per metode (cek total bayar item 9) ===");
  console.table(counts);

  await c.end();
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
});