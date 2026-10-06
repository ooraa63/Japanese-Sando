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
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const r = await c.query(`
    SELECT
      pg_get_function_identity_arguments(p.oid) AS signature,
      length(p.prosrc) AS body_size,
      (p.prosrc LIKE '%qris_transaction_id%') AS has_qris
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_order' AND n.nspname = 'public'
    ORDER BY p.pronargs DESC
  `);
  console.log(`Total: ${r.rows.length} overload(s)`);
  for (const row of r.rows) {
    console.log(`  args=${r.rows.length}, body_size=${row.body_size}, has_qris=${row.has_qris}`);
    console.log(`  sig: ${row.signature.slice(0, 90)}${row.signature.length > 90 ? "..." : ""}`);
  }
  await c.end();
})().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});