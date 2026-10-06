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

  // Default value untuk update
  const updates = { max_per_order: 10 };

  // Build dynamic UPDATE
  const setClauses = Object.keys(updates)
    .map((k, i) => `${k} = $${i + 1}`)
    .join(", ");
  const values = Object.values(updates);

  await c.query(
    `UPDATE public.store_settings SET ${setClauses} WHERE id = 1`,
    values
  );

  const r = await c.query(
    "SELECT min_order, max_per_order, is_preorder_open FROM public.store_settings WHERE id = 1"
  );
  console.log("Updated settings:", r.rows[0]);
  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });