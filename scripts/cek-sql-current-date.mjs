// READ-ONLY: pastikan tidak ada `current_date` telanjang di kode SQL migration.
import { readFileSync } from "node:fs";

const file = process.argv[2] ?? "supabase/migration-61.sql";
const lines = readFileSync(file, "utf8").split(/\r?\n/);
const buruk = [];
lines.forEach((l, i) => {
  const t = l.trim();
  const komentar = t.startsWith("--") || t.startsWith("*") || t.startsWith("'");
  if (!komentar && /(?<![.\w])current_date(?!\s*\(\s*\))/.test(l)) {
    // `public.current_date` atau `po_today()` juga boleh.
    if (!/public\.po_today\(\)/.test(l)) buruk.push([i + 1, t]);
  }
});
if (buruk.length === 0) {
  console.log(`OK ${file}: tidak ada current_date telanjang di kode SQL.`);
} else {
  console.log(`PERHATIAN ${file}: ${buruk.length} baris masih pakai current_date:`);
  for (const [n, t] of buruk) console.log(`  ${n}: ${t}`);
}