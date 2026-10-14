// Tunggu deploy perubahan keranjang + tombol WA sampai benar-benar landed.
//
// Gotcha #26: penanda harus kondisi yang HANYA bisa terjadi di build baru,
// DAN harus dicek kondisinya dulu sebelum deploy (kalau tidak, penanda yang
// sudah true sebelum deploy tidak membuktikan apa-apa).
//
// Yang dipakai di sini: posisi tombol WhatsApp di /order.
//
//   Build LAMA: WhatsAppFab tidak menyembunyikan diri di /order, jadi tombolnya
//               dirender dengan kelas `bottom-[84px] z-40`.
//   Build BARU: WhatsAppFab menyembunyikan diri di /order; WA dirender
//               OrderFlow sendiri dengan `bottom-4 z-40` (untuk langkah tanpa
//               bar keranjang) atau di dalam CartStickyBar (langkah menu).
//
// Jadi syarat "sudah live": `bottom-[84px] z-40` HILANG dan `bottom-4 z-40`
// MUNCUL. Keduanya dicek, bukan hanya salah satu.
import https from "node:https";

const URL = "https://japanese-sando.vercel.app/order";
const LAMA = "bottom-[84px] z-40";
const BARU = "bottom-4 z-40";
const MAX_MS = 15 * 60 * 1000;
const INTERVAL = 15000;

const started = Date.now();
let attempt = 0;

function fetchOnce() {
  return new Promise((resolve) => {
    const req = https.get(
      URL,
      { headers: { "Cache-Control": "no-cache", "User-Agent": "deploy-check-cart" } },
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
    const detik = Math.round((Date.now() - started) / 1000);

    const masihLama = body.includes(LAMA);
    const sudahBaru = body.includes(BARU);

    console.log(
      `[${String(detik).padStart(4)}s] percobaan ${String(attempt).padStart(2)} | ` +
        `HTTP ${status || "-"} | panjang ${String(body.length).padStart(6)} | ` +
        `kelas lama: ${masihLama ? "MASIH ADA" : "sudah hilang"} | ` +
        `kelas baru: ${sudahBaru ? "MUNCUL" : "belum"}` +
        (error ? ` | ${error}` : "")
    );

    if (status === 200 && !masihLama && sudahBaru) {
      console.log(`\nDEPLOY SUDAH LIVE setelah ${detik} detik.`);
      console.log("Tombol WA di /order pindah dari bottom-[84px] ke bottom-4,");
      console.log("sesuai build baru yang menyembunyikan WhatsAppFab di /order.");
      process.exit(0);
    }

    if (Date.now() - started > MAX_MS) {
      console.log(`\nBELUM LIVE setelah ${Math.round(MAX_MS / 1000)} detik.`);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

loop();