/**
 * Bukti deploy: file JS yang benar-benar di-serve Vercel sudah berisi kode
 * dari commit terbaru.
 *
 * Kenapa tidak cukup cuma cek HTML? Kamus i18n dimuat di client, jadi teks
 * translate-an TIDAK muncul di HTML awal. Yang harus diperiksa adalah isi
 * `/_next/static/chunks/*.js` yang di referensi halaman itu.
 *
 * Gotcha #26: penanda harus BENAR-BENAR baru. Semua string di bawah hanya
 * masuk di commit 17-10-2026 sore ini, jadi kemunculannya di live sudah
 * pasti build baru.
 *
 *   node scripts/wait-for-deploy-17-okt.mjs
 */
import https from "node:https";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const BASE = "https://japanese-sando.vercel.app";

/** String BARU di commit ini. */
const BARU = [
  "Ketuk untuk lihat isi paket",
  "Bayar sekali untuk semua e-wallet dan m-banking",
  "Buat QR baru",
  "disukai",
];
/** String LAMA yang harus hilang. */
const LAMA = ["Generate QR baru", "Coba refresh atau pilih metode lain"];

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "deploy-wait" } }, (r) => {
        let body = "";
        r.on("data", (d) => (body += d));
        r.on("end", () => resolve({ status: r.statusCode, body }));
      })
      .on("error", reject);
  });
}

const buildIdLokal = existsSync(path.resolve(".next/BUILD_ID"))
  ? readFileSync(path.resolve(".next/BUILD_ID"), "utf8").trim()
  : "(tidak ada .next lokal)";

async function cek() {
  const halaman = await get(`${BASE}/order`);
  const html = halaman.body;
  const mBuild = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  const buildIdLive = mBuild ? mBuild[1] : "(tidak terbaca)";

  // Kumpulkan semua file JS yang di-referensikan halaman.
  const urls = [
    ...new Set(
      [...html.matchAll(/\/_next\/static\/[^"'\\\s]+\.js/g)].map((x) => BASE + x[0]),
    ),
  ];
  // Batasi supaya tidak menarik terlalu banyak.
  const dipakai = urls.slice(0, 40);

  let kode = "";
  for (const u of dipakai) {
    const r = await get(u);
    if (r.status === 200) kode += r.body;
  }

  console.log(`  buildId live : ${buildIdLive}`);
  console.log(`  buildId lokal: ${buildIdLokal}`);
  console.log(`  file JS dicek: ${dipakai.length} (total ${kode.length} karakter)\n`);

  let ok = 0;
  let fail = 0;
  for (const s of BARU) {
    const ada = kode.includes(s);
    ada ? ok++ : fail++;
    console.log(`  ${ada ? "OK   " : "GAGAL"}  string baru ada di JS: "${s}"`);
  }
  for (const s of LAMA) {
    const masih = kode.includes(s);
    !masih ? ok++ : fail++;
    console.log(`  ${!masih ? "OK   " : "GAGAL"}  string lama sudah hilang: "${s}"`);
  }
  return { ok, fail, buildIdLive, jumlahJs: dipakai.length, panjang: kode.length };
}

console.log("=== CEK SEKARANG ===");
let hasil = await cek();
console.log(`\n  ringkasan: ${hasil.ok} OK / ${hasil.fail} GAGAL`);

if (hasil.fail === 0) {
  console.log("\n  LIVE SUDAH PAKAI BUILD BARU.");
  process.exit(0);
}

console.log("\n  Belum. Menunggu Vercel (maks 12 menit)...\n");
const deadline = Date.now() + 12 * 60 * 1000;
let ke = 0;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 25000));
  ke++;
  process.stdout.write(`  [${ke}] cek ulang... `);
  hasil = await cek();
  if (hasil.fail === 0) {
    console.log(`\n\n  LIVE SUDAH PAKAI BUILD BARU (buildId ${hasil.buildIdLive}).`);
    process.exit(0);
  }
  console.log(`${hasil.ok} OK / ${hasil.fail} GAGAL`);
}
console.log("\n  Timeout: deploy belum terdeteksi dalam 12 menit.");
process.exit(1);