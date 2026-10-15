// Tunggu sampai build BARU (migration-58 ulasan) benar-benar live.
//
// Gotcha #26: verifikasi deploy TIDAK boleh cuma cek HTTP 200, karena
// homepage akan tetap 200 baik di build lama maupun baru. Yang dicari
// adalah marker yang HANYA ada di build baru.
//
// Marker yang dipakai (semua berasal dari 678a85d):
//   - "photoTooMany"        key i18n baru; tidak ada sama sekali di build lama
//   - "Maksimal 3 foto"     teks baru; build lama masih "Satu foto saja"
//   - "Bintang tertinggi"   tab sortir baru di beranda
//   - "review-photos"       nama bucket baru
//
// Skrip ini READ-ONLY: hanya GET halaman produksi dan file statiknya.
import process from "node:process";

const BASE = process.env.JS_DEPLOY_URL || "https://japanese-sando.vercel.app";
const MAKS_CHUNK = 70;

// [nama marker, harus muncul]
const MARKER = [
  ["photoTooMany", true],
  ["Maksimal 3 foto", true],
  ["Bintang tertinggi", true],
  ["review-photos", true],
  // Teks build LAMA. Kalau masih ada, ini belum build baru.
  ["Satu foto saja", false],
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

let hasil = null;
let percobaan = 0;
const MAKS = 40; // ~6 menit dengan jeda 9 detik

while (percobaan < MAKS) {
  percobaan++;
  try {
    hasil = await cekSekali();
  } catch (e) {
    console.log("percobaan " + percobaan + ": gagal ambil halaman - " + String(e.message || e));
    await new Promise((r) => setTimeout(r, 9000));
    continue;
  }

  const gagal = [...hasil.status.entries()].filter(
    ([nama, harusnya]) => hasil.status.get(nama) !== harusnya,
  );

  console.log(
    "percobaan " + String(percobaan).padStart(2) + "/" + MAKS +
    "  aset=" + hasil.jumlahAset +
    (hasil.assetError ? "  (asset gagal: " + hasil.assetError + ")" : "") +
    "  " + [...hasil.status.entries()]
      .map(([n, v]) => (v ? "+" : "-") + n)
      .join(" "),
  );

  if (gagal.length === 0) {
    console.log("");
    console.log("SIAP: build baru sudah live.");
    for (const [nama] of MARKER) {
      console.log("  ada   " + nama);
    }
    process.exit(0);
  }

  if (percobaan === 1) {
    console.log("");
    console.log("Belum ada marker build baru. Marker yang belum terpenuhi:");
    for (const [nama] of gagal) console.log("  kurang " + nama);
    console.log("");
  }

  await new Promise((r) => setTimeout(r, 9000));
}

console.log("");
console.log("BELUM LIVE setelah " + MAKS + " percobaan. Tidak ada yang diubah.");
process.exit(1);