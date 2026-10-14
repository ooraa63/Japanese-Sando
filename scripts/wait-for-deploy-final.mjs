// Tunggu sampai build BARU benar-benar live di produksi.
//
// Kenapa tidak cuma cek HTTP 200: halaman /order di server SELALU merender
// langkah pertama, dan bar keranjang hanya muncul di langkah "Pilih Rasa" yang
// dirender di client. Jadi HTML awal /order praktis SAMA antara build lama dan
// baru (gotcha #26: verifikasi deploy pakai marker, bukan status kode).
//
// Marker yang dipakai: substring kelas CSS yang hanya ada di build baru —
// `backdrop-blur md:px-6`.
//
//   Build LAMA : "... backdrop-blur md:hidden"
//                 (bar disembunyikan di desktop)
//   Build BARU : "... backdrop-blur md:px-6"
//                 (bar tampil di semua lebar, padding desktop)
//
// Substring `backdrop-blur md:px-6` tidak ada di build lama, dan `bottom-full
// right-3 mb-2.5` (WA di atas bar) juga hanya ada di build baru.
//
// Skrip ini READ-ONLY: hanya GET halaman produksi dan file statiknya.
import process from "node:process";

const BASE = process.env.JS_DEPLOY_URL || "https://japanese-sando.vercel.app";
const BARU = process.env.JS_MARKER_BARU || "backdrop-blur md:px-6";
const LAMA = process.env.JS_MARKER_LAMA || "backdrop-blur md:hidden";
const WA_ATAS = "bottom-full right-3 mb-2.5";
const MAKS_CHUNK = 60;

const kubik = (n) => n.toFixed(0);

async function ambil(url) {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " untuk " + url);
  return res.text();
}

async function cekSekali() {
  const html = await ambil(BASE + "/order?_=" + Date.now());

  // Kumpulkan semua aset statis yang dirujuk halaman ini: script, preload,
  // stylesheet. Kneedle Next menaruh chunk client-component di sini.
  const aset = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./\[\]@%]+?\.(?:js|css)/g)) {
    aset.add(m[0]);
  }
  const daftar = [...aset].slice(0, MAKS_CHUNK);

  let mengandungBaru = false;
  let mengandungLama = false;
  let mengandungWaAtas = false;
  const asetMarker = [];

  for (const a of daftar) {
    let teks;
    try {
      teks = await ambil(BASE + a);
    } catch {
      continue;
    }
    if (teks.includes(BARU)) {
      mengandungBaru = true;
      asetMarker.push(a);
    }
    if (teks.includes(LAMA)) mengandungLama = true;
    if (teks.includes(WA_ATAS)) mengandungWaAtas = true;
  }

  return {
    html: html.length,
    jumlahAset: daftar.length,
    mengandungBaru,
    mengandungLama,
    mengandungWaAtas,
    asetMarker,
  };
}

const argon = process.argv.includes("--baseline");

if (argon) {
  try {
    const r = await cekSekali();
    console.log("BASELINE " + BASE);
    console.log("  html=" + kubik(r.html) + " byte, aset=" + r.jumlahAset);
    console.log("  marker BARU (" + BARU + ") : " + (r.mengandungBaru ? "ADA" : "belum"));
    console.log("  marker LAMA (" + LAMA + ") : " + (r.mengandungLama ? "ADA" : "tidak"));
    console.log("  marker WA di atas (" + WA_ATAS + ") : " + (r.mengandungWaAtas ? "ADA" : "tidak"));
    if (r.asetMarker.length) console.log("  ditemukan di: " + r.asetMarker.join(", "));
  } catch (e) {
    console.log("BASELINE GAGAL: " + e.message);
    process.exit(1);
  }
} else {
  const maks = Number(process.env.JS_MAKS_Coba || 30);
  for (let i = 1; i <= maks; i++) {
    try {
      const r = await cekSekali();
      console.log(
        "[" + kubik(i) + "/" + maks + "] aset=" + r.jumlahAset +
          "  baru=" + (r.mengandungBaru ? "ADA" : "-") +
          "  lama=" + (r.mengandungLama ? "ADA" : "-") +
          "  wa-atas=" + (r.mengandungWaAtas ? "ADA" : "-"),
      );
      if (r.mengandungBaru && r.mengandungWaAtas) {
        console.log("");
        console.log("LIVE. Build baru terdeteksi di: " + r.asetMarker.join(", "));
        console.log("  marker BARU  : " + BARU);
        console.log("  marker LAMA  : " + LAMA + " (tidak boleh ada)");
        process.exit(0);
      }
    } catch (e) {
      console.log("[" + i + "/" + maks + "] gagal: " + e.message);
    }
    await new Promise((r) => setTimeout(r, 20000));
  }
  console.log("BELUM live setelah " + maks + " percobaan.");
  process.exit(1);
}