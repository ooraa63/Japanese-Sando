/**
 * Dump isi halaman /order apa adanya (untuk debugging selector).
 *
 *   node scripts/dump-page-text.js
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9500 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `dump-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const ROUTE = process.env.ROUTE || "/order";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--remote-allow-origins=*", "--window-size=390,900", "about:blank",
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

try {
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets?.length) break; } catch {}
    await sleep(250);
  }
  const t = targets?.find((x) => x.type === "page" && !x.url.startsWith("chrome-extension")) ?? targets?.find((x) => x.type === "page");
  ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: `${BASE}${ROUTE}` });
  await sleep(Number(process.env.WAIT || 9000));

  const info = await evaluate(`(() => ({
    url: location.href,
    title: document.title,
    jumlahArticle: document.querySelectorAll('article').length,
    jumlahButton: document.querySelectorAll('button').length,
    teks: (document.body.innerText || '').replace(/\\n{2,}/g,'\\n').slice(0, 1500),
  }))()`);
  console.log("URL          :", info.url);
  console.log("Title        :", info.title);
  console.log("<article>    :", info.jumlahArticle);
  console.log("<button>     :", info.jumlahButton);
  console.log("\n--- innerText (1500 char pertama) ---\n");
  console.log(info.teks);

  const errs = await evaluate(`JSON.stringify(window.__errs || [])`);
  if (errs && errs !== "[]") console.log("\n--- error ---\n", errs);
} catch (e) {
  console.error("GAGAL:", e.message);
} finally {
  try { ws?.close(); } catch {}
  edge.kill(); await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch {}
}