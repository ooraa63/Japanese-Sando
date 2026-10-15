// Screenshot halaman lokal pada lebar tertentu, DENGAN state browser yang
// bisa diisi lebih dulu (localStorage/sessionStorage).
//
// Dipakai karena viewport Browser bawaan = lebar panel FilePanel (639px),
// jadi breakpoint `lg:` (1024px) tidak pernah aktif di sana dan tampilan
// desktop tidak bisa dinilai dari sana. Lihat gotcha #116.
//
// Cara kerjanya (DevTools Protocol, nol dependensi karena Node 22+ sudah
// punya `WebSocket` global):
//
//   1. Buka halaman asal yang TIDAK memount `OrderFlow`.
//   2. Isi localStorage + sessionStorage.
//   3. Navigasi ke halaman tujuan (bukan `Page.reload`).
//
// Poin 1-3 itu wajib, bukan Preference. `OrderFlow` punya efek yang menghapus
// `js_order_step` saat komponen dilepas (permintaan Steven 14-10-2026: balik ke
// /order selalu mulai dari langkah pertama). Kalau storage diisi lalu halaman
// di-`reload`, cleanup efek lama itu ikut menyala saat halaman lama dibuang --
// sehingga `js_order_step` hilang LAGI sebelum halaman baru sempat membacanya.
// Dulu skrip ini diam-diam memfoto langkah pertama karena itu.
//
// Isi storage juga harus DI LUAR daftar target, bukan hanya localStorage:
// localStorage bertahan lintas navigasi, sessionStorage tidak.
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

const OUT = path.resolve(process.cwd(), ".shots");
fs.mkdirSync(OUT, { recursive: true });

const [
  target = "http://localhost:3000/",
  lebarArg = "1440",
  tinggiArg = "900",
  nama = "shot",
] = process.argv.slice(2);

// Parameter ke-6 boleh JSON langsung, atau `@namafile` untuk membaca dari
// file. PowerShell menghapus tanda kutip dari argumen, jadi bentuk `@file`
// jauh lebih praktis dipakai dari terminal Windows.
const seedArg = process.argv[6];
const seed = !seedArg
  ? {}
  : seedArg.startsWith("@")
    ? JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), seedArg.slice(1)), "utf8"),
      )
    : JSON.parse(seedArg);
console.log("  seed: " + JSON.stringify(seed).slice(0, 200));

const lebar = Number(lebarArg);
const tinggi = Number(tinggiArg);

const PORT = 9333 + Math.floor(Math.random() * 400);
const profil = path.join(OUT, ".profile-" + nama);

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + profil,
    "--remote-debugging-port=" + PORT,
    "--window-size=" + lebar + "," + tinggi,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(pathname, method = "GET") {
  const res = await fetch("http://127.0.0.1:" + PORT + pathname, { method });
  const teks = await res.text();
  try {
    return JSON.parse(teks);
  } catch {
    throw new Error("devtools balas non-JSON: " + teks.slice(0, 160));
  }
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

  // Chrome versi baru hanya menerima PUT untuk /json/new.
  const tab = await json("/json/new?about:blank", "PUT");
  ws = new WebSocket(tab.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
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

  // 1. Buka halaman asal yang tidak memount OrderFlow.
  const asal = new URL(target).origin + "/";
  await kirim("Page.navigate", { url: asal });
  await tidur(2500);

  // 2. Pasang skrip yang mengisi storage di AWAL dokumen berikutnya, sebelum
  //    React sempat mount. Mengisi lewat `Runtime.evaluate` lalu `Page.navigate`
  //    tidak reliably: script-nya bisa saja jalan di execution context yang
  //    sudah dibuang, jadi nilainya hilang sebelum halaman baru membacanya.
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

  // 3. Navigasi (BUKAN reload) ke target.
  await kirim("Page.navigate", { url: target });
  await tidur(6000);

  // Beri waktu hydration + animasi selesai.
  await kirim("Runtime.evaluate", {
    expression: "new Promise(r => requestAnimationFrame(() => setTimeout(r, 900)))",
    awaitPromise: true,
  });

  // Parameter ke-7: JavaScript yang dijalankan SEBELUM foto, untuk membuka
  // panel yang menutupi halaman (mis. klik dock keranjang supaya sheet-nya
  // ikut kelihatan di screenshot).
  const aksi = process.argv[7];
  if (aksi) {
    const r = await kirim("Runtime.evaluate", {
      expression: aksi,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails) {
      console.log("  aksi gagal: " + JSON.stringify(r.exceptionDetails).slice(0, 200));
    }
    await kirim("Runtime.evaluate", {
      expression: "new Promise(r => setTimeout(r, 700))",
      awaitPromise: true,
    });
  }

  const cek = await kirim("Runtime.evaluate", {
    expression:
      "JSON.stringify({step: sessionStorage.getItem('js_order_step'), dock: !!document.querySelector('[data-cart-dock]'), rail: !!document.querySelector('[data-cart-rail]')})",
    returnByValue: true,
  });
  console.log("  state: " + cek.result.value);

  const shot = await kirim("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  const file = path.join(OUT, nama + ".png");
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log(
    "OK   " +
      lebar + "x" + tinggi +
      "  " + target +
      (Object.keys(seed).length ? "  (seed)" : "") +
      "  -> " + file +
      "  (" + fs.statSync(file).size + " byte)",
  );
} catch (e) {
  console.log("GAGAL: " + (e.message || e));
  gagal = true;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  try {
    execFileSync("taskkill", ["/PID", String(chrome.pid), "/F", "/T"], {
      stdio: "ignore",
    });
  } catch {}
}

process.exit(gagal ? 1 : 0);