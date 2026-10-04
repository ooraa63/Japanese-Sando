/**
 * Jalankan skema database langsung ke Supabase.
 *   npm run db:push
 *
 * Membaca DATABASE_URL dari .env.local
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

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL belum diisi. Tambahkan ke .env.local");
  process.exit(1);
}

const schemaPath = path.resolve(process.cwd(), "supabase/schema.sql");
const schemaSql = readFileSync(schemaPath, "utf8");
const migration2Path = path.resolve(process.cwd(), "supabase/migration-2.sql");
const migration3Path = path.resolve(process.cwd(), "supabase/migration-3.sql");
const migration4Path = path.resolve(process.cwd(), "supabase/migration-4.sql");
const migration5Path = path.resolve(process.cwd(), "supabase/migration-5.sql");
const migration6Path = path.resolve(process.cwd(), "supabase/migration-6.sql");
const migration7Path = path.resolve(process.cwd(), "supabase/migration-7.sql");
const migration8Path = path.resolve(process.cwd(), "supabase/migration-8.sql");
const sql =
  schemaSql +
  "\n\n" +
  (existsSync(migration2Path) ? readFileSync(migration2Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration3Path) ? readFileSync(migration3Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration4Path) ? readFileSync(migration4Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration5Path) ? readFileSync(migration5Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration6Path) ? readFileSync(migration6Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration7Path) ? readFileSync(migration7Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration8Path) ? readFileSync(migration8Path, "utf8") : "");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Terhubung ke database.");

  await client.query(sql);
  console.log("Skema berhasil dijalankan.");

  // Minta PostgREST memuat ulang definisi fungsi (kalau tidak, RPC baru
  // akan ditolak dengan PGRST202 sampai cache kedaluwarsa).
  try {
    await client.query("notify pgrst, 'reload schema'");
    await new Promise((r) => setTimeout(r, 1200));
    console.log("Cache skema PostgREST disegarkan.");
  } catch (e) {
    console.log("Catatan: gagal menyegarkan cache PostgREST:", e.message);
  }

  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name;
  `);
  console.log("Tabel:", rows.map((r) => r.table_name).join(", "));

  const { rows: flavors } = await client.query(
    `select slug, name_id, price, stock from public.flavors order by sort_order;`
  );
  console.log(`\nProduk tersimpan (${flavors.length}):`);
  for (const f of flavors) {
    console.log(`  - ${f.name_id} | Rp${f.price.toLocaleString("id-ID")} | stok ${f.stock}`);
  }

  await client.end();
  process.exit(0);
} catch (err) {
  console.error("\nGAGAL:", err instanceof Error ? err.message : err);
  if (err && typeof err === "object" && "code" in err) {
    console.error("Kode:", err.code);
  }
  console.error(
    "\nKalau muncul 'Tenant not found' / timeout, IP perangkat ini belum di-allowlist.\n" +
      "Buka Supabase Dashboard > Settings > Database > Connection string > " +
      "pilih yang mode 'Session pooler' dan pakai host aws-0-<region>.pooler.supabase.com\n" +
      "dengan user postgres.<kode-project>."
  );
  try {
    await client.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
