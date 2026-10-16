// Tunggu sampai build BARU (paket dengan pilihan terpisah) benar-benar live.
//
// Gotcha #26: verifikasi deploy tidak boleh cuma cek HTTP 200, karena beranda
// tetap 200 baik di build lama maupun baru. Yang dicari adalah marker yang
// HANYA ada di build baru.
//
// Gotcha #118: jangan pakai ulang `wait-for-deploy-cart.mjs` atau
// `wait-for-deploy-reviews.mjs`. Marker mereka sudah live sejak batch
// sebelumnya, jadi skrip itu akan langsung bilang "SIUP" padahal build ini
// belum naik sama sekali.
//
// Gotcha #125: ekspektasi WAJIB dibaca dari `MARKER`, bukan dari map hasil.
// Destructure `entries()` memberi pasangan (nama -> nilai), jadi membandingkannya
// dengan dirinya sendiri selalu false dan `gagal` selalu kosong.
//
// Marker (semua kunci/atribut baru di commit ini):
//   - data-bundle-choice     atribut penanda satu blok pilihan di popup pembeli
//   - bundleChoiceTitle      kunci i18n baru, sisi pembeli
//   - bundleChoiceLabelDefault kunci i18n baru (label cadangan "Pilihan {n}")
//   - bundleModeChoice       kunci i18n baru, sisi admin
//   - invalid_bundle_slots   kode error baru dari admin_save_bundle
//
// Aset diambil dari GABUNGAN / dan /order: `MenuBrowser` (popup paket) ada di
// beranda, `OrderBundleModal` dipakai di /order. Kalau hanya satu halaman,
// sebagian marker bisa ada di chunk yang tidak pernah dimuat.
//
// Skrip ini READ-ONLY: hanya GET halaman produksi dan file statiknya.
import process from "node:process";

const BASE = process.env.JS_DEPLOY_URL || "https://japanese-sando.vercel.app";
const MAKS_ASET = 110;

const HALAMAN = ["/", "/order"];

const MARKER = [
  ["data-bundle-choice", true],
  ["bundleChoiceTitle", true],
  ["bundleChoiceLabelDefault", true],
  ["bundleModeChoice", true],
  ["invalid_bundle_slots", true],
];

async function ambil(url) {
  const res = await fetch(url, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " untuk " + url);
  return res.text();
}

async function cekSekali() {
  const aset = new Set();
  let htmlGabung = "";

  for (const halam of HALAMAN) {
    const html = await ambil(BASE + halam + "?_=" + Date.now());
    htmlGabung += "\n" + html;
    for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./[\]@%]+?\.(?:js|css)/g)) {
      aset.add(m[0]);
    }
  }

  const daftar = [...aset].slice(0, MAKS_ASET);
  const status = new Map(MARKER.map(([n]) => [n, false]));
  let asetGagal = 0;

  await Promise.all(
    daftar.map(async (a) => {
      try {
        const t = await ambil(BASE + a);
        for (const [nama] of MARKER) {
          if (t.includes(nama)) status.set(nama, true);
        }
      } catch {
        asetGagal++;
      }
    }),
  );

  // Marker juga boleh sudah ikut di HTML server-rendered.
  for (const [nama] of MARKER) {
    if (htmlGabung.includes(nama)) status.set(nama, true);
  }

  return { status, jumlahAset: daftar.length, asetGagal };
}

let percobaan = 0;
const MAKS = 40; // sekitar 6 menit dengan jeda 9 detik

while (percobaan < MAKS) {
  percobaan++;
  let hasil = null;
  try {
    hasil = await cekSekali();
  } catch (e) {
    console.log(
      "percobaan " + percobaan + ": gagal ambil halaman - " + String(e.message || e)
    );
    await new Promise((r) => setTimeout(r, 9000));
    continue;
  }

  const gagal = MARKER.filter(
    ([nama, harusnya]) => hasil.status.get(nama) !== harusnya
  );

  console.log(
    "percobaan " + String(percobaan).padStart(2, " ") + "/" + MAKS +
      "  aset=" + hasil.jumlahAset +
      (hasil.asetGagal ? "  (gagal: " + hasil.asetGagal + ")" : "") +
      "  " +
      MARKER.map(([n]) => (hasil.status.get(n) ? "+" : "-") + n).join(" ")
  );

  if (gagal.length === 0) {
    console.log("");
    console.log("SIUP: build paket pilihan sudah live.");
    for (const [nama, harusnya] of MARKER) {
      console.log("  " + (harusnya ? "ada    " : "tidak ada ") + nama);
    }
    process.exit(0);
  }

  if (percobaan === 1) {
    console.log("");
    console.log("Belum ada marker build paket pilihan. Yang belum terpenuhi:");
    for (const [nama] of gagal) console.log("  kurang " + nama);
    console.log("");
  }

  await new Promise((r) => setTimeout(r, 9000));
}

console.log("");
console.log("BELUM LIVE setelah " + MAKS + " percobaan. Tidak ada yang diubah.");
process.exit(1);