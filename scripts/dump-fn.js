/**
 * Tampilkan source function tertentu dari database (read-only).
 *   node scripts/dump-fn.js <nama_fungsi>
 * Contoh: node scripts/dump-fn.js admin_set_stock
 */
const { Client } = require("pg");

function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

(async () => {
  const name = process.argv[2];
  if (!name) {
    console.error("Pakai: node scripts/dump-fn.js <nama_fungsi>");
    process.exit(1);
  }
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query(
    `select pg_get_function_identity_arguments(p.oid) as args, p.prosrc
       from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1
      order by p.pronargs`,
    [name]
  );
  if (!rows.length) {
    console.log(`Fungsi "${name}" tidak ada di schema public.`);
  }
  for (const r of rows) {
    console.log(`\n=============== ${name}(${r.args}) ===============\n`);
    console.log(r.prosrc);
  }
  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});