const { Client } = require("pg");

function loadEnv() {
  const fs = require("fs");
  const path = require("path");
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

(async () => {
  loadEnv();
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // List SEMUA RPC customer_*
  const r = await c.query(`
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS signature,
      length(p.prosrc) AS body_size
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('customer_profile', 'customer_upsert_own_profile', 'customer_bootstrap_from_metadata', 'customer_orders', 'customer_order')
    ORDER BY p.proname, p.pronargs
  `);

  console.log("Customer-related RPCs:");
  for (const row of r.rows) {
    console.log(`  ${row.proname}(${row.signature.slice(0, 80)})`);
    console.log(`    body=${row.body_size}b`);
  }

  // Cek grants
  console.log("\nGrants on customer_profile:");
  const grants = await c.query(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'customer_profile'
  `);
  for (const g of grants.rows) {
    console.log(`  ${grantee}: ${privilege_type}`);
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });