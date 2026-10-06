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
  const src = r.rows[0].prosrc;
  const idx = src.indexOf("qris_transaction_id");
  console.log("Found 'qris_transaction_id' at index:", idx);
  if (idx >= 0) {
    const snippet = src.substring(idx - 50, idx + 500);
    console.log("\n--- Context around qris_transaction_id ---");
    console.log(snippet);
  }

  // Count VALUES after INSERT INTO public.orders
  const insertIdx = src.indexOf("insert into public.orders (");
  if (insertIdx !== -1) {
    const valuesIdx = src.indexOf(") values (", insertIdx);
    if (valuesIdx !== -1) {
      const endIdx = src.indexOf(")", valuesIdx + 10);
      const valuesSection = src.substring(valuesIdx, endIdx + 1);
      // Count commas at value boundary
      const valueCount = (valuesSection.match(/,(?![^(]*\))/g) || []).length + 1;
      console.log(`\nVALUES count: ${valueCount}`);
    }
  }

  await c.end();
})().catch((e) => { console.error(e.message); process.exit(1); });