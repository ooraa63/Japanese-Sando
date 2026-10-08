/**
 * Pantau deployment Vercel sampai perubahan benar-benar live.
 *
 * Push ke main -> Vercel auto-deploy (biasanya 1-3 menit). Skrip ini
 * mengecek dua signature yang BISA dilihat tanpa login:
 *
 *   1. /admin/pickup-delivery
 *      - sebelum deploy: 404 (route belum ada)
 *      - setelah deploy: redirect ke /admin/login (route ada, tapi butuh auth)
 *
 *   2. Blok TAUTAN CEPAT di footer beranda
 *      - sebelum deploy: Menu / Cara Pesan / Pre-order / Cek Pesanan / Kontak
 *      - setelah deploy: Kontak hilang (pindah ke popup di halaman Akun)
 *
 *   node scripts/watch-deploy.js
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const URL = (process.env.SITE_URL || "https://japanese-sando.vercel.app").replace(/\/$/, "");
const MAX_MINUTES = Number(process.env.MAX_MINUTES || 12);
const start = Date.now();

/** Ambil teks blok TAUTAN CEPAT dari footer (sekitar header "Hubungi Kami"). */
function blokTautanCepat(html) {
  const polos = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, "\u0001")
    .replace(/\u0001+/g, " | ")
    .replace(/\s+/g, " ");
  const i = polos.search(/Tautan cepat|Quick links/i);
  if (i < 0) return null;
  // Potong tepat sebelum section berikutnya.
  const sisa = polos.slice(i);
  const j = sisa.search(/HUBUNGI KAMI|GET IN TOUCH/i);
  return (j > 0 ? sisa.slice(0, j) : sisa.slice(0, 320)).trim();
}

async function cek() {
  // 1) Route admin baru.
  let route = "?";
  try {
    const res = await fetch(`${URL}/admin/pickup-delivery?t=${Date.now()}`, {
      redirect: "manual",
      headers: { "cache-control": "no-cache" },
    });
    route = String(res.status);
  } catch (e) {
    route = `ERR:${e.message.slice(0, 40)}`;
  }

  // 2) Footer beranda.
  let blok = null;
  let beranda = "?";
  try {
    const res = await fetch(`${URL}/?t=${Date.now()}`, {
      headers: { "cache-control": "no-cache" },
    });
    beranda = String(res.status);
    blok = blokTautanCepat(await res.text());
  } catch (e) {
    beranda = `ERR:${e.message.slice(0, 40)}`;
  }

  return {
    beranda,
    route,
    navBawah: blok ? (/Mobile navigation|Bottom navigation/i.test(blok) ? "ada" : "tidak") : "?",
    kontakDiFooter: blok ? (/\bKontak\b/i.test(blok) ? "MASIH ADA" : "sudah hilang") : "?",
    blok: blok ? blok.slice(0, 110) : null,
  };
}

console.log(`Pantau ${URL} — maksimal ${MAX_MINUTES} menit`);
console.log("Target: /admin/pickup-delivery != 404  DAN  'Kontak' hilang dari footer.\n");

let last = null;
while ((Date.now() - start) / 60000 < MAX_MINUTES) {
  let now;
  try {
    now = await cek();
  } catch (e) {
    now = { error: e.message };
  }

  const n = JSON.stringify(now);
  if (n !== JSON.stringify(last)) {
    const menit = ((Date.now() - start) / 60000).toFixed(1);
    console.log(`[${menit}m] beranda=${now.beranda} route=${now.route} kontak=${now.kontakDiFooter}`);
    if (now.blok) console.log(`        tautan: ${now.blok}`);
    last = now;
  }

  const routeAda = now.route && now.route !== "404" && !String(now.route).startsWith("ERR");
  const kontakBeres = now.kontakDiFooter === "sudah hilang";

  if (routeAda && kontakBeres) {
    console.log("\n✅ DEPLOY SUDAH LIVE.");
    console.log(`   /admin/pickup-delivery -> ${now.route} (route ada)`);
    console.log(`   "Kontak" sudah hilang dari TAUTAN CEPAT.`);
    process.exit(0);
  }

  await sleep(20000);
}

console.log("\n⏱️  Timeout — deploy belum terdeteksi. Cek dashboard Vercel manual.");
process.exit(1);