/**
 * Dry-run migrasi: jalankan di dalam transaksi lalu ROLLBACK.
 * Hanya memvalidasi sintaks SQL + memastikan semua objek yang dirujuk ada.
 * Tidak ada yang tersimpan permanen.
 *
 *   node scripts/dry-run-migration.js
 */
const fs = require("fs");
const { Client } = require("pg");

function loadEnv() {
  const fsx = require("fs");
  const path = require("path");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fsx.existsSync(full)) continue;
    for (const line of fsx.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

(async () => {
  loadEnv();
  const file = process.argv[2] || "supabase/migration-54.sql";
  const sql = fs.readFileSync(file, "utf8");

  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  try {
    await c.query("begin");
    await c.query(sql);
    await c.query("rollback");
    console.log("KERING: " + file + " valid, tidak ada yang tersimpan.");
  } catch (e) {
    try {
      await c.query("rollback");
    } catch {}
    console.error("GAGAL: " + e.message);
    if (e.position) console.error("  posisi karakter: " + e.position);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error("GAGAL koneksi:", e.message);
  process.exit(1);
});