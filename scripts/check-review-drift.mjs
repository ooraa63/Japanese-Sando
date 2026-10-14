// Bandingkan definisi LIVE fungsi review dengan isi migration-21.sql.
// Kalau ada drift, dasar untuk menulis migration baru harus definisi LIVE,
// bukan file migration lama (gotcha #113).
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const sql21 = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-21.sql"), "utf8");

// Ambil blok $$ ... $$ milik tiap fungsi dari file migration.
const ambilBlok = (namaFungsi) => {
  const re = new RegExp(
    "create or replace function public\\." + namaFungsi + "\\([\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;",
    "i",
  );
  const m = sql21.match(re);
  return m ? m[1].trim() : null;
};

const normalisasi = (s) =>
  s
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

for (const fn of ["submit_review", "list_reviews", "has_review"]) {
  const live = await c.query(`
    select p.prosrc from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = $1
    order by p.pronargs desc limit 1
  `, [fn]);

  const liveSrc = live.rows[0] ? live.rows[0].prosrc : null;
  const fileSrc = ambilBlok(fn);

  if (!liveSrc) {
    console.log(fn + ": TIDAK ADA di produksi");
    continue;
  }
  const sama = normalisasi(liveSrc) === normalisasi(fileSrc || "");
  console.log(fn + ": " + (sama ? "SAMA dengan migration-21" : "BERBEDA dari migration-21"));
  if (!sama) {
    console.log("  panjang live=" + liveSrc.length + " file=" + (fileSrc ? fileSrc.length : 0));
  }
}

await c.end();