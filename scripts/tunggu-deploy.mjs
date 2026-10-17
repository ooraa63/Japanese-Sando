/**
 * Tunggu deploy sampai build baru benar-benar di-serve Vercel.
 *
 * Kenapa cek ISI FILE CHUNK, bukan HTML: kamus i18n dimuat di client, jadi teks
 * terjemahan tidak pernah ada di HTML awal (gotcha #26).
 *
 * Kenapa penjaga harus dari BEBERAPA halaman: tiap route hanya memuat chunk
 * miliknya. Kalau cuma ambil chunk dari `/order`, perubahan yang cuma ada di
 * halaman lain (mis. lacak pesanan) akan terlihat "belum deploy" padahal
 * sudah.
 *
 * Cara pakai: ganti daftar `PENANDA` dengan sesuatu yang benar-benar baru di
 * commit yang sedang dideploy. Penanda harus:
 *   - HANYA bisa ada di build baru (kelas Tailwind baru, atribut data baru,
 *     atau kalimat i18n yang baru ditambah), dan
 *   - utuh setelah minify (string di dalam JS tetap ada; nama variabel tidak).
 *
 *   node scripts/tunggu-deploy.mjs
 */
import https from "node:https";

const BASE = process.env.DEPLOY_URL || "https://japanese-sando.vercel.app";

/** Halaman yang dijelajah. purposely lebih dari satu. */
const HALAMAN = ["/", "/order", "/track", "/riwayat", "/profile-menu/faq"];

/** Penanda build baru. Ganti setiap kali dipakai. */
const PENANDA = [
  "data-wa-nav",
  "overscroll-contain",
  "bg-matcha-50/70",
];

function get(url) {
  return new Promise((res, rej) => {
    https
      .get(url, { headers: { "User-Agent": "deploy-wait" } }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => res({ status: r.statusCode, body: b }));
      })
      .on("error", rej);
  });
}

async function kumpulkan() {
  const semua = new Set();
  const halaman = [];
  for (const h of HALAMAN) {
    const r = await get(BASE + h);
    if (r.status !== 200) {
      halaman.push(`${h} -> HTTP ${r.status}`);
      continue;
    }
    const urls = [
      ...new Set([...r.body.matchAll(/\/_next\/static\/[^"'\\\s]+\.js/g)].map((x) => BASE + x[0])),
    ];
    urls.forEach((u) => semua.add(u));
    halaman.push(`${h} -> ${urls.length} js`);
  }
  let kode = "";
  for (const u of semua) {
    const r = await get(u);
    if (r.status === 200) kode += r.body;
  }
  return { kode, halaman, jumlah: semua.size };
}

async function cek() {
  const { kode, halaman, jumlah } = await kumpulkan();
  const ada = PENANDA.filter((s) => kode.includes(s));
  return { kode, halaman, jumlah, ada };
}

let hasil = await cek();
console.log(`  ${hasil.halaman.join(" | ")}`);
console.log(`  ${hasil.jumlah} file js, ${hasil.kode.length} karakter`);
console.log(`  penanda: ${hasil.ada.length}/${PENANDA.length} ${JSON.stringify(hasil.ada)}\n`);

if (hasil.ada.length === PENANDA.length) {
  console.log("  LIVE SUDAH PAKAI BUILD BARU.");
  process.exit(0);
}

console.log("  Belum. Menunggu Vercel (maks 12 menit)...\n");
const deadline = Date.now() + 12 * 60 * 1000;
let ke = 0;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 25000));
  ke++;
  hasil = await cek();
  console.log(`  [${ke}] penanda ${hasil.ada.length}/${PENANDA.length} ${JSON.stringify(hasil.ada)}`);
  if (hasil.ada.length === PENANDA.length) {
    console.log("\n  LIVE SUDAH PAKAI BUILD BARU.");
    process.exit(0);
  }
}
console.log("\n  Timeout: deploy belum terdeteksi dalam 12 menit.");
process.exit(1);