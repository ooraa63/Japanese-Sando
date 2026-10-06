/**
 * Drop semua overload create_order dari DB, lalu re-create dari migration-18.
 *
 * Usage:
 *   node scripts/drop-create-order.js
 *
 * Setelah sukses, jalankan:
 *   npm run db:push
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
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

(async () => {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL belum di-set di .env.local");
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✓ Terhubung ke DB");

  // 1. List semua overload create_order
  const list = await client.query(`
    SELECT pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_order' AND n.nspname = 'public'
    ORDER BY p.pronargs
  `);
  console.log(`\nDitemukan ${list.rows.length} overload:`);
  for (const r of list.rows) {
    console.log(`  - create_order(${r.args})`);
  }

  if (list.rows.length === 0) {
    console.log("\nSudah bersih. Lanjut ke npm run db:push.");
    await client.end();
    process.exit(0);
  }

  // 2. Drop semua
  console.log("\n→ Drop semua overload...");
  for (const r of list.rows) {
    const args = r.args;
    try {
      await client.query(`DROP FUNCTION public.create_order(${args}) CASCADE`);
      console.log(`  ✓ Dropped create_order(${args.slice(0, 60)}${args.length > 60 ? "..." : ""})`);
    } catch (err) {
      console.error(`  ✗ Gagal drop: ${err.message}`);
    }
  }

  // 3. Verify
  const verify = await client.query(`
    SELECT COUNT(*)::int AS c
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_order' AND n.nspname = 'public'
  `);
  console.log(`\n✓ Sisa overload: ${verify.rows[0].c}`);

  // 4. Reload PostgREST cache
  try {
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("✓ PostgREST cache di-reload");
  } catch (e) {
    console.log(`Catatan: gagal NOTIFY (${e.message}) — biasanya gak masalah`);
  }

  await client.end();
  console.log("\n→ Lanjut: cd .. && npm run db:push");
})().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});