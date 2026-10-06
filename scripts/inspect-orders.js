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

  // 1. orders columns + types
  console.log("=== Orders table columns ===");
  const cols = await c.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
    ORDER BY ordinal_position
  `);
  for (const c2 of cols.rows) {
    console.log(`  ${c2.column_name}: ${c2.data_type} nullable=${c2.is_nullable} default=${c2.column_default || "null"}`);
  }

  // 2. orders CHECK constraints
  console.log("\n=== Orders check constraints ===");
  const checks = await c.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'orders' AND con.contype = 'c'
  `);
  for (const c2 of checks.rows) {
    console.log(`  ${c2.conname}: ${c2.def}`);
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });