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
const migration9Path = path.resolve(process.cwd(), "supabase/migration-9.sql");
const migration10Path = path.resolve(process.cwd(), "supabase/migration-10.sql");
const migration11Path = path.resolve(process.cwd(), "supabase/migration-11.sql");
const migration12Path = path.resolve(process.cwd(), "supabase/migration-12.sql");
const migration13Path = path.resolve(process.cwd(), "supabase/migration-13.sql");
const migration15Path = path.resolve(process.cwd(), "supabase/migration-15.sql");
const migration16Path = path.resolve(process.cwd(), "supabase/migration-16.sql");
const migration17Path = path.resolve(process.cwd(), "supabase/migration-17.sql");
const migration18Path = path.resolve(process.cwd(), "supabase/migration-18.sql");
const migration19Path = path.resolve(process.cwd(), "supabase/migration-19.sql");
const migration20Path = path.resolve(process.cwd(), "supabase/migration-20.sql");
const migration21Path = path.resolve(process.cwd(), "supabase/migration-21.sql");
const migration22Path = path.resolve(process.cwd(), "supabase/migration-22.sql");
const migration23Path = path.resolve(process.cwd(), "supabase/migration-23.sql");
const migration24Path = path.resolve(process.cwd(), "supabase/migration-24.sql");
const migration25Path = path.resolve(process.cwd(), "supabase/migration-25.sql");
const migration26Path = path.resolve(process.cwd(), "supabase/migration-26.sql");
const migration27Path = path.resolve(process.cwd(), "supabase/migration-27.sql");
const migration28Path = path.resolve(process.cwd(), "supabase/migration-28.sql");
const migration29Path = path.resolve(process.cwd(), "supabase/migration-29.sql");
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
  (existsSync(migration8Path) ? readFileSync(migration8Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration9Path) ? readFileSync(migration9Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration10Path) ? readFileSync(migration10Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration11Path) ? readFileSync(migration11Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration12Path) ? readFileSync(migration12Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration13Path) ? readFileSync(migration13Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration15Path) ? readFileSync(migration15Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration16Path) ? readFileSync(migration16Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration17Path) ? readFileSync(migration17Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration18Path) ? readFileSync(migration18Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration19Path) ? readFileSync(migration19Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration20Path) ? readFileSync(migration20Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration21Path) ? readFileSync(migration21Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration22Path) ? readFileSync(migration22Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration23Path) ? readFileSync(migration23Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration24Path) ? readFileSync(migration24Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration25Path) ? readFileSync(migration25Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration26Path) ? readFileSync(migration26Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration27Path) ? readFileSync(migration27Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration28Path) ? readFileSync(migration28Path, "utf8") : "") +
  "\n\n" +
  (existsSync(migration29Path) ? readFileSync(migration29Path, "utf8") : "");

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  console.log("Terhubung ke database.");

  // Jalankan SQL per file agar error bisa dilokalisasi. Tiap file di-query
  // terpisah; bila ada yang gagal, kita tahu yang mana.
  const parts = [
    { name: "schema.sql", sql: schemaSql },
    { name: "migration-2.sql", sql: existsSync(migration2Path) ? readFileSync(migration2Path, "utf8") : "" },
    { name: "migration-3.sql", sql: existsSync(migration3Path) ? readFileSync(migration3Path, "utf8") : "" },
    { name: "migration-4.sql", sql: existsSync(migration4Path) ? readFileSync(migration4Path, "utf8") : "" },
    { name: "migration-5.sql", sql: existsSync(migration5Path) ? readFileSync(migration5Path, "utf8") : "" },
    { name: "migration-6.sql", sql: existsSync(migration6Path) ? readFileSync(migration6Path, "utf8") : "" },
    { name: "migration-7.sql", sql: existsSync(migration7Path) ? readFileSync(migration7Path, "utf8") : "" },
    { name: "migration-8.sql", sql: existsSync(migration8Path) ? readFileSync(migration8Path, "utf8") : "" },
    { name: "migration-9.sql", sql: existsSync(migration9Path) ? readFileSync(migration9Path, "utf8") : "" },
    { name: "migration-10.sql", sql: existsSync(migration10Path) ? readFileSync(migration10Path, "utf8") : "" },
    { name: "migration-11.sql", sql: existsSync(migration11Path) ? readFileSync(migration11Path, "utf8") : "" },
    { name: "migration-12.sql", sql: existsSync(migration12Path) ? readFileSync(migration12Path, "utf8") : "" },
    { name: "migration-13.sql", sql: existsSync(migration13Path) ? readFileSync(migration13Path, "utf8") : "" },
    { name: "migration-15.sql", sql: existsSync(migration15Path) ? readFileSync(migration15Path, "utf8") : "" },
    { name: "migration-16.sql", sql: existsSync(migration16Path) ? readFileSync(migration16Path, "utf8") : "" },
    { name: "migration-17.sql", sql: existsSync(migration17Path) ? readFileSync(migration17Path, "utf8") : "" },
    { name: "migration-18.sql", sql: existsSync(migration18Path) ? readFileSync(migration18Path, "utf8") : "" },
    { name: "migration-19.sql", sql: existsSync(migration19Path) ? readFileSync(migration19Path, "utf8") : "" },
    { name: "migration-20.sql", sql: existsSync(migration20Path) ? readFileSync(migration20Path, "utf8") : "" },
    { name: "migration-21.sql", sql: existsSync(migration21Path) ? readFileSync(migration21Path, "utf8") : "" },
    { name: "migration-22.sql", sql: existsSync(migration22Path) ? readFileSync(migration22Path, "utf8") : "" },
    { name: "migration-23.sql", sql: existsSync(migration23Path) ? readFileSync(migration23Path, "utf8") : "" },
    { name: "migration-24.sql", sql: existsSync(migration24Path) ? readFileSync(migration24Path, "utf8") : "" },
    { name: "migration-25.sql", sql: existsSync(migration25Path) ? readFileSync(migration25Path, "utf8") : "" },
    { name: "migration-26.sql", sql: existsSync(migration26Path) ? readFileSync(migration26Path, "utf8") : "" },
    { name: "migration-27.sql", sql: existsSync(migration27Path) ? readFileSync(migration27Path, "utf8") : "" },
    { name: "migration-28.sql", sql: existsSync(migration28Path) ? readFileSync(migration28Path, "utf8") : "" },
    { name: "migration-29.sql", sql: existsSync(migration29Path) ? readFileSync(migration29Path, "utf8") : "" },
  ].filter((p) => p.sql.trim().length > 0);

  for (const part of parts) {
    console.log(`→ Menjalankan ${part.name} (${part.sql.length} karakter)...`);
    await client.query(part.sql);
    console.log(`✓ ${part.name} selesai.`);
  }

  // Bersihkan overload create_order yang gak nyangkut lagi. Tiap migration
  // dengan signature beda bikin overload baru (gak postgreseret), lama
  // numpuk. Kita keep yang paling punya banyak parameter (signature lengkap),
  // drop sisanya. lihat quantity overload vs signature.
  console.log("\n→ Bersihkan overload create_order yang usang...");
  const overloads = await client.query(`
    SELECT pg_get_function_identity_arguments(p.oid) AS args, p.pronargs
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'create_order' AND n.nspname = 'public'
    ORDER BY p.pronargs DESC
  `);
  if (overloads.rows.length > 1) {
    // Keep yang paling banyak args-nya (signature terlengkap = migration terbaru)
    for (let i = 1; i < overloads.rows.length; i++) {
      const row = overloads.rows[i];
      await client.query(`DROP FUNCTION public.create_order(${row.args}) CASCADE`);
      console.log(`  ✓ Dropped create_order(${row.args.slice(0, 60)}...)`);
    }
  } else {
    console.log("  (hanya 1 overload, gak perlu dibersihkan)");
  }

  console.log("\n✅ Semua file SQL berhasil dijalankan.");

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
