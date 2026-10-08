/**
 * Daftar SEMUA overload fungsi RPC di schema public.
 *   node scripts/verify-overloads.js
 *
 * Read-only. Tujuannya menemukan fungsi yang punya >1 overload dengan nama
 * sama — PostgREST bisa jadi ambigu saat resolve (error PGRST/bisa salah
 * pilih kandidat) kalau pemanggil tidak mengirim argumen yang membedakan.
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
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(`
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.pronargs,
           p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
    ORDER BY p.proname, p.pronargs
  `);

  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.proname)) byName.set(r.proname, []);
    byName.get(r.proname).push(r);
  }

  console.log(`Total fungsi di schema public: ${rows.length}`);
  console.log(`Nama fungsi berbeda: ${byName.size}\n`);

  let overloaded = 0;
  for (const [name, list] of byName) {
    if (list.length <= 1) continue;
    overloaded++;
    console.log(`OVERLOAD: ${name} (${list.length} versi)`);
    for (const v of list) console.log(`   - (${v.args})   [${v.signature}]`);
    console.log("");
  }

  if (overloaded === 0) {
    console.log("Tidak ada overload. Semua nama fungsi unik.");
  }

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});