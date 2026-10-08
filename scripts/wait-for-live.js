/**
 * Tunggu sampai build baru benar-benar live di produksi.
 *
 * Kenapa skrip ini diperlukan: skrip pantau deploy sebelumnya memakai tanda
 * yang SUDAH benar di deploy lama, jadi dia melaporkan "LIVE" sebelum build
 * baru mendarat. Warna merah yang salah. Lihat gotchas.md #26.
 *
 * Solusinya: tanda dikirim dari luar (argv), jadi selalu jelas build mana yang
 * sedang ditunggu dan tidak bisa basi diam-diam.
 *
 * Pakai:
 *   node scripts/wait-for-live.js "h-[68px] md:hidden"
 *
 * Di PowerShell, tanda yang mengandung spasi gampang rusak oleh parsing
 * argument. Pakai env SIGS (pisah dengan "|") kalau begitu — nol masalah
 * quoting:
 *   $env:SIGS = 'h-[68px] md:hidden|hidden md:block'
 *   node scripts/wait-for-live.js
 *
 * Opsi env:
 *   SITE_URL   default https://japanese-sando.vercel.app
 *   MAX_MIN    default 12
 *   SIGS       tanda tambahan dari env, dipisah "|"
 *
 * Exit 0 kalau semua tanda muncul, exit 1 kalau lewat batas waktu.
 */
const BASE = process.env.SITE_URL || "https://japanese-sando.vercel.app";
const MAX_MIN = Number(process.env.MAX_MIN || 12);
const TANDA = process.env.SIGS
  ? process.env.SIGS.split("|").map((s) => s.trim()).filter(Boolean)
  : process.argv.slice(2);

if (TANDA.length === 0) {
  console.error("Pakai: node scripts/wait-for-live.js <substring> [<substring> ...]");
  console.error("Tanda WAJIB_UNIK untuk build yang sedang ditunggu, kalau tidak");
  console.error("poller ini bisa salah lapor 'live' karena tandanya sudah ada di");
  console.error("deploy sebelumnya.");
  process.exit(2);
}

const started = Date.now();
const min = () => ((Date.now() - started) / 60000).toFixed(1).padStart(4);

async function cek() {
  const res = await fetch(`${BASE}/?_cb=${Date.now()}`, {
    headers: { "user-agent": "wait-for-live", "cache-control": "no-cache" },
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const html = await res.text();
  return TANDA.map((t) => ({ t, ada: html.includes(t) }));
}

let last = "";
while ((Date.now() - started) / 60000 < MAX_MIN) {
  try {
    const hasil = await cek();
    const ringkas = hasil.map((h) => (h.ada ? "+" : "-") + h.t).join(" ");
    if (ringkas !== last) {
      console.log(`[${min()}m] ${ringkas}`);
      last = ringkas;
    }
    if (hasil.every((h) => h.ada)) {
      console.log(`\nBUILD BARU SUDAH LIVE di ${BASE}`);
      for (const h of hasil) console.log(`  ✅ ditemukan: ${h.t}`);
      process.exit(0);
    }
  } catch (e) {
    console.log(`[${min()}m] fetch gagal: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 20000));
}

console.log(`\nBELUM live setelah ${MAX_MIN} menit. Tanda yang belum ada:`);
console.log(`  - ${(await cek().catch(() => [])).filter((h) => !h.ada).map((h) => h.t).join("\n  - ")}`);
process.exit(1);