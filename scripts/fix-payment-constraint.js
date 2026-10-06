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

  console.log("→ Drop constraint orders_payment_method_check...");
  await c.query("ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check");

  console.log("→ Add new constraint allowing 'transfer', 'qris_static', 'qris_midtrans'...");
  await c.query(`
    ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method = ANY (ARRAY['transfer'::text, 'qris_static'::text, 'qris_midtrans'::text]))
  `);

  console.log("→ Reload PostgREST cache...");
  await c.query("NOTIFY pgrst, 'reload schema'");

  // Verify
  const r = await c.query(`
    SELECT con.conname, pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public' AND rel.relname = 'orders' AND con.conname = 'orders_payment_method_check'
  `);
  console.log("✓ Constraint sekarang:");
  for (const row of r.rows) {
    console.log(`  ${row.conname}: ${row.def}`);
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });