// Screenshot halaman lokal pada lebar tertentu.
//
// Dipakai karena viewport Browser bawaan = lebar panel FilePanel (639px),
// jadi breakpoint `lg:` (1024px) tidak pernah aktif di sana dan tampilan
// desktop tidak bisa dinilai dari sana. Lihat gotcha #116.
//
// Pakai Chrome headless supaya lebarnya benar-benar diatur lewat --window-size.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => fs.existsSync(p));

if (!CHROME) {
  console.log("GAGAL: tidak ada Chrome/Edge.");
  process.exit(1);
}

const OUT = path.resolve(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const target = process.argv[2] ?? "http://localhost:3000/";
const lebar = Number(process.argv[3] ?? 1440);
const tinggi = Number(process.argv[4] ?? 900);
const nama = process.argv[5] ?? "shot";

// Profile terpisah supaya tidak mengganggu sesi browser Steven yang sedang
// membuka localhost:3000 (Chromeheadless akan BERBAGAI profil kalau tidak).
const profil = path.join(process.cwd(), ".shots", ".profile-" + nama);

execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + profil,
    "--force-device-scale-factor=1",
    "--window-size=" + lebar + "," + tinggi,
    "--virtual-time-budget=9000",
    "--screenshot=" + path.join(OUT, nama + ".png"),
    target,
  ],
  { stdio: "pipe", timeout: 120000 },
);

const file = path.join(OUT, nama + ".png");
console.log(
  (fs.existsSync(file) ? "OK   " : "GAGAL") +
    "  " + lebar + "x" + tinggi +
    "  " + target +
    "  -> " + file +
    (fs.existsSync(file) ? "  (" + fs.statSync(file).size + " byte)" : ""),
);
process.exit(fs.existsSync(file) ? 0 : 1);