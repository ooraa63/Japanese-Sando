// =============================================================================
//  scan-teks.mjs
//  Tolak file yang memuat karakter asing atau kata menempel.
//
//  Gotcha lama di project ini: `write` dan `edit` kadang menyisipkan CJK,
//  Cyrillic, Arab, atau menyatukan dua kata. Isinya
//  lolos ke build dan ke SQL, jadi harus dicek setiap kali file ditulis.
//
//  Pemakaian:  node scripts/scan-teks.mjs <file> [<file> ...]
// =============================================================================
import fs from "node:fs";
import path from "node:path";

const pola = [
  [/[\u3000-\u303f\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\ufb00-\ufdff]/, "CJK"],
  [/[\u0600-\u06ff\ufb50-\ufdff]/, "huruf Arab"],
  [/[\u0400-\u04ff]/, "huruf Cyrillic"],
  // Karakter kontrol kecuali TAB (09), LF (0a), CR (0d).
  [/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/, "karakter kontrol"],
  // Zero-width space/joiner/non-joiner dan BOM di tengah file.
  [/[\u00a0\u200b\u200c\u200d\u2060\ufeff]/, "karakter tak terlihat"],
];

const nempel = [
  "sudah" + "checked",
  "termasuk" + "ymm",
  "gd" + "gistry",
  "Mengetuknya" + "membuka",
  "tidak" + "showing",
  "dan" + "beberapa",
];

const target = process.argv.slice(2);
let gagal = 0;

for (const rel of target) {
  const p = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(p)) {
    console.log("  (tidak ada) " + rel);
    continue;
  }
  const isi = fs.readFileSync(p, "utf8");
  // BOM hanya boleh di byte pertama. Di tengah file tetap dilaporkan.
  const baris = isi.split(/\r?\n/);
  baris[0] = baris[0].replace(/^\uFEFF/, "");
  let masalah = 0;

  for (const [re, nama] of pola) {
    baris.forEach((b, i) => {
      const m = b.match(re);
      if (!m) return;
      masalah++;
      const kolom = m.index + 1;
      const kiri = Math.max(0, kolom - 25);
      const sekitar = b
        .slice(kiri, kolom + 25)
        .replace(
          /[\u0000-\u001f\ufffd]/g,
          (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")
        );
      console.log(
        "  " + rel + ":" + (i + 1) + ":" + kolom + "  [" + nama + "]  ..." + sekitar + "..."
      );
    });
  }

  for (const kata of nempel) {
    baris.forEach((b, i) => {
      if (!b.includes(kata)) return;
      masalah++;
      console.log("  " + rel + ":" + (i + 1) + "  [kata menempel] " + kata);
    });
  }

  if (masalah === 0) console.log("  BERSIH  " + rel);
  else gagal += masalah;
}

// EOL campur bikin `String.replace` multi-baris gagal tanpa memberi kabar, jadi dicek juga.
console.log("");
for (const rel of target) {
  const p = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(p)) continue;
  const isi = fs.readFileSync(p, "utf8");
  const crlf = (isi.match(/\r\n/g) ?? []).length;
  const lf = (isi.match(/(?<!\r)\n/g) ?? []).length;
  if (crlf > 0 && lf > 0) console.log("  EOL CAMPUR " + rel + ": CRLF=" + crlf + " LF=" + lf);
  else if (crlf > 0) console.log("  EOL CRLF   " + rel);
  else console.log("  EOL LF     " + rel);
}

console.log("");
console.log(gagal === 0 ? "SEMUA BERSIH" : "ADA MASALAH: " + gagal);
process.exit(gagal === 0 ? 0 : 1);