// READ-ONLY: cari karakter CJK / full-width yang bocor ke teks Indonesia.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const daftar = execSync("git diff --name-only -- . ; git ls-files --others --exclude-standard", {
  encoding: "utf8",
})
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter((s) => s && /\.(ts|tsx|mjs|js|sql|md|json|css)$/.test(s));

// CJK, kana, full-width, dan beberapa blok yang sering muncul kalau ketik
// tidak sengaja di keyboard Mandarin.
const JELEK = /[\u1100-\u11ff\u3000-\u303f\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/u;

/*
 * Aksara non-Latin lain (Cyrillic, Arab, Hiragana/Katakana di luar blok atas,
 * Thai, Armenia, Ibrani). Semuanya tidak pernah muncul di teks Indonesia repo
 * ini. Awalnya cek ini hanya CJK, jadi satu kata Cyrillic sempat lolos ke
 * komentar `admin-nav.ts` tanpa ketahuan — lihat gotcha #152.
 */
const JELEK_LAIN = /[\u0370-\u03ff\u0400-\u052f\u0530-\u058f\u0590-\u05ff\u0600-\u06ff\u0700-\u074f\u0750-\u077f\u0900-\u0dff\u0e00-\u0e7f\u0e80-\u0eff\u1000-\u109f\u10a0-\u10ff\u1200-\u139f\u13a0-\u13ff\u1400-\u167f\u1680-\u169f\u1780-\u17ff\u3041-\u3096\u30a1-\u30fa]/u;

let buruk = 0;
for (const f of daftar) {
  let isi;
  try {
    isi = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  isi.split(/\r?\n/).forEach((l, i) => {
    if (JELEK.test(l) || JELEK_LAIN.test(l)) {
      buruk += 1;
      console.log(`${f}:${i + 1}: ${l.trim().slice(0, 120)}`);
    }
  });
}

console.log(
  buruk === 0
    ? `OK ${daftar.length} file berubah: tidak ada karakter asing (CJK/sipil/full-width).`
    : `${buruk} baris bermasalah.`
);
process.exitCode = buruk === 0 ? 0 : 1;