// READ-ONLY: tampilkan potongan definisi fungsi live (membantu menulis migration).
import { readFileSync } from "node:fs";
const file = process.argv[2] ?? ".shots/fn-track-utf8.txt";
const cari = process.argv[3] ?? "bundle_id";
const sebelum = Number(process.argv[4] ?? 300);
const sesudah = Number(process.argv[5] ?? 1000);
const t = readFileSync(file, "utf8");
const i = t.indexOf(cari);
if (i < 0) {
  console.log(`"${cari}" tidak ada di ${file}`);
  process.exit(1);
}
console.log(t.slice(Math.max(0, i - sebelum), i + sesudah));