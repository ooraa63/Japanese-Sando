// Samakan akhir baris file teks jadi CRLF (Windows), tanpa mengubah isi lain.
import { readFileSync, writeFileSync } from "node:fs";

const target = process.argv[2];
if (!target) {
  console.error("pakai: node scripts/normalize-eol.mjs <file>");
  process.exit(1);
}
const sebelum = readFileSync(target, "utf8");
const sesudah = sebelum.replace(/\r?\n/g, "\r\n");
if (sebelum === sesudah) {
  console.log(`${target}: sudah CRLF semua.`);
} else {
  writeFileSync(target, sesudah, "utf8");
  const crlf = (sesudah.match(/\r\n/g) ?? []).length;
  const lf = (sesudah.match(/(?<!\r)\n/g) ?? []).length;
  console.log(`${target}: dinormalkan -> CRLF=${crlf} LF=${lf}`);
}