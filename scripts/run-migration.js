/**
 * Jalankan migrasi ke database (tidak dalam transaksi — sengaja commit).
 * Hanya untuk file yang sudah lolos `dry-run-migration.js`.
 *
 *   node scripts/run-migration.js supabase/migration-54.sql
 */
const fs = require("fs");
const { Client } = require("pg");

function loadEnv() {
  const path = require("path");
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

(async () => {
  loadEnv();
  const file = process.argv[2];
  if (!file) {
    console.error("Pemakaian: node scripts/run-migration.js <file.sql>");
    process.exit(1);
  }
  const sql = fs.readFileSync(file, "utf8");

  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  try {
    await c.query(sql);
    console.log("TERPASANG: " + file);
  } catch (e) {
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