/**
 * Verifikasi produksi bahwa koreksi item 1 benar-benar live.
 * Pakai cache-buster supaya tidak membaca respons CDN basi.
 *
 * Catatan: footer SENGAJA masih punya link /contact di dalam blok
 * "HUBUNGI KAMI" (SiteFooter.tsx: FAQ + Kontak). Itu bagian dari blok info
 * toko yang Steven minta tetap ada di PC. Yang hilang dari footer hanya
 * entri "Kontak" di daftar TAUTAN CEPAT (item 2).
 */
const BASE = process.env.SITE_URL || "https://japanese-sando.vercel.app";
const url = `${BASE}/?_cb=${Date.now()}`;

const res = await fetch(url, {
  headers: { "user-agent": "verify-item1", "cache-control": "no-cache" },
});
const html = await res.text();

const slice = (startNeedle, endNeedle, from = 0) => {
  const s = html.indexOf(startNeedle, from);
  if (s < 0) return "";
  const e = endNeedle ? html.indexOf(endNeedle, s) : -1;
  return html.slice(s, e < 0 ? s + 8000 : e);
};

const footerTag = html.match(/<footer[^>]*class="([^"]*)"/);
const footerHtml = slice("<footer", "</footer>");
const navHtml = slice('aria-label="Mobile navigation"', "</nav>");
const navTag = navHtml.match(/class="([^"]*)"/);

// Daftar TAUTAN CEPAT = dari heading "Tautan cepat" sampai blok HUBUNGI KAMI.
const quickStart = html.search(/Tautan cepat|TAUTAN CEPAT/i);
const contactStart = html.search(/Hubungi Kami|HUBUNGI KAMI/i);
const quickLinks =
  quickStart >= 0 && contactStart > quickStart
    ? html.slice(quickStart, contactStart)
    : "";

const checks = [
  ["status 200", res.status === 200],
  ["footer punya `hidden` (tidak tampil di HP)", !!footerTag && footerTag[1].includes("hidden")],
  ["footer punya `md:block` (tampil di laptop)", !!footerTag && footerTag[1].includes("md:block")],
  ["nav bawah tetap ada", !!navTag],
  ["nav bawah `md:hidden` (HP saja)", !!navTag && navTag[1].includes("md:hidden")],
  ["nav bawah: Beranda", navHtml.includes("Beranda")],
  ["nav bawah: Pesanan Saya", navHtml.includes("Pesanan Saya")],
  ["nav bawah: Akun", navHtml.includes("Akun")],
  ["nav bawah: TIDAK ada Kontak (item 2)", !navHtml.includes("Kontak")],
  ["footer: blok TAUTAN CEPAT masih ada", quickStart >= 0],
  ["footer: TAUTAN CEPAT tanpa link /contact (item 2)", quickStart >= 0 && !/href="[^"]*\/contact/.test(quickLinks)],
  ["footer: blok HUBUNGI KAMI masih ada di PC (maksud Steven)", contactStart >= 0],
  ["footer: link /contact di HUBUNGI KAMI tetap ada", /href="\/contact"/.test(footerHtml)],
  ["footer: copyright ada", footerHtml.includes("\u00a9")],
  // Spacer supaya konten terakhir tidak tertutup nav bawah di HP.
  // Hanya boleh muncul di halaman yang nav-nya memang tampil.
  ["spacer ada di beranda (nav tampil)", html.includes('aria-hidden="true" class="h-[68px] md:hidden"')],
];

const fetchPage = async (route) => {
  const r = await fetch(`${BASE}${route}?_cb=${Date.now()}`, {
    headers: { "user-agent": "verify-item1", "cache-control": "no-cache" },
  });
  return { status: r.status, html: await r.text() };
};

// Halaman yang nav bawahnya DISEMBUNYIKAN: spacer juga harus hilang di sana,
// supaya halaman tidak nambah ruang kosong sia-sia.
const TANPA_NAV = ["/order", "/account"];
for (const route of TANPA_NAV) {
  const p = await fetchPage(route);
  const adaSpacer = p.html.includes('aria-hidden="true" class="h-[68px] md:hidden"');
  const adaNav = p.html.includes('aria-label="Mobile navigation"');
  checks.push([
    `${route}: tidak ada spacer (nav disembunyikan di sini)`,
    !adaSpacer,
  ]);
  checks.push([
    `${route}: nav bawah memang tidak dirender`,
    !adaNav,
  ]);
}

let fail = 0;
for (const [name, pass] of checks) {
  console.log(`${pass ? "\u2705" : "\u274C"} ${name}`);
  if (!pass) fail++;
}
console.log(`\n${checks.length - fail}/${checks.length} lulus.`);
console.log(`\nfooter class: ${footerTag ? footerTag[1] : "-"}`);
console.log(`nav class   : ${navTag ? navTag[1] : "-"}`);
console.log(`\nlink /contact di footer: ${(footerHtml.match(/href="\/contact[^"]*"/g) || []).length} (FAQ + Kontak di HUBUNGI KAMI)`);
process.exit(fail ? 1 : 0);