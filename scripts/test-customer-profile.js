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

  // 1. Test as anon
  console.log("\n=== Test customer_profile as ANON ===");
  await c.query("SET ROLE anon");
  try {
    const r = await c.query("SELECT public.customer_profile() AS result");
    console.log("OK:", r.rows[0]);
  } catch (e) {
    console.log("ERR:", e.message);
  }

  // 2. Test as authenticated
  console.log("\n=== Test customer_profile as AUTHENTICATED ===");
  await c.query("RESET ROLE");
  try {
    const r = await c.query("SELECT public.customer_profile() AS result");
    console.log("OK:", r.rows[0]);
  } catch (e) {
    console.log("ERR:", e.message);
  }

  // 3. Grants check
  console.log("\n=== Grants on customer_profile ===");
  const grants = await c.query(`
    SELECT grantee, privilege_type
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'customer_profile'
  `);
  for (const g of grants.rows) {
    console.log(`  ${g.grantee}: ${g.privilege_type}`);
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });