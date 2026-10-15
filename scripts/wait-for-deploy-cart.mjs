// Tunggu sampai build BARU (528dc3a, keranjang) benar-benar live.
//
// Gotcha #26: verifikasi deploy TIDAK boleh cuma cek HTTP 200, karena
// homepage akan tetap 200 baik di build lama maupun baru. Yang dicari
// adalah marker yang HANYA ada di build baru.
//
// Gotcha #118: jangan pakai `wait-for-deploy-reviews.mjs` untuk ini. Marker
// ulasan (`photoTooMany`, "Bintang tertinggi", ...) sudah live sejak
// migration-58, jadi skrip itu akan langsung bilang "SIAP" padahal build
// keranjang belum naik sama sekali. False positive adalah skrip verifikasi
// yang paling mahal.
//
// Marker yang dipakai (semua dari 528dc3a):
//   - "emptyInOrder"    key i18n baru; tidak ada di build lama
//   - "Lihat keranjang" teks dock baru
//   - "data-cart-dock"  atribut penanda dock, ada di beranda DAN /order
//   - "data-cart-rail"  panel samping desktop di langkah "Pilih Rasa"
//
// Skrip ini READ-ONLY: hanya GET halaman produksi dan file statiknya.
import process from "node:process";

const BASE = process.env.JS_DEPLOY_URL || "https://japanese-sando.vercel.app";
const MAKS_CHUNK = 70;

// [nama marker, harus muncul]
//
// SEMUA marker di sini adalah kunci i18n atau atribut BARU yang tidak pernah
// ada sebelum commit 528dc3a. Keberadaannya saja sudah cukup membuktikan
// build baru - tidak perlu penanda "build lama yang harus hilang".
//
// DUA marker yang sempat dipakai dan SALAH:
//   - `emptyLabel` -> ternyata milik `MenuBrowser`, masih ada di kode sekarang.
//     Bukan penanda build lama.
//   - `data-cart-rail` -> hanya dirender di `/order` pada langkah "Pilih Rasa"
//     DAN hanya kalau keranjang berisi (dibaca dari localStorage). Halaman
//     beranda tidak pernah punya itu, jadi marker ini mustahil ditemukan di
//     sini.
const MARKER = [
  ["emptyInOrder", true],
  ["emptyOnHome", true],
  ["bundleSlots", true],
  ["data-cart-dock", true],
  ["data-cart-sheet", true],
];

async function ambil(url) {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " untuk " + url);
  return res.text();
}

async function cekSekali() {
  const html = await ambil(BASE + "/?_=" + Date.now());

  const aset = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./[\]@%]+?\.(?:js|css)/g)) {
    aset.add(m[0]);
  }
  const daftar = [...aset].slice(0, MAKS_CHUNK);

  const status = new Map(MARKER.map(([n]) => [n, false]));
  let assetError = 0;

  await Promise.all(
    daftar.map(async (a) => {
      try {
        const t = await ambil(BASE + a);
        for (const [nama] of MARKER) {
          if (t.includes(nama)) status.set(nama, true);
        }
      } catch {
        assetError++;
      }
    }),
  );

  // Marker juga boleh sudah ada di HTML server-rendered.
  for (const [nama] of MARKER) {
    if (html.includes(nama)) status.set(nama, true);
  }

  return { status, jumlahAset: daftar.length, assetError };
}

let percobaan = 0;
const MAKS = 40; // sekitar 6 menit dengan jeda 9 detik

while (percobaan < MAKS) {
  percobaan++;
  let hasil = null;
  try {
    hasil = await cekSekali();
  } catch (e) {
    console.log("percobaan " + percobaan + ": gagal ambil halaman - " + String(e.message || e));
    await new Promise((r) => setTimeout(r, 9000));
    continue;
  }

  // JANGAN destructure `hasil.status.entries()` untuk Expectations: yang keluar
  // dari `entries()` adalah PASANGAN (nama -> nilai), jadi `harusnya` di sini
  // sebenarnya nilai yang sedang dibaca, bukan nilai yang diharapkan. Dengan
  // begitu `nilai !== nilai` selalu false, `gagal` selalu kosong, dan skrip
  // melapor "SIUP" padahal semua marker baru justru belum ada. Ekspektasi
  // harus dibaca dari `MARKER`, bukan dari map hasil.
  const gagal = MARKER.filter(
    ([nama, harusnya]) => hasil.status.get(nama) !== harusnya,
  );

  console.log(
    "percobaan " + String(percobaan).padStart(2) + "/" + MAKS +
      "  aset=" + hasil.jumlahAset +
      (hasil.assetError ? "  (asset gagal: " + hasil.assetError + ")" : "") +
      "  " + [...hasil.status.entries()].map(([n, v]) => (v ? "+" : "-") + n).join(" "),
  );

  if (gagal.length === 0) {
    console.log("");
    console.log("SIAP: build keranjang sudah live.");
    for (const [nama, harusnya] of MARKER) {
      console.log("  " + (harusnya ? "ada    " : "tidak ada ") + nama);
    }
    process.exit(0);
  }

  if (percobaan === 1) {
    console.log("");
    console.log("Belum ada marker build keranjang. Yang belum terpenuhi:");
    for (const [nama] of gagal) console.log("  kurang " + nama);
    console.log("");
  }

  await new Promise((r) => setTimeout(r, 9000));
}

console.log("");
console.log("BELUM LIVE setelah " + MAKS + " percobaan. Tidak ada yang diubah.");
process.exit(1);