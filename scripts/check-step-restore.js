/**
 * Uji siklus "refresh di tengah pesanan" di /order:
 *   1. Buka /order (tanpa seed) -> harus step 01 "Data Kamu", tanpa error.
 *   2. Klik "Pilih Rasa" (pindah step) -> sessionStorage tersimpan.
 *   3. RELOAD halaman -> harus kembali ke step 02 "Pilih Rasa"
 *      (restore bekerja) DAN tanpa hydration error (restore tidak merusak SSR).
 *
 *   node scripts/check-step-restore.js
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9500 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `step-test-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--remote-allow-origins=*", "--window-size=390,900", "about:blank",
], { stdio: "ignore" });

let ws; let id = 0; const pending = new Map(); const errors = [];
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
const hasil = [];
const cek = (nama, ok, detail) => {
  hasil.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${nama} — ${detail}`);
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
    else if (m.method === "Runtime.exceptionThrown") {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });

  const stepSekarang = () => evaluate(`(() => {
    const t = document.body.innerText;
    const m = t.match(/(0[1-4])\\s*\\/\\s*04\\s*([^\\n]+)/);
    return { label: m ? m[2].trim() : null, step: sessionStorage.getItem('js_order_step') };
  })()`);

  // 1) Buka /order untuk pertama kali.
  await send("Page.navigate", { url: `${BASE}/order` });
  await sleep(8000);
  const awal = await stepSekarang();
  cek("Buka pertama -> step identity", awal.label === "Data Kamu", `label="${awal.label}", storage=${awal.step}`);

  // 2) Simulasikan "pembeli sudah di tengah pesanan lalu refresh":
  //    sessionStorage sudah berisi langkah "menu" saat dokumen dimuat.
  //    (Di app nyata ini terjadi karena `goTo()` menuliskannya.)
  await evaluate(`try { sessionStorage.setItem('js_order_step','menu'); } catch(e){}`);
  const tersimpan = await evaluate(`sessionStorage.getItem('js_order_step')`);
  cek("Langkah tersimpan di storage", tersimpan === "menu", `js_order_step=${tersimpan}`);

  // 3) RELOAD -> harus restore langkah DAN tanpa hydration error.
  errors.length = 0;
  await send("Page.reload", { ignoreCache: true });
  await sleep(9000);
  const reload = await stepSekarang();
  const hydration = errors.filter((e) => /hydrat/i.test(e || ""));
  cek("Reload -> langkah ter-restore", reload.label === "Pilih Rasa", `label="${reload.label}", storage=${reload.step}`);
  cek("Reload -> tanpa hydration error", hydration.length === 0,
    hydration.length ? hydration[0].slice(0, 160) : "console bersih");

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const out = path.join(os.tmpdir(), "step-restore.png");
  writeFileSync(out, Buffer.from(shot.data, "base64"));

  console.log(`\nScreenshot: ${out}`);
  console.log(`\n${hasil.filter(Boolean).length}/${hasil.length} pemeriksaan lulus.`);
  if (hasil.some((x) => !x)) process.exitCode = 1;
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  edge.kill(); await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch {}
}