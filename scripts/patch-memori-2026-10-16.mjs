// Terapkan entry CHANGELOG + gotchas baru hasil perbaikan 16-10-2026.
//
// Isi markdown diambil dari file biasa (scripts/tmp-*.md) supaya tidak perlu
// escaping backtick di dalam template literal -- kesalahan yang sudah pernah
// membuat skrip ini gagal parse.
import fs from "node:fs";
import path from "node:path";
import { patchFile } from "./_patch.mjs";

const baca = (nama) =>
  fs.readFileSync(path.resolve(process.cwd(), "scripts", nama), "utf8").replace(/\r\n/g, "\n");

const changelogBaru = baca("tmp-changelog.md");
const gotchasBaru = baca("tmp-gotchas.md");

const changelog = [
  [
    "---\n\n## 2026-10-15 — Paket dengan pilihan terpisah (mode ketiga)",
    changelogBaru + "\n## 2026-10-15 — Paket dengan pilihan terpisah (mode ketiga)",
  ],
];

console.log("OK  " + JSON.stringify(patchFile("MEMORY/CHANGELOG.md", changelog)));

// Gotchas ditambahkan di AKHIR file. Tidak lewat `patchFile` karena `replace`
// akan mengganti kemunculan pertama, bukan menyisipkan.
const gotchasPath = path.resolve(process.cwd(), "MEMORY/gotchas.md");
const gotchasAsli = fs.readFileSync(gotchasPath, "utf8");
const eol = gotchasAsli.includes("\r\n") ? "\r\n" : "\n";
const isiBaru = gotchasAsli.replace(/\r\n/g, "\n").replace(/\n+$/, "\n") + gotchasBaru;
fs.writeFileSync(
  gotchasPath,
  eol === "\r\n" ? isiBaru.split("\n").join("\r\n") : isiBaru,
  "utf8"
);
console.log(
  "OK  " +
    JSON.stringify({ file: "MEMORY/gotchas.md", eol: eol === "\r\n" ? "CRLF" : "LF", tambahan: gotchasBaru.length })
);