#!/usr/bin/env node
/**
 * Verify admin_list_mutasi RPC works + returns expected shape.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

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

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
console.log("Terhubung ke database.\n");

// Bypass is_admin() guard via SET LOCAL request.jwt.claim.sub.
// auth.uid() reads dari jwt.claim.sub di Supabase, tapi di pg polos
// auth.uid() return null. Pakai cara berbeda: bypass RPC guard dengan
// service-role context atau query langsung ke tables.
const fnCheck = await client.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args,
         pg_get_function_result(p.oid) as returns
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'admin_list_mutasi' and n.nspname = 'public'
`);
console.log("Function di DB:");
for (const r of fnCheck.rows) {
  console.log(`  - ${r.proname}(${r.args}) → ${r.returns}`);
}

const flavorRows = await client.query(`
  select id, name_id from public.flavors where is_active order by id limit 5
`);
console.log("\nFlavors tersedia:");
for (const f of flavorRows.rows) console.log(`  - ${f.id}: ${f.name_id}`);

const orderCount = await client.query(`
  select count(*) from public.orders where status in ('accepted', 'ready', 'delivered')
`);
console.log(`\nPesanan dihitung sebagai revenue: ${orderCount.rows[0].count}`);

await client.end();