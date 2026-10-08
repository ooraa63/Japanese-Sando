/**
 * Tangkap error console + exception + teks badge dev overlay di sebuah route.
 *
 *   node scripts/dump-console.js          -> /order
 *   ROUTE=/ node scripts/dump-console.js  -> /
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9500 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `console-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const ROUTE = process.env.ROUTE === undefined ? "/order" : process.env.ROUTE;
const WAIT = Number(process.env.WAIT || 8000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--remote-allow-origins=*", "--window-size=390,900", "about:blank",
], { stdio: "ignore" });

let ws; let id = 0; const pending = new Map();
const logs = [];
function send(method, params = {}, timeoutMs = 30000) {
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
    else if (m.method === "Runtime.consoleAPICalled") {
      const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
      logs.push({ level: m.params.type, text: txt });
    } else if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      logs.push({ level: "exception", text: `${d.text} ${d.exception?.description || ""}` });
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Log.enable").catch(() => {});
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
  if (process.env.STEP === "menu") {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{sessionStorage.setItem('js_order_step','menu');}catch(e){}` });
  }
  await send("Page.navigate", { url: `${BASE}${ROUTE}` });
  await sleep(WAIT);

  console.log(`=== ${BASE}${ROUTE} ===`);
  console.log("\n--- console (%d) ---", logs.length);
  for (const l of logs.slice(0, 40)) console.log(`[${l.level}] ${String(l.text).slice(0, 400)}`);

  const dom = await evaluate(`(() => ({
    article: document.querySelectorAll('article').length,
    plusButtons: [...document.querySelectorAll('button[aria-label]')].map(b=>b.getAttribute('aria-label')).filter(x=>x&&x.startsWith('+1')).slice(0,5),
    badge: document.body.innerText.match(/\\d+ Issue[s]?/)?.[0] || null,
  }))()`);
  console.log("\n--- DOM ---");
  console.log("article       :", dom.article);
  console.log("tombol +1     :", JSON.stringify(dom.plusButtons));
  console.log("badge overlay :", dom.badge);
} catch (e) {
  console.error("GAGAL:", e.message);
} finally {
  try { ws?.close(); } catch {}
  edge.kill(); await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch {}
}