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

let buruk = 0;
for (const f of daftar) {
  let isi;
  try {
    isi = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  isi.split(/\r?\n/).forEach((l, i) => {
    if (JELEK.test(l)) {
      buruk += 1;
      console.log(`${f}:${i + 1}: ${l.trim().slice(0, 120)}`);
    }
  });
}

console.log(
  buruk === 0
    ? `OK ${daftar.length} file berubah: tidak ada karakter CJK/full-width.`
    : `${buruk} baris bermasalah.`
);
process.exitCode = buruk === 0 ? 0 : 1;