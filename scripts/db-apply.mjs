/**
 * Terapkan SATU file migrasi saja ke Supabase.
 *   node scripts/db-apply.mjs supabase/migration-40.sql
 *
 * Kenapa tidak `npm run db:push`? Skrip itu menjalankan ulang SEMUA file
 * skema + migration dari awal. Itu aman untuk DB kosong, tapi untuk DB yang
 * sudah berisi data itu berarti menjalankan ulang 40 migrasi historis
 * sekaligus — padahal yang dibutuhkan cuma satu.
 *
 * File yang bisa diterapkan berulang harus idempoten (create or replace,
 * add column if not exists, drop ... if exists), sama seperti biasa.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}

loadEnv();

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/db-apply.mjs <path-file-sql>");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), target);
if (!existsSync(sqlPath)) {
  console.error(`File tidak ditemukan: ${sqlPath}`);
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diisi. Tambahkan ke .env.local");
  process.exit(1);
}

const sql = readFileSync(sqlPath, "utf8");
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log(`→ Menjalankan ${target} (${sql.length} karakter)...`);
  await client.query(sql);
  console.log("✓ Berhasil.");
  await client.end();
  process.exit(0);
} catch (err) {
  console.error("\nGAGAL:", err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "code" in err) console.error("Kode:", err.code);
  console.error(
    "\nKalau muncul 'Tenant not found' / timeout, IP perangkat ini belum di-allowlist.\n" +
      "Buka Supabase Dashboard > Settings > Database > Connection string > " +
      "pilih yang mode 'Session pooler' dan pakai host aws-0-<region>.pooler.supabase.com " +
      "dengan user postgres.<kode-project>."
  );
  try {
    await client.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
