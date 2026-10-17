// READ-ONLY: cek apa yang sebenarnya dikembalikan `track_by_code` untuk satu pesanan.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
for (const f of [".env.local", ".env"]) {
  const p = path.resolve(f);
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const KODE = process.argv[2] || "RK-261014-055";
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(`select public.track_by_code($1, $2) as json`, [KODE, "089614128890"]);
  const j = r.rows[0].json;
  console.log("flat_items:");
  for (const it of j.flat_items) console.log(`  ${it.quantity}x ${it.flavor_name} = ${it.line_total}`);
  console.log("bundles:", JSON.stringify(j.bundles, null, 2));
  const p = await c.query(`select public.public_invoice($1) as json`, [KODE]);
  console.log("public_invoice bundles:", JSON.stringify(p.rows[0].json.bundles, null, 2));
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});