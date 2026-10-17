// READ-ONLY: daftar fungsi LIVE yang memakai `current_date`.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const file of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), file);
  if (!existsSync(full)) continue;
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(
  `select p.proname,
          pg_get_function_identity_arguments(p.oid) as args,
          n.nspname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc like '%current_date%'
    order by p.proname`,
);
console.log(`Fungsi live yang memakai current_date: ${r.rows.length}\n`);
for (const f of r.rows) {
  console.log(`  ${f.proname}(${f.args})`);
}

// Tampilkan hanya baris yang relevan supaya mudah dibaca.
console.log("\n=== Baris 'current_date' per fungsi ===");
for (const f of r.rows) {
  const s = await c.query(`select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=$1 and pg_get_function_identity_arguments(p.oid)=$2`,
    [f.proname, f.args]);
  const body = s.rows[0]?.prosrc ?? "";
  const lines = body.split("\n");
  console.log(`\n--- ${f.proname}(${f.args}) ---`);
  lines.forEach((ln, i) => {
    if (/current_date|open_at|close_at/.test(ln)) {
      console.log(`  ${String(i + 1).padStart(4)}: ${ln.trim()}`);
    }
  });
}

// Apakah sudah ada helper tanggal yang bisa dipakai ulang?
const helpers = await c.query(
  `select p.proname, pg_get_function_identity_arguments(p.oid) as args
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (p.proname like '%tanggal%' or p.proname like '%today%'
      or p.proname like '%wib%' or p.proname like '%jakarta%' or p.proname like '%now%')
    order by p.proname`,
);
console.log("\n=== Helper tanggal yang sudah ada ===");
console.log(helpers.rows.map((h) => `  ${h.proname}(${h.args})`).join("\n") || "  (tidak ada)");

await c.end();