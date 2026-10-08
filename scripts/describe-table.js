/**
 * Lihat kolom sebuah tabel di schema public (read-only).
 *   node scripts/describe-table.js bundles
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
  const table = process.argv[2];
  if (!table) {
    console.error("Pakai: node scripts/describe-table.js <nama_tabel>");
    process.exit(1);
  }
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(
    `select ordinal_position as pos, column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position`,
    [table]
  );

  if (!rows.length) {
    console.log(`Tabel public.${table} tidak ada.`);
  } else {
    console.table(rows);
  }

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});