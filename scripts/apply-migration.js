/**
 * Terapkan SATU file migration tertentu ke database.
 *   node scripts/apply-migration.js supabase/migration-38.sql
 *
 * Kenapa tidak `npm run db:push`? db-push menjalankan schema.sql + semua
 * migration dari awal (desainnya idempoten, tapi tetap-touch semua tabel).
 * Kalau cuma mau menerapkan satu migration, pakai script ini — lebih sempit
 * dan tidak menyentuh apa yang tidak perlu.
 *
 * HATI-HATI: script ini menulis ke DATABASE_URL yang ada di .env.local.
 * Jangan dipakai untuk file yang mengandung DELETE/UPDATE data produksi.
 */
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

(async () => {
  const target = process.argv[2];
  if (!target) {
    console.error("Pakai: node scripts/apply-migration.js <path/file.sql>");
    process.exit(1);
  }
  const full = path.resolve(process.cwd(), target);
  if (!existsSync(full)) {
    console.error(`File tidak ditemukan: ${full}`);
    process.exit(1);
  }

  const sql = readFileSync(full, "utf8");
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  console.log(`Menerapkan ${path.basename(full)} (${sql.length} karakter)...`);
  await c.query(sql);
  console.log(`✓ ${path.basename(full)} selesai.`);

  await c.end();
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});