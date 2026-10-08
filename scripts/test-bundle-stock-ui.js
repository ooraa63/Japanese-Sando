/**
 * Uji stok bundle sampai ke komponen yang benar-benar dirender — end-to-end.
 *
 * Cara: pakai DevTools Protocol untuk benar-benar MENGGUNAKAN UI-nya:
 *   1. buka /order (viewport HP),
 *   2. catat angka "Tersedia N" di kartu rasa sebagai baseline,
 *   3. klik kartu bundle "Sando 2",
 *   4. pilih 2 rasa di modal (tombol "+"),
 *   5. klik Konfirmasi,
 *   6. catat angka "Tersedia N" lagi.
 *
 * Ekspektasi: stok kategori 10, bundle 2 slot -> kartu biasa turun ke 8,
 * dan kartu bundle jadi terkunci (item 5: satu bundle hanya sekali).
 *
 * Catatan: pendekatan lama menyuntik localStorage, tapi `OrderFlow` mereset
 * keranjang saat unmount (efek StrictMode di dev), jadi seed selalu hilang
 * sebelum komponen membacanya. Mengklik UI-nya jauh lebih jujur.
 *
 *   node scripts/test-bundle-stock-ui.js
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9500 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `bundle-test-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const BUNDLE_NAME = process.env.BUNDLE_NAME || "Sando 2";
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

const evaluate = async (expression) => {
  const { result } = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.subtype === "error") throw new Error(result.description || "eval error");
  return result.value;
};

/** Tunggu sampai ekspresi mengembalikan nilai truthy. */
async function waitFor(expression, label, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const v = await evaluate(`(() => { try { return (${expression}); } catch { return null; } })()`);
      if (v) return v;
    } catch { /* halaman belum siap */ }
    await sleep(300);
  }
  throw new Error(`timeout menunggu: ${label}`);
}

/** Ambil angka "Tersedia N" dari setiap kartu rasa yang tampil. */
const READ_STOCK = `(() => {
  const cards = [...document.querySelectorAll('article')];
  return cards.map(c => {
    const nama = (c.querySelector('h3')?.textContent || '').trim();
    const m = (c.innerText.match(/Tersedia\\s+(\\d+)/) || [])[1];
    return { nama, tersedia: m ? Number(m) : null };
  }).filter(x => x.nama);
})()`;

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
    width: 390, height: 900, deviceScaleFactor: 2, mobile: true,
  });

  // Buka langsung di langkah "Pilih Rasa". Ini HANYA mengisi sessionStorage
  // (langkah aktif), bukan keranjang — keranjang kita isi lewat klik UI sungguhan.
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `try { sessionStorage.setItem('js_order_step', 'menu'); } catch (e) {}`,
  });

  console.log(`Membuka ${BASE}/order ...`);
  await send("Page.navigate", { url: `${BASE}/order` });

  // Tunggu kartu rasa benar-benar muncul.
  await waitFor(
    `document.querySelectorAll('article').length > 0`,
    "kartu rasa muncul di /order"
  );
  await sleep(1500); // bereskan render + fetch counter terjual

  const baseline = await evaluate(READ_STOCK);
  console.log("\n[1] Sebelum bundle dipilih:");
  console.table(baseline);

  // --- Buka modal bundle dengan mengklik kartunya ---
  const dibuka = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => ${JSON.stringify(BUNDLE_NAME)} === (b.querySelector('h3')?.textContent || '').trim());
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  if (!dibuka) throw new Error(`kartu bundle "${BUNDLE_NAME}" tidak ditemukan`);
  console.log(`\n[2] Modal bundle "${BUNDLE_NAME}" dibuka.`);

  // Tunggu tombol "+" di modal siap.
  await waitFor(
    `!!document.querySelector('button[aria-label="+1 ${BUNDLE_NAME}"]')`,
    "tombol + di modal"
  );

  // --- Pilih 2 rasa (bundle "Sando 2" butuh 2 slot) ---
  const slots = Number(process.env.SLOTS || 2);
  for (let i = 0; i < slots; i++) {
    const ok = await evaluate(`(() => {
      const b = document.querySelector('button[aria-label="+1 ${BUNDLE_NAME}"]');
      if (!b || b.disabled) return false;
      b.click();
      return true;
    })()`);
    if (!ok) throw new Error(`slot ${i + 1} gagal dipilih (tombol nonaktif)`);
    await sleep(600);
  }
  const terisi = await evaluate(
    `(document.querySelector('[aria-label="${BUNDLE_NAME}"]')?.innerText || '').replace(/\\s+/g,' ').trim()`
  );
  console.log(`[3] Slot terisi di modal: ${terisi}`);

  // Stok di dalam modal harus ikut turun (helper yang sama).
  const modalStock = await evaluate(READ_STOCK);
  console.log("    Stok yang tampil DI DALAM modal (sudah memotong slot sendiri):");
  console.table(modalStock);

  // --- Konfirmasi ---
  const konfirmasi = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /^Konfirmasi$/.test((b.innerText || '').trim()));
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  })()`);
  if (!konfirmasi) throw new Error("tombol Konfirmasi tidak aktif");
  console.log("[4] Bundle dikonfirmasi.");
  await sleep(2000);

  // --- Baca hasil ---
  const sesudah = await evaluate(READ_STOCK);
  console.log("\n[5] Setelah bundle masuk keranjang:");
  console.table(sesudah);

  const statusBundle = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => ${JSON.stringify(BUNDLE_NAME)} === (b.querySelector('h3')?.textContent || '').trim());
    return btn ? { disabled: btn.disabled, teks: (btn.innerText || '').replace(/\\s+/g,' ').trim().slice(0, 70) } : null;
  })()`);
  const cart = await evaluate(`(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('js_cart_v1') || 'null');
      if (!raw) return null;
      return { jumlahBundle: (raw.bundles || []).length, slots: (raw.bundles || [])[0]?.slots };
    } catch { return null; }
  })()`);

  const angka = sesudah.map((x) => x.tersedia).filter((n) => typeof n === "number");
  const unik = [...new Set(angka)];
  const okStok = unik.length === 1 && unik[0] === 8;
  const okKunci = statusBundle?.disabled === true;

  console.log("\n=== HASIL ===");
  console.log("Nilai 'Tersedia' sebelum :", [...new Set(baseline.map((x) => x.tersedia))].join(", "));
  console.log("Nilai 'Tersedia' sesudah :", unik.join(", ") || "(tidak ada)");
  console.log("Bundle di keranjang      :", JSON.stringify(cart));
  console.log("Kartu bundle             :", JSON.stringify(statusBundle));
  console.log(
    okStok
      ? "\n✅ ITEM 4 BENAR: stok 10 - bundle 2 slot = 8 (slot bundle ikut dipotong)."
      : `\n❌ ITEM 4 MASIH BUG: diharapkan 8, dapat ${unik.join(", ") || "(tidak ada)"}.`
  );
  console.log(
    okKunci
      ? "\n✅ ITEM 5 BENAR: kartu bundle terkunci setelah masuk keranjang."
      : "\n❌ ITEM 5 MASIH BUG: kartu bundle tidak terkunci."
  );

  const shot = await send("Page.captureScreenshot", { format: "png" });
  const out = path.join(os.tmpdir(), "bundle-stock-e2e.png");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log(`\nScreenshot: ${out}`);

  if (!okStok || !okKunci) process.exitCode = 1;
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* abaikan */ }
  edge.kill();
  await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch { /* abaikan */ }
}