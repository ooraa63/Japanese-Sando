// Fingerprint build yang benar untuk Next.js 16 (Turbopack).
//
// Gotcha: HTML Next.js 16 tidak lagi memuat field JSON "buildId" seperti
// Next.js versi lama, jadi regex itu selalu gagal. Path aset's yang
// pakai content-hash:
//     /_next/static/immutable/chunks/<nama>-<hash>
// Nama itu berubah tiap build, jadi cocok jadi penanda "build baru".
import https from "node:https";

const RE = /\/_next\/static\/immutable\/chunks\/[A-Za-z0-9_\/-]{4,}/g;

function get(p) {
  return new Promise((res) => {
    https
      .get("https://japanese-sando.vercel.app" + p, { headers: { "User-Agent": "check" } }, (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => res({ s: r.statusCode, b }));
      })
      .on("error", () => res({ s: 0, b: "" }));
  });
}

const snapshots = [];
for (let i = 0; i < 6; i++) {
  const r = await get("/order");
  const chunks = [...new Set(r.b.match(RE) || [])].sort();
  snapshots.push(chunks.join("\n"));
  if (i === 0) {
    console.log("Contoh fingerprint chunk yang tersaji:");
    chunks.slice(0, 5).forEach((c) => console.log("  " + c));
    console.log("");
  }
}

const uniq = [...new Set(snapshots)];
console.log("Jumlah request            :", snapshots.length);
console.log("Jumlah varian fingerprint :", uniq.length);
console.log("Jumlah chunk per snapshot :", snapshots[0] ? snapshots[0].split("\n").length : 0);
console.log(
  uniq.length === 1
    ? "\nOK: semua request dilayani build yang sama (stabil)."
    : "\nPERINGATAN: isi halaman berubah antar-request (kemungkinan cache vary)."
);

// Bukti transisi build: marker ini hanya ada di OrderFlow versi baru.
const marker = "Belum ada batch PO";
const ada = snapshots.length ? true : false;
const r = await get("/order");
console.log("marker '" + marker + "' di live :", r.b.includes(marker) ? "ADA" : "TIDAK ADA");
void ada;