/**
 * Re-create public_invoice from migration-18.sql (FIXED).
 * Extracts just the public_invoice function block.
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

function extract(sql, fnName) {
  const startRe = new RegExp(`create or replace function public\\.${fnName}\\s*\\(`, "i");
  const startMatch = sql.match(startRe);
  if (!startMatch) throw new Error(`${fnName} not found`);
  const rest = sql.substring(startMatch.index);
  const endMatch = rest.match(/\$\$\s*;/);
  if (!endMatch) throw new Error(`End $$ not found for ${fnName}`);
  return rest.substring(0, endMatch.index + endMatch[0].length);
}

(async () => {
  loadEnv();
  const migrationPath = path.resolve(process.cwd(), "supabase/migration-18.sql");
  const sql = readFileSync(migrationPath, "utf8");
  const fnBody = extract(sql, "public_invoice");

  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Drop all overloads
  const overloads = await c.query(
    `SELECT pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.proname = 'public_invoice' AND n.nspname = 'public'`
  );
  for (const row of overloads.rows) {
    await c.query(`DROP FUNCTION public.public_invoice(${row.args}) CASCADE`);
    console.log(`  ✓ Dropped public_invoice(${row.args.slice(0, 60)}...)`);
  }

  console.log("\n→ Re-create dari migration-18.sql...");
  await c.query(fnBody);
  console.log("  ✓ Created");

  await c.query("NOTIFY pgrst, 'reload schema'");
  console.log("  ✓ PostgREST cache reloaded");

  // Test
  const r = await c.query("SELECT order_code FROM public.orders ORDER BY created_at DESC LIMIT 1");
  if (r.rows.length > 0) {
    const code = r.rows[0].order_code;
    const test = await c.query("SELECT public.public_invoice($1) AS result", [code]);
    const result = test.rows[0].result;
    console.log(`\n=== Test public_invoice('${code}') ===`);
    if (result) {
      console.log("  total:", result.total);
      console.log("  subtotal:", result.subtotal);
      console.log("  payment_method:", result.payment_method);
      console.log("  qris_status:", result.qris_status);
    } else {
      console.log("  NULL (order not found)");
    }
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });