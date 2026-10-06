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
  const cols = await c.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bundles' ORDER BY ordinal_position"
  );
  console.log("=== Bundles columns ===");
  for (const c2 of cols.rows) {
    console.log(`  ${c2.column_name}: ${c2.data_type}`);
  }
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });