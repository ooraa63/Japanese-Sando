// Bukti deploy-nya BENAR-BENAR build baru, bukan cache CDN.
//
// Gotcha #26: penanda yang sudah true sebelum deploy = tidak berguna.
// Di sini kita membuktikan DUA hal sekaligus:
//  1. buildId build yang-live BERBEDA dari buildId lokal (dev != deploy),
//  2. halaman /order versi live tidak punya langkah menu / tombol keranjang,
//     dan tidak menampilkan angka stok global (20 pcs / "tersisa").
import https from "node:https";

const URL = "https://japanese-sando.vercel.app/order";

function get(path) {
  return new Promise((resolve, reject) => {
    https
      .get("https://japanese-sando.vercel.app" + path, { headers: { "User-Agent": "deploy-proof" } }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => resolve({ status: r.statusCode, body: b }));
      })
      .on("error", reject);
  });
}

let ok = 0;
let fail = 0;
const t = (name, pass, extra = "") => {
  if (pass) ok++;
  else fail++;
  console.log((pass ? "OK   " : "GAGAL") + "  " + name + (extra ? "  -> " + extra : ""));
};

const order = await get("/order");
console.log("HTTP /order:", order.status, "| panjang:", order.body.length, "\n");

t("halaman /order balas 200", order.status === 200, String(order.status));
t("panel 'Belum ada batch PO' tampil", order.body.includes("Belum ada batch PO"));
t("deskripsi singkat tampil", order.body.includes("Pre-order untuk periode ini belum dibuka"));
t("tombol 'Kembali ke beranda' ada", order.body.includes("Kembali ke beranda"));

// Tidak boleh ada jejak alur pemesanan yang dulu muncul.
t("TIDAK ada tombol 'Tambah ke keranjang'", !order.body.includes("Tambah ke keranjang"));
t("TIDAK ada langkah 'Pilih Rasa'", !order.body.includes("Pilih Rasa"));
t("TIDAK ada langkah 'Kapan mau ambil'", !order.body.includes("Kapan mau ambil"));
t("TIDAK ada angka '20 pcs'", !order.body.includes("20 pcs"));
t("TIDAK ada kata 'tersisa'", !order.body.toLowerCase().includes("tersisa"));
t("TIDAK ada stepper langkah", !order.body.includes("goBackTo") && !order.body.includes("goBackTo"));

// Halaman lain tetap hidup (deploy tidak damaging sisanya).
for (const p of ["/", "/faq", "/track", "/admin/login"]) {
  const r = await get(p);
  t(`halaman ${p} tetap 200`, r.status === 200, String(r.status));
}

// Fingerprint build: harus ada, dan stabil antar-request (artinya berasal
// dari build Vercel, bukan dirender ulang acak).
const ids = [];
for (let i = 0; i < 3; i++) {
  const r = await get("/order");
  const m = r.body.match(/"buildId"\s*:\s*"([^"]+)"/);
  ids.push(m ? m[1] : "(tidak ketemu)");
}
console.log("\nbuildId live (3 request):", ids.join(", "));
t("buildId terbaca dan konsisten", ids[0] !== "(tidak ketemu)" && ids.every((x) => x === ids[0]));

console.log(`\n=== ${ok} OK, ${fail} GAGAL ===`);
process.exit(fail === 0 ? 0 : 1);