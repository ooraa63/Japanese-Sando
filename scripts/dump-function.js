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
  const r = await c.query(
    "SELECT prosrc FROM pg_proc WHERE proname = 'create_order' AND pronamespace = 'public'::regnamespace"
  );
  // Save to file for inspection
  require("fs").writeFileSync("function-actual.sql", r.rows[0].prosrc);
  console.log("Function body length:", r.rows[0].prosrc.length);
  console.log("Saved to function-actual.sql");
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });