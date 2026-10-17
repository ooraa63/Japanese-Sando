// Ukur posisi elemen di halaman lokal lewat DevTools Protocol.
//
// Dipakai karena `shot-cdp.mjs` memfoto dengan `captureBeyondViewport: true`,
// jadi elemen `position: fixed`TERLIHAT mengambang di tengah gambar penuh dan
// posisinya tidak bisa dinilai dari screenshot. Script ini membaca
// `getBoundingClientRect()` yang memang relentlessly.
//
// Pakai:  node scripts/ukur.mjs <url> <lebar> <tinggi> <nama> @seed.json [aksi] [ss.png]
//
// Argumen `ss.png` opsional: simpan screenshot VIEWPORT ke file itu, diambil
// SETELAH `aksi` selesai. Viewport saja (bukan `captureBeyondViewport`) supaya
// elemen `position: fixed` tetap terlihat di tempatnya yang sebenarnya.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.log("GAGAL: tidak ada Chrome.");
  process.exit(1);
}

const [target = "http://localhost:3000/", lebarArg = "1440", tinggiArg = "900", nama = "ukur", seedArg, aksiArg, ssArg] =
  process.argv.slice(2);

const seed = !seedArg
  ? {}
  : JSON.parse(fs.readFileSync(path.resolve(process.cwd(), seedArg.replace(/^@/, "")), "utf8"));

/**
 * `aksi` boleh lewat langsung sebagai kode, ATAU `@path/file.js` kalau terlalu
 * panjang atau mengandung banyak kutip (lebih aman daripada meneruskan lewat
 * argumen baris perintah di PowerShell).
 */
const aksi = aksiArg && aksiArg.startsWith("@")
  ? fs.readFileSync(path.resolve(process.cwd(), aksiArg.replace(/^@/, "")), "utf8")
  : aksiArg;

const lebar = Number(lebarArg);
const tinggi = Number(tinggiArg);
const PORT = 9700 + Math.floor(Math.random() * 300);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--user-data-dir=" + path.join(process.cwd(), ".shots", ".profile-" + nama),
    "--remote-debugging-port=" + PORT,
    "--window-size=" + lebar + "," + tinggi,
    "about:blank",
  ],
  { stdio: "ignore" }
);

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(p, method = "GET") {
  const res = await fetch("http://127.0.0.1:" + PORT + p, { method });
  return JSON.parse(await res.text());
}

let ws;
let seq = 0;
const tunggu = new Map();
function kirim(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    tunggu.set(id, { resolve, reject });
    setTimeout(() => {
      if (tunggu.has(id)) {
        tunggu.delete(id);
        reject(new Error("timeout " + method));
      }
    }, 45000);
  });
}

let gagal = false;
try {
  let version = null;
  for (let i = 0; i < 60; i++) {
    try {
      version = await json("/json/version");
      break;
    } catch {
      await tidur(250);
    }
  }
  if (!version) throw new Error("devtools tidak merespons");

  const tab = await json("/json/new?about:blank", "PUT");
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && tunggu.has(m.id)) {
      const { resolve, reject } = tunggu.get(m.id);
      tunggu.delete(m.id);
      if (m.error) reject(new Error(m.error.message));
      else resolve(m.result);
    }
  });

  await kirim("Page.enable");
  await kirim("Runtime.enable");
  await kirim("Emulation.setDeviceMetricsOverride", {
    width: lebar,
    height: tinggi,
    deviceScaleFactor: 1,
    mobile: lebar < 768,
  });

  await kirim("Page.navigate", { url: new URL(target).origin + "/" });
  await tidur(2500);

  if (Object.keys(seed).length > 0) {
    const isi = (store, obj) =>
      "for (const [k, v] of Object.entries(" +
      JSON.stringify(obj) +
      ")) " +
      store +
      ".setItem(k, typeof v === 'string' ? v : JSON.stringify(v));";
    const sumber =
      "try {" +
      (seed.localStorage ? isi("localStorage", seed.localStorage) : "") +
      (seed.sessionStorage ? isi("sessionStorage", seed.sessionStorage) : "") +
      "} catch (e) {}";
    await kirim("Page.addScriptToEvaluateOnNewDocument", { source: sumber });
  }

  await kirim("Page.navigate", { url: target });
  await tidur(6000);
  await kirim("Runtime.evaluate", {
    expression: "new Promise(r => requestAnimationFrame(() => setTimeout(r, 900)))",
    awaitPromise: true,
  });

  if (aksi) {
    const r = await kirim("Runtime.evaluate", {
      expression: aksi,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) console.log("  aksi gagal: " + JSON.stringify(r.exceptionDetails).slice(0, 300));
    else if (r.result?.value !== undefined) console.log("  aksi -> " + JSON.stringify(r.result.value));
    await kirim("Runtime.evaluate", {
      expression: "new Promise(r => setTimeout(r, 700))",
      awaitPromise: true,
    });
  }

  const probe = `
    (() => {
      const pick = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          left: Math.round(r.left), right: Math.round(r.right),
          w: Math.round(r.width), h: Math.round(r.height),
        };
      };
      const header = document.querySelector('header');
      return JSON.stringify({
        viewport: { w: window.innerWidth, h: window.innerHeight },
        scrollY: Math.round(window.scrollY),
        docH: document.documentElement.scrollHeight,
        header: pick('header'),
        waFab: pick('[data-wa-fab]'),
        cartHeader: pick('[data-cart-header-button]'),
        cartDock: pick('[data-cart-dock]'),
        cartRail: pick('[data-cart-rail]'),
        pickupList: pick('[data-pickup-store-list]'),
        judulRail: (() => {
          const h = document.querySelector('[data-cart-rail] h3');
          if (!h) return null;
          const r = h.getBoundingClientRect();
          const hb = header ? header.getBoundingClientRect() : null;
          return {
            teks: (h.textContent || '').trim(),
            top: Math.round(r.top),
            tertutupHeader: hb ? r.top < hb.bottom : null,
          };
        })(),
      });
    })()
  `;
  const res = await kirim("Runtime.evaluate", { expression: probe, returnByValue: true });
  console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));

  if (ssArg) {
    const ss = await kirim("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const file = path.resolve(process.cwd(), ssArg.replace(/^@/, ""));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(ss.data, "base64"));
    console.log("  screenshot -> " + file + " (" + fs.statSync(file).size + " byte)");
  }
} catch (e) {
  console.log("GAGAL: " + (e.message || e));
  gagal = true;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  try {
    execFileSync("taskkill", ["/PID", String(chrome.pid), "/F", "/T"], { stdio: "ignore" });
  } catch {}
}
process.exit(gagal ? 1 : 0);