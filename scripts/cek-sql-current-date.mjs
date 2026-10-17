// READ-ONLY: pastikan tidak ada `current_date` telanjang di kode SQL migration.
//
//   node scripts/cek-sql-current-date.mjs              # migration sejak 61
//   node scripts/cek-sql-current-date.mjs <file.sql>   # satu file
//
// Migration 1-60 SENGAJA TIDAK diperiksa: file itu adalah catatan apa yang
// pernah dijalankan pada masanya, dan menyuntingnya berarti menulis ulang
// sejarah. Status `current_date` yang benar-benar berlaku hari ini ada di
// definisi fungsi LIVE, yang sudah dibersihkan oleh migration-61. Yang dijaga
// di sini hanya supaya ada regresi baru setelah era itu.
import { readFileSync, readdirSync } from "node:fs";

const AMBANG = 61;
const argumen = process.argv[2];
const files = argumen
  ? [argumen]
  : readdirSync("supabase")
      .filter((f) => {
        const n = Number(f.match(/^migration-(\d+)\.sql$/)?.[1] ?? 0);
        return n >= AMBANG;
      })
      .map((f) => `supabase/${f}`)
      .sort();

const barisBuruk = [];
for (const satu of files) {
  const lines = readFileSync(satu, "utf8").split(/\r?\n/);
  lines.forEach((l, i) => {
    const t = l.trim();
    const komentar = t.startsWith("--") || t.startsWith("*") || t.startsWith("'");
    if (!komentar && /(?<![.\w])current_date(?!\s*\(\s*\))/.test(l)) {
      // `public.current_date` atau `po_today()` juga boleh.
      if (!/public\.po_today\(\)/.test(l)) barisBuruk.push([satu, i + 1, t]);
    }
  });
}

if (barisBuruk.length === 0) {
  console.log(`OK ${files.length} file migration: tidak ada current_date telanjang di kode SQL.`);
} else {
  console.log(`PERHATIAN: ${barisBuruk.length} baris masih pakai current_date:`);
  for (const [f, n, t] of barisBuruk) console.log(`  ${f}:${n}: ${t}`);
  process.exitCode = 1;
}