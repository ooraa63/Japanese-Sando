/**
 * Cek apakah nav bawah fixed menutupi konten terakhir di HP.
 *
 * Konteks: footer (blok info toko) disembunyikan di HP, jadi halaman HP
 * sekarang berakhir dengan konten halaman biasa, bukan footer. Kalau tidak
 * ada padding bawah, elemen terakhir bisa ketimpa nav fixed.
 *
 * Metrik: scroll ke paling bawah, lalu cari elemen teks paling bawah yang
 * terlihat. Kalau dasar elemen itu melewati atas nav, berarti tertutup.
 *
 *   node scripts/check-nav-overlap.js
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9800 + Math.floor(Math.random() * 150);
const profileDir = path.join(os.tmpdir(), `nav-overlap-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = [];

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--remote-allow-origins=*", "--window-size=1400,1000", "about:blank",
], { stdio: "ignore" });

let ws; let id = 0; const pending = new Map();
function send(method, params = {}, timeoutMs = 25000) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(msgId); reject(new Error(`timeout: ${method}`)); }, timeoutMs);
    pending.set(msgId, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}
const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.value;
};
async function shot(name) {
  const s = await send("Page.captureScreenshot", { format: "png" });
  const p = path.join(os.tmpdir(), `navov-${name}.png`);
  writeFileSync(p, Buffer.from(s.data, "base64"));
  shots.push(p);
  return p;
}

// Cari elemen teks paling bawah yang benar-benar terlihat.
const PROBE = `(() => {
  const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
  const navTop = nav ? nav.getBoundingClientRect().top : null;

  const vh = window.innerHeight;
  let worst = null;
  for (const el of document.querySelectorAll("body *")) {
    if (nav && nav.contains(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    if (el.offsetParent === null && cs.position !== "fixed") continue;
    // hanya elemen yang punya teks langsung sendiri (daun)
    const own = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(" ")
      .trim();
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (r.height === 0 || r.width === 0) continue;
    if (r.bottom > vh + 2 || r.top < -2) continue;
    if (!worst || r.bottom > worst.bottom) {
      worst = { bottom: Math.round(r.bottom), tag: el.tagName, teks: own.slice(0, 45) };
    }
  }

  return {
    scrollY: Math.round(window.scrollY),
    docH: document.documentElement.scrollHeight,
    vh,
    navTop: navTop === null ? null : Math.round(navTop),
    navAda: !!nav,
    terakhir: worst,
    // jarak bebas antara konten terakhir dan atas nav
    jarak: navTop === null || !worst ? null : Math.round(navTop - worst.bottom),
  };
})()`;

const ROUTES = ["/", "/track", "/contact"];
const MIN_JARAK = 16; // px jarak aman minimum antara konten terakhir dan nav
const results = [];

try {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets?.length) break;
    } catch {}
    await sleep(250);
  }
  const t =
    targets?.find((x) => x.type === "page" && !x.url.startsWith("chrome-extension")) ??
    targets?.find((x) => x.type === "page");
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");

  for (const route of ROUTES) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
    });
    await send("Page.navigate", { url: `${BASE}${route}` });
    await sleep(4500);
    // scroll ke paling bawah
    await evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
    await sleep(1200);
    const r = await evaluate(PROBE);
    await shot(route.replace(/\//g, "_") || "_root");
    results.push({ route, ...r });
  }
} catch (e) {
  console.error("Gagal:", e.message);
}

console.log("");
for (const r of results) {
  if (!r.navAda) {
    console.log(`⏭️  ${r.route} — nav bawah tidak tampil di halaman ini`);
    continue;
  }
  const txt = r.terakhir ? `"${r.terakhir.teks}" (<${r.terakhir.tag}> dasar ${r.terakhir.bottom}px)` : "tidak ada teks terlihat";
  if (r.jarak === null) {
    console.log(`⚠️  ${r.route} — nav top=${r.navTop}, ${txt}`);
  } else if (r.jarak < MIN_JARAK) {
    console.log(`❌ ${r.route} — jarak hanya ${r.jarak}px (< ${MIN_JARAK}px)! nav top=${r.navTop}, ${txt}`);
  } else {
    console.log(`✅ ${r.route} — nav top=${r.navTop}, jarak ${r.jarak}px (min ${MIN_JARAK}), ${txt}`);
  }
}
console.log(`\ndocH vs viewport: ${results.map((r) => `${r.route} ${r.docH}/${r.vh} (scrollY ${r.scrollY})`).join(" | ")}`);
console.log(`\nScreenshot: ${shots.join(", ")}`);

const bad = results.filter((r) => r.navAda && r.jarak !== null && r.jarak < MIN_JARAK);
if (bad.length) {
  console.log(`\n${bad.length} halaman jarak konten terakhir ke nav < ${MIN_JARAK}px.`);
} else {
  console.log(`\nSemua halaman punya jarak aman dari nav bawah.`);
}

await send("Browser.close").catch(() => {});
edge.kill();
await sleep(600);
try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch {}
process.exit(bad.length ? 1 : 0);