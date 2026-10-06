/**
 * Re-create create_order function with the FIXED body from migration-18.sql.
 *
 * Steps:
 * 1. DROP all overloads
 * 2. Read body from migration-18.sql (extract create_order function block)
 * 3. CREATE the function with that body
 * 4. Reload PostgREST cache
 */
const { Client } = require("pg");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const fs = require("fs");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

function extractCreateOrder(sql) {
  // Cari CREATE OR REPLACE FUNCTION block yg ngomongin create_order
  const startMarker = /create or replace function public\.create_order\s*\(/i;
  const startMatch = sql.match(startMarker);
  if (!startMatch) throw new Error("create_order function not found in migration-18.sql");

  // Function body ends dengan $$; (line followed by language decl di AS baris).
  // Cari $$; pertama setelah start (skip yang lain).
  const startIdx = startMatch.index;
  const rest = sql.substring(startIdx);
  const endMatch = rest.match(/\$\$\s*;/);
  if (!endMatch) throw new Error("End marker ($$;) not found");

  const endIdx = endMatch.index + endMatch[0].length;
  return rest.substring(0, endIdx);
}

(async () => {
  loadEnv();

  // 1. Read body from migration-18.sql
  const migrationPath = path.resolve(process.cwd(), "supabase/migration-18.sql");
  if (!existsSync(migrationPath)) {
    console.error("migration-18.sql tidak ditemukan di:", migrationPath);
    process.exit(1);
  }
  const sql = readFileSync(migrationPath, "utf8");
  const functionBody = extractCreateOrder(sql);
  console.log("✓ Extract create_order function dari migration-18.sql");
  console.log(`  Panjang body: ${functionBody.length} chars`);

  // 2. Connect
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // 3. Drop all overloads
  console.log("\n→ Drop semua overload create_order...");
  const overloads = await c.query(`
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_order' AND n.nspname = 'public'
  `);
  for (const row of overloads.rows) {
    await c.query(`DROP FUNCTION public.create_order(${row.args}) CASCADE`);
    console.log(`  ✓ Dropped create_order(${row.args.slice(0, 60)}...)`);
  }

  // 4. Re-create
  console.log("\n→ Re-create function dari migration-18...");
  try {
    await c.query(functionBody);
    console.log("  ✓ Function created");
  } catch (e) {
    console.error("  ✗ Gagal create:", e.message);
    process.exit(1);
  }

  // 5. Reload PostgREST
  try {
    await c.query("NOTIFY pgrst, 'reload schema'");
    console.log("  ✓ PostgREST cache reloaded");
  } catch (e) {
    console.log(`  Catatan: ${e.message}`);
  }

  // 6. Verify VALUES count
  const r = await c.query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'create_order' AND pronamespace = 'public'::regnamespace"
  );
  const src = r.rows[0].prosrc;
  const has27 = src.includes("-- qris_transaction_id");
  const insertIdx = src.indexOf("insert into public.orders (");
  const valuesIdx = src.indexOf(") values (", insertIdx);
  console.log("\n=== Verification ===");
  console.log(`  Has '-- qris_transaction_id' marker: ${has27}`);
  console.log(`  Values clause position: ${valuesIdx}`);
  console.log(`  Has 'qris_qr_url' in source: ${src.includes("'qris_qr_url'") || src.includes("qris_qr_url")}`);

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });