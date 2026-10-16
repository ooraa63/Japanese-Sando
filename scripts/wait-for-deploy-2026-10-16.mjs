// Tunggu sampai build 16-10-2026 benar-benar live di produksi.
//
// Gotcha #26: verifikasi deploy tidak boleh cuma cek HTTP 200 -- beranda tetap
// 200 baik di build lama maupun baru. Yang dicari marker yang HANYA ada di
// build baru.
//
// Gotcha #118: jangan pakai ulang skrip tunggu-deploy batch sebelumnya. Marker
// mereka sudah live sejak batch sebelumnya, jadi skrip itu akan langsung bilang
// "SIUP" padahal build ini belum naik sama sekali.
//
// Gotcha #125: ekspektasi WAJIB dibaca dari `MARKER`, bukan dari map hasil.
//
// Gotcha #130: marker harus DIVALIDASI KE BUILD LOKAL dulu sebelum dipakai
// menilai produksi. Kalau marker tidak ada di build lokal, marker itu salah
// pilih -- bukan berarti produksi belum naik.
//
// Marker (semua kunci/atribut BARU di commit ini):
//   - data-wa-fab            atribut penanda tombol WhatsApp yang sekarang satu
//                           enderer di root layout, bukan empat tempat terpisah
//   - cartButton             nama prop baru SiteHeader (slot ikon keranjang)
//   - data-cart-header-button atribut penanda ikon troli di header beranda
//
// Yang TIDAK dipakai dan alasannya:
//   - `CartHeaderButton` / `data-pickup-store-list` untuk yang kedua: keduanya
//     sudah ada di build LOKAL tapi TIDAK muncul di HTML server-rendered
//     (hanya muncul setelah hydration / diklik), jadi andalkan HTML akan
//     menggantung. `data-cart-header-button` aman karena ada di chunk JS yang
//     dimuat beranda.
//   - `bottom-[calc(88px...)]`: itu kelas CSS, bukan string HTML.
//
// Aset diambil dari GABUNGAN / dan /order, karena `WhatsAppFab` ada di root
// layout (semua halaman) sementara `CartHeaderButton` hanya di beranda.
//
// Skrip ini READ-ONLY: hanya GET halaman produksi dan file statiknya.
import process from "node:process";

const BASE = process.env.JS_DEPLOY_URL || "https://japanese-sando.vercel.app";
const MAKS_ASET = 110;

const HALAMAN = ["/", "/order"];

const MARKER = [
  ["data-wa-fab", true],
  ["cartButton", true],
  ["data-cart-header-button", true],
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
const MAKS = Number(process.env.JS_DEPLOY_MAX || 40); // sekitar 6 menit

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
      "  " + BASE +
      "  aset=" + hasil.jumlahAset +
      (hasil.asetGagal ? "  (gagal: " + hasil.asetGagal + ")" : "") +
      "  " +
      MARKER.map(([h]) => (hasil.status.get(h) ? "+" : "-") + h).join(" ")
  );

  if (gagal.length === 0) {
    console.log("");
    console.log("SIUP: build 16-10-2026 sudah live.");
    for (const [nama, harusnya] of MARKER) {
      console.log("  " + (harusnya ? "ada      " : "tidak ada ") + nama);
    }
    process.exit(0);
  }

  if (percobaan === 1) {
    console.log("");
    console.log("Marker build 16-10-2026 belum terpenuhi:");
    for (const [nama] of gagal) console.log("  kurang " + nama);
    console.log("");
  }

  await new Promise((r) => setTimeout(r, 9000));
}

console.log("");
console.log("BELUM LIVE setelah " + MAKS + " percobaan. Tidak ada yang diubah.");
process.exit(1);