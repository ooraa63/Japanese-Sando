/**
 * Tunggu deploy Vercel yang baru benar-benar landing, dengan tanda yang
 * KHUSUS untuk koreksi item 1 (bukan tanda generik yang sudah true di
 * deploy sebelumnya).
 *
 * Tanda unik: <footer> di homepage harus punya kelas `hidden md:block`
 * (footer disembunyikan di HP). Before this deploy, footer tidak punya
 * `hidden`, jadi tanda ini hanya true setelah deploy baru live.
 *
 * Sekalian pastikan nav bawah mobile tetap ada (md:hidden).
 */
const BASE = process.env.SITE_URL || "https://japanese-sando.vercel.app";
const MAX_MIN = Number(process.env.MAX_MIN || 12);
const started = Date.now();

function check(html) {
  const footer = html.match(/<footer[^>]*class="([^"]*)"/);
  const nav = html.match(/aria-label="Mobile navigation"[^>]*class="([^"]*)"/);
  return {
    footerClass: footer ? footer[1] : null,
    navClass: nav ? nav[1] : null,
  };
}

const ok = (r) =>
  r.footerClass !== null
  && r.footerClass.includes("hidden")
  && r.footerClass.includes("md:block")
  && r.navClass !== null
  && r.navClass.includes("md:hidden");

async function once() {
  const res = await fetch(BASE, { headers: { "user-agent": "watch-footer" } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const r = check(await res.text());
  return { ...r, footerHiddenOnHp: r.footerClass?.includes("hidden") === true };
}

let last = "";
while ((Date.now() - started) / 60000 < MAX_MIN) {
  const min = ((Date.now() - started) / 60000).toFixed(1);
  try {
    const r = await once();
    const line =
      `[${min}m] footer="${(r.footerClass || "-").slice(0, 60)}" nav="${(r.navClass || "-").slice(0, 40)}"`;
    if (line !== last) {
      console.log(line);
      last = line;
    }
    if (ok(r)) {
      console.log("\nDEPLOY BARU SUDAH LIVE.");
      console.log(`  footer class : ${r.footerClass}`);
      console.log(`  nav bawah    : ${r.navClass}`);
      console.log("  -> footer hidden di HP (hidden md:block), nav bawah tetap ada (md:hidden)");
      process.exit(0);
    }
  } catch (e) {
    console.log(`[${min}m] fetch gagal: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 20000));
}

console.log(`\nBELUM live setelah ${MAX_MIN} menit.`);
process.exit(1);