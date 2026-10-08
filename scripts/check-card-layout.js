/**
 * Ukur geometri kartu rasa yang sudah dirender, di viewport HP.
 *
 * lebih presisi daripada screenshot untuk answering "apakah teksnya
 * kepotong?": kita baca langsung scrollWidth vs clientWidth tiap elemen, jadi
 * tahu persis mana yang overflow.
 *
 *   node scripts/check-card-layout.js [selectorWadah]
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9300 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `layout-profile-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const container = process.argv[2] ?? "#menu";
const width = 390;
const height = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(
  EDGE,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    // Tanpa ini, /json/list mengembalikan target extension bawaan Edge dan
    // WebSocket kita sambung ke background page-nya, bukan ke tab situs.
    "--disable-extensions",
    "--remote-allow-origins=*",
    `--window-size=${width},${height}`,
    "about:blank",
  ],
  { stdio: "ignore" }
);

let ws;
let id = 0;
const pending = new Map();

function send(method, params = {}, timeoutMs = 20000) {
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

try {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      if (targets?.length) break;
    } catch { /* belum siap */ }
    await sleep(250);
  }
  if (!targets?.length) throw new Error("DevTools tidak merespons");

  // Pilih tab halaman sungguhan, bukan target extension / devtools.
  const pageTarget =
    targets.find((t) => t.type === "page" && !t.url.startsWith("chrome-extension")) ??
    targets.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("Tidak ada target halaman yang bisa dipakai");

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
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await send("Page.navigate", { url: `${BASE}/` });
  await sleep(5000);

  // Pastikan benar-benar sudah di halaman yang benar sebelum mengukur.
  const state = await send("Runtime.evaluate", {
    expression: `({ href: location.href, title: document.title,
                    siap: document.readyState,
                    jumlahArticle: document.querySelectorAll('article').length,
                    jumlahSection: document.querySelectorAll('section').length })`,
    returnByValue: true,
  });
  console.error("State:", JSON.stringify(state.result.value));
  await sleep(1500);

  const expr = `(() => {
    const root = document.querySelector(${JSON.stringify(container)});
    if (!root) return { error: 'wadah tidak ditemukan' };
    const cards = [...root.querySelectorAll('article')];
    const out = { viewport: innerWidth, jumlahKartu: cards.length, kartu: [] };
    for (const c of cards) {
      const desc = c.querySelector('.flavor-desc');
      const social = c.querySelector('.flavor-social');
      const name = c.querySelector('h3');
      const row = (el) => el ? {
        teks: (el.textContent || '').replace(/\\s+/g,' ').trim().slice(0,40),
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        meluap: el.scrollWidth > el.clientWidth + 1,
        display: getComputedStyle(el).display,
      } : null;
      out.kartu.push({
        nama: (name?.textContent || '').trim(),
        deskripsi: desc ? {
          teks: (desc.textContent||'').replace(/\\s+/g,' ').trim().slice(0,50),
          display: getComputedStyle(desc).display,
          tinggi: desc.getBoundingClientRect().height,
          visible: desc.getBoundingClientRect().height > 0,
        } : null,
        social: social ? {
          display: getComputedStyle(social).display,
          direction: getComputedStyle(social).flexDirection,
          baris: [...social.children].map(row),
        } : null,
      });
    }
    // Setiap elemen yang teksnya kepotong (ellipsis aktif).
    out.terpotong = [...root.querySelectorAll('*')].filter(el => {
      const s = getComputedStyle(el);
      return (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none')
        && el.scrollWidth > el.clientWidth + 1;
    }).map(el => ({ tag: el.tagName, cls: el.className.toString().slice(0,60),
                    teks: (el.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) }));
    return out;
  })()`;

  const { result } = await send("Runtime.evaluate", {
    expression: expr,
    returnByValue: true,
    awaitPromise: false,
  });

  console.log(JSON.stringify(result.value, null, 2));
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* abaikan */ }
  edge.kill();
  await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch { /* abaikan */ }
}