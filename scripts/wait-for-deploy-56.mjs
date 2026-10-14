// Tunggu sampai deploy Vercel benar-benar mendarat.
//
// Gotcha #26: tandanya harus kondisi yang HANYA bisa terjadi di build baru.
// Di sini tandanya string "Belum ada batch PO" yang hanya ada di
// OrderFlow.tsx versi baru. Kalau hanya cek HTTP 200, halaman lama juga
// selalu 200 — itu rasa aman palsu.
import https from "node:https";

const URL = "https://japanese-sando.vercel.app/order";
const MARKER = "Belum ada batch PO";
const MAX_MS = 15 * 60 * 1000;
const INTERVAL = 15000;

const started = Date.now();
let attempt = 0;

function fetchOnce() {
  return new Promise((resolve) => {
    const req = https.get(
      URL,
      { headers: { "Cache-Control": "no-cache", "User-Agent": "deploy-check" } },
      (r) => {
        let body = "";
        r.on("data", (d) => (body += d));
        r.on("end", () => resolve({ status: r.statusCode, body }));
      }
    );
    req.on("error", (e) => resolve({ status: 0, body: "", error: e.message }));
    req.setTimeout(20000, () => {
      req.destroy();
      resolve({ status: 0, body: "", error: "timeout" });
    });
  });
}

async function loop() {
  for (;;) {
    attempt++;
    const { status, body, error } = await fetchOnce();
    const ada = body.includes(MARKER);
    const detik = Math.round((Date.now() - started) / 1000);

    // Indikator tambahan: halaman /order versi baru juga tidak lagi punya
    // langkah menu saat tidak ada batch.
    const adaMenu = body.includes("Pilih Rasa") || body.includes("Tambah ke keranjang");

    console.log(
      `[${String(detik).padStart(4)}s] percobaan ${String(attempt).padStart(2)} | ` +
        `HTTP ${status || "-"} | panjang ${String(body.length).padStart(6)} | ` +
        `marker=${ada ? "ADA (deploy landed)" : "belum"} | langkah menu=${adaMenu ? "ada" : "tidak"}` +
        (error ? ` | ${error}` : "")
    );

    if (status === 200 && ada) {
      console.log(`\nDEPLOY SUDAH LIVE setelah ${detik} detik.`);
      console.log("Panel 'Belum ada batch PO' muncul dan langkah menu hilang.");
      process.exit(0);
    }

    if (Date.now() - started > MAX_MS) {
      console.log(`\nBELUM LIVE setelah ${Math.round(MAX_MS / 1000)} detik.`);
      console.log("Marker masih tidak muncul — cek dashboard Vercel.");
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

loop();
