/**
 * Screenshot halaman dengan Chrome DevTools Protocol (tanpa dependency
 * tambahan — pakai WebSocket bawaan Node 22+).
 *
 * Dipakai buat verifikasi visual kartu menu di viewport HP: `--screenshot`
 * dari Edge/Chrome headless tidak bisa scroll ke bagian tengah halaman, dan
 * halaman ini punya hero dengan efek scroll yang bikin anchor jadi blank.
 *
 *   node scripts/shoot.js <url> <file.png> [lebar] [tinggi] [selectorUntukScroll]
 */
import { spawn } from "node:child_process";
import { writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9222 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `shoot-profile-${PORT}`);

const url = process.argv[2] ?? "http://localhost:3099/";
const outFile = process.argv[3] ?? path.join(os.tmpdir(), "shot.png");
const width = Number(process.argv[4] ?? 400);
const height = Number(process.argv[5] ?? 900);
const scrollTo = process.argv[6] ?? "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(
  EDGE,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    // Tanpa ini /json/list mengembalikan target extension bawaan Edge, dan
    // WebTools kita sambung ke background page-nya — Page.captureScreenshot
    // lalu timeout tanpa pernah capturing halaman situs.
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

function send(method, params = {}, timeoutMs = 15000) {
  const msgId = ++id;
  return new Promise((resolve, reject) => {
    // Timeout supaya script tidak menggantung selamanya kalau browser tidak
    // merespons (mis. DevTools tidak mau start).
    const timer = setTimeout(() => {
      pending.delete(msgId);
      reject(new Error(`timeout: ${method}`));
    }, timeoutMs);
    pending.set(msgId, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

try {
  // Tunggu endpoint debug siap.
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      targets = await res.json();
      if (targets.length) break;
    } catch {
      /* belum siap */
    }
    await sleep(250);
  }
  if (!targets?.length) throw new Error("DevTools tidak merespons");

  // Sambung ke tab halaman, bukan ke background page extension.
  const pageTarget =
    targets.find((t) => t.type === "page" && !t.url.startsWith("chrome-extension")) ??
    targets.find((t) => t.type === "page");
  if (!pageTarget) throw new Error("Tidak ada target halaman yang bisa dipakai");

  const wsUrl = pageTarget.webSocketDebuggerUrl;
  ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  };

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url });
  await sleep(4500); // tunggu gambar + font + data dari Supabase

  if (scrollTo) {
    await send("Runtime.evaluate", {
      expression: `(() => {
        const el = document.querySelector(${JSON.stringify(scrollTo)});
        if (el) el.scrollIntoView({ block: 'start' });
        else window.scrollTo(0, document.body.scrollHeight);
        return el ? 'ok' : 'fallback';
      })()`,
      returnByValue: true,
    });
    await sleep(2500);
  }

  // Halaman ini punya animasi yang jalan terus (hero), sehingga renderer tidak
  // pernah sampai kondisi "frame siap" dan Page.captureScreenshot timeout.
  // Bekukan dulu semua animasi + video sebelum ambil gambarnya.
  await send("Runtime.evaluate", {
    expression: `(() => {
      const s = document.createElement('style');
      s.id = '__shoot_freeze';
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(s);
      document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch {} });
      if (document.getAnimations) document.getAnimations().forEach(a => { try { a.pause(); } catch {} });
      return 'frozen';
    })()`,
    returnByValue: true,
  });
  await sleep(1200);

  const { data } = await send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
    45000
  );
  writeFileSync(outFile, Buffer.from(data, "base64"));
  console.log(`Screenshot tersimpan: ${outFile} (${width}x${height}, scroll=${scrollTo || "top"})`);
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {
    /* abaikan */
  }
  edge.kill();
  await sleep(300);
  try {
    if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
  } catch {
    /* abaikan */
  }
}