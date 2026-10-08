/**
 * Bandingkan atribut <img> hasil render SERVER dengan hasil DOM CLIENT
 * setelah hidrasi, lalu tampilkan karakter pertama yang beda.
 *
 * Dipakai untuk Cycles hydration mismatch yang cuma muncul di server log
 * (nilai src/srcSet dipotong, jadi sulit dibaca mata).
 *
 *   node scripts/check-hydration.js [path]
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9400 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `hyd-profile-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const target = process.argv[2] ?? "/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(
  EDGE,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-extensions",
    "--remote-allow-origins=*",
    "--window-size=390,900",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let ws;
let id = 0;
const pending = new Map();
function send(method, params = {}, timeoutMs = 25000) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(msgId);
      reject(new Error(`timeout: ${method}`));
    }, timeoutMs);
    pending.set(msgId, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

// Cari posisi pertama yang beda + potongan sekitarnya.
function diffAt(a, b) {
  if (a === b) return { sama: true };
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return {
    sama: false,
    panjangServer: a.length,
    panjangClient: b.length,
    posisiBeda: i,
    server: a.slice(Math.max(0, i - 40), i + 60),
    client: b.slice(Math.max(0, i - 40), i + 60),
  };
}

try {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets?.length) break;
    } catch { /* belum siap */ }
    await sleep(250);
  }
  const pageTarget =
    targets?.find((t) => t.type === "page" && !t.url.startsWith("chrome-extension")) ??
    targets?.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("tidak ada target halaman");

  ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  // 1) HTML dari server, tanpa JS.
  const serverHtml = await (
    await fetch(`${BASE}${target}`, { headers: { "user-agent": "node-fetch" } })
  ).text();

  // PENTING: atribut di HTML mentah ter-escape (`&amp;`), sedangkan
  // `getAttribute` di DOM sudah mengembalikan bentuk ter-decode (`&`).
  // Kalau tidak di-decode, SETIAP img akan terbaca "beda" padahal sama.
  const decode = (s) =>
    String(s ?? "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

  const serverImgs = [...serverHtml.matchAll(/<img[^>]*data-nimg="fill"[^>]*>/g)].map((m) => m[0]);
  const pick = (tag, attr) => {
    const m = tag.match(new RegExp(`${attr}="([^"]*)"`));
    return m ? decode(m[1]) : null;
  };

  await send("Page.navigate", { url: `${BASE}${target}` });
  await sleep(6000);

  const client = await send("Runtime.evaluate", {
    expression: `(() => {
      const imgs = [...document.querySelectorAll('img[data-nimg="fill"]')];
      return {
        count: imgs.length,
        list: imgs.map(i => ({ src: i.getAttribute('src'), srcSet: i.getAttribute('srcset'),
                               alt: i.getAttribute('alt') || '' })),
      };
    })()`,
    returnByValue: true,
  });

  const cl = client.result.value;
  console.log(`Jumlah <img data-nimg="fill"> — server: ${serverImgs.length}, client: ${cl.count}\n`);

  let beda = 0;
  for (let i = 0; i < Math.min(serverImgs.length, cl.list.length); i++) {
    const sTag = serverImgs[i];
    const sSrc = pick(sTag, "src");
    const sSet = pick(sTag, "srcSet");
    const cSrc = cl.list[i].src;
    const cSet = cl.list[i].srcSet;
    if (sSrc !== cSrc || sSet !== cSet) {
      beda++;
      console.log(`### BEDA di img #${i}  alt="${cl.list[i].alt}"`);
      console.log("  src server:", sSrc);
      console.log("  src client:", cSrc);
      console.log("  srcSet server (250 pertama):", String(sSet).slice(0, 250));
      console.log("  srcSet client (250 pertama):", String(cSet).slice(0, 250));
      console.log("");
    }
  }
  console.log(beda === 0
    ? "✅ src & srcSet SEMUA img sama antara server dan client."
    : `⚠️  ${beda} img benar-benar beda.`);
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* abaikan */ }
  edge.kill();
  await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch { /* abaikan */ }
}