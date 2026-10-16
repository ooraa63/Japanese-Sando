// Helper patching file sumber tanpa merusak akhir baris.
//
// Project ini campur CRLF dan LF. `edit` hanya cocok persis, jadi patch di sini
// selalu ditulis dengan LF; file asli dikembalikan ke EOL-nya sendiri.
//
// Pemakaian:  import { patchFile } from "./_patch.mjs";
//             await patchFile("src/.../File.tsx", [[cari, ganti], ...]);
//
// Setiap `cari` harus muncul PERSIS satu kali. Kalau 0 kali atau lebih dari 1,
// script berhenti dan tidak menulis apa pun — supaya patch yang salah tidak
// diam-diam merusak file.
import fs from "node:fs";
import path from "node:path";

export function eolOf(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

export function patchFile(relPath, edits, { cwd = process.cwd() } = {}) {
  const abs = path.resolve(cwd, relPath);
  const asli = fs.readFileSync(abs, "utf8");
  const eol = eolOf(asli);
  let teks = asli.split("\r\n").join("\n");

  for (const [i, pair] of edits.entries()) {
    const [cari, ganti] = pair;
    if (typeof cari !== "string" || cari.length === 0) {
      throw new Error(`${relPath} patch #${i}: "cari" kosong`);
    }
    const n = teks.split(cari).length - 1;
    if (n !== 1) {
      throw new Error(
        `${relPath} patch #${i}: "${cari.slice(0, 70).replace(/\n/g, "\\n")}" ` +
          `ditemukan ${n} kali, harus tepat 1`
      );
    }
    teks = teks.replace(cari, () => ganti);
  }

  const keluar = eol === "\r\n" ? teks.split("\n").join("\r\n") : teks;
  fs.writeFileSync(abs, keluar, "utf8");
  return { file: relPath, eol: eol === "\r\n" ? "CRLF" : "LF", bytes: Buffer.byteLength(keluar) };
}