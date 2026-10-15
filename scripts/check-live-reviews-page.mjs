// Cek fungsional ringan di produksi setelah deploy migration-58.
// READ-ONLY: hanya GET halaman publik.
import process from "node:process";

const BASE = process.env.JS_DEPLOY_URL || "https://japanese-sando.vercel.app";

let ok = 0;
let gagal = 0;
const cek = (nama, lulus, extra = "") => {
  if (lulus) ok++;
  else gagal++;
  console.log((lulus ? "OK   " : "GAGAL") + "  " + nama + (extra ? "  -> " + extra : ""));
};

const ambil = async (p) => {
  const r = await fetch(BASE + p, {
    headers: { "cache-control": "no-cache", pragma: "no-cache" },
    redirect: "manual",
  });
  return { status: r.status, html: await r.text() };
};

const beranda = await ambil("/");
cek("beranda 200", beranda.status === 200, String(beranda.status));
cek("beranda punya section ulasan", /id="reviews"/.test(beranda.html));
cek("beranda menampilkan angka ulasan", /ulasan/i.test(beranda.html));

// Sort memakai query string, jadi tiap nilai harus menghasilkan HTML
// server-rendered yang berbeda (tab aktif + isi daftar).
const sorted = {};
for (const s of ["newest", "highest", "lowest", "photo", "ngawur"]) {
  const r = await ambil("/?sort=" + s);
  sorted[s] = { status: r.status, html: r.html };
  cek("?sort=" + s + " 200 dan tidak error", r.status === 200 && !/Application error|Internal Server Error/.test(r.html));
}
// Sort memakai query string dan section dirender server-side, jadi tab AKTIF
// harus bergeser lewat `aria-pressed` di dalam HTML -- bukan lewat JS setelah
// halaman selesai dimuat. Membandingkan byte per halaman itu salah besar,
// karena isi daftarnya memang sama saat hanya ada satu ulasan; yang berubah
// hanya penanda tab aktif.
// Urutan atribut di dalam HTML tidak dijamin (yang live ternyata
// `aria-pressed`duluan, lalu `data-review-sort`), jadi kedua atribut dibaca
// terpisah dari tag yang sama -- bukan dengan satu regex berurutan.
const tabAktif = (html) => {
  for (const m of html.matchAll(/<button[^>]*data-review-sort="[a-z]+"[^>]*>/g)) {
    const tag = m[0];
    const nama = /data-review-sort="([a-z]+)"/.exec(tag)?.[1];
    const pressed = /aria-pressed="(true|false)"/.exec(tag)?.[1];
    if (pressed === "true") return nama;
  }
  return null;
};

for (const s of ["newest", "highest", "lowest", "photo"]) {
  cek("?sort=" + s + " menandai tab '" + s + "' sebagai aktif",
    tabAktif(sorted[s].html) === s, String(tabAktif(sorted[s].html)));
}

cek("sort ngawur jatuh ke tab 'newest', bukan error",
  tabAktif(sorted.ngawur.html) === "newest", String(tabAktif(sorted.ngawur.html)));

cek("tab 'highest' TIDAK aktif saat tidak diminta",
  tabAktif(sorted.newest.html) !== "highest", String(tabAktif(sorted.newest.html)));

// Halaman admin harus menutup akses ke tamu, bukan error 500.
const admin = await ambil("/admin/reviews");
cek("/admin/reviews tidak terbuka untuk tamu",
  admin.status === 307 || admin.status === 302 || /masuk|login/i.test(admin.html),
  "HTTP " + admin.status);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");
process.exit(gagal > 0 ? 1 : 0);