/**
 * Verifikasi item 10 (Catatan Pengambilan & Pengiriman) di browser sungguhan:
 *   a) /admin/pickup-delivery: 2 tab, tab "Ambil di Toko" default, daftar
 *      titik ambil + catatannya tampil, form punya field catatan & jenis.
 *   b) /order: pemilih "Lokasi pengambilan" MUNCUL dan menampilkan catatan
 *      jam ambil (sebelum migration-39 kolom `kind` tidak sampai ke klien).
 *
 * Butuh login admin -> pakai kredensial dari .env.local, diisi lewat form
 * login sungguhan di browser.
 *
 *   node scripts/check-pickup-delivery.js
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9500 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `pickup-test-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--remote-allow-origins=*", "--window-size=1440,1000", "about:blank",
], { stdio: "ignore" });

let ws; let id = 0; const pending = new Map();
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
  if (result.subtype === "error") throw new Error(result.description || "eval error");
  return result.value;
};
async function waitFor(expr, label, timeoutMs = 25000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { const v = await evaluate(`(() => { try { return (${expr}); } catch { return null; } })()`); if (v) return v; } catch {}
    await sleep(300);
  }
  throw new Error(`timeout menunggu: ${label}`);
}
const shots = [];
async function shot(name) {
  const s = await send("Page.captureScreenshot", { format: "png" });
  const p = path.join(os.tmpdir(), `pickup-${name}.png`);
  writeFileSync(p, Buffer.from(s.data, "base64"));
  shots.push(p);
}
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
  };
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // ---------- Login admin ----------
  await send("Page.navigate", { url: `${BASE}/admin/login` });
  await waitFor(`!!document.querySelector('input[name="password"]')`, "form login");
  await evaluate(`(() => {
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('input[name="email"]'), ${JSON.stringify(process.env.ADMIN_EMAIL || "")});
    set(document.querySelector('input[name="password"]'), ${JSON.stringify(process.env.ADMIN_PASSWORD || "")});
    return true;
  })()`);
  await sleep(800);
  // Klik tombol submit (bukan requestSubmit — server action React butuh klik nyata).
  await evaluate(`(() => {
    const f = document.querySelector('input[name="password"]').closest('form');
    const btn = f && f.querySelector('button[type="submit"]');
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
  // Tunggu sampai pathname berubah (login sukses = redirect ke /admin).
  try {
    await waitFor(`!location.pathname.includes('login')`, "redirect setelah login", 30000);
  } catch {
    const err = await evaluate(`document.body.innerText.replace(/\\s+/g,' ').slice(0, 300)`);
    throw new Error(`login gagal. teks halaman: ${err}`);
  }
  const pathSetelahLogin = await evaluate("location.pathname");
  cek("Login admin", true, `path=${pathSetelahLogin}`);

  // ---------- A) Halaman admin baru ----------
  await send("Page.navigate", { url: `${BASE}/admin/pickup-delivery` });
  await waitFor(`/Ambil di Toko/.test(document.body.innerText)`, "tab Ambil di Toko");
  await sleep(2000);
  const tabPickup = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      adaJudul: /Catatan Pengambilan/.test(t),
      adaKeduaTab: /Ambil di Toko/.test(t) && /Pengantaran/.test(t),
      titikTampil: /Rumah Sushi/.test(t) && /UVERS/.test(t),
      catatanTampil: /Ambil pada jam Operational/.test(t),
      adaDiSidebar: /Ambil & Kirim|Ambil &amp; Kirim/.test(document.querySelector('nav')?.innerText || ''),
    };
  })()`);
  cek("a1 Judul halaman", tabPickup.adaJudul, `"Catatan Pengambilan & Pengiriman"`);
  cek("a2 Dua tab terlihat", tabPickup.adaKeduaTab, "Ambil di Toko + Pengantaran");
  cek("a3 Titik ambil tampil", tabPickup.titikTampil, "Rumah Sushi & UVERS");
  cek("a4 Catatan jam ambil tampil", tabPickup.catatanTampil, '"Ambil pada jam Operational. ..."');
  cek("a5 Menu di sidebar", tabPickup.adaDiSidebar, 'nav admin berisi "Ambil & Kirim"');
  await shot("admin-tab-pickup");

  // Tab Pengarantine
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^Pengantaran$/.test((x.innerText||'').trim()));
    if (b) { b.click(); return true; } return false;
  })()`);
  await sleep(2000);
  const tabDelivery = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      zonaAntaran: /Vihara Tian En/.test(t),
      tidakAdaPickup: !/Rumah Sushi/.test(t),
      adaOngkir: /Rp ?10\\.000|10\\.000/.test(t),
    };
  })()`);
  cek("a6 Tab Pengantaran: zona antaran", tabDelivery.zonaAntaran, "Vihara Tian En terlihat");
  cek("a7 Tab Pengantaran: titik ambil tersembunyi", tabDelivery.tidakAdaPickup, "Rumah Sushi tidak ikut tampil");
  cek("a8 Tab Pengantaran: ongkir tampil", tabDelivery.adaOngkir, "angka ongkir terlihat");
  await shot("admin-tab-delivery");

  // Kembali ke tab "Ambil di Toko" dulu — form di tab ini yang kita periksa
  // (di tab Pengantaran, ongkir memang sengaja ada).
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /^Ambil di Toko$/.test((x.innerText||'').trim()));
    if (b) { b.click(); return true; } return false;
  })()`);
  await sleep(1800);

  // Form zona baru punya field catatan?
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Tambah titik/.test((x.innerText||'').trim()));
    if (b) { b.click(); return true; } return false;
  })()`);
  await sleep(1500);
  const form = await evaluate(`(() => {
    const d = document.body;
    const t = d.innerText;
    return {
      adaCatatan: /Catatan untuk pembeli/.test(t),
      adaJenis: /Ambil di toko/.test(t) && /Pengantaran/.test(t),
      adaOngkir: /Ongkir/.test(t),
      adaTextarea: d.querySelectorAll('textarea').length,
    };
  })()`);
  cek("a9 Form punya field catatan", form.adaCatatan && form.adaTextarea >= 1, `textarea=${form.adaTextarea}`);
  cek("a10 Pilihan jenis disembunyikan di tab terfilter", !form.adaJenis, "tab sudah menentukan jenis, jadi tak perlu pilih lagi");
  cek("a11 Ongkir disembunyikan untuk titik ambil", !form.adaOngkir, "kolom Ongkir tidak ada di tab Ambil di Toko");
  await shot("admin-form");

  // ---------- B) Sisi pembeli ----------
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 2, mobile: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try{sessionStorage.setItem('js_order_step','payment');}catch(e){}` });
  await send("Page.navigate", { url: `${BASE}/order` });
  await waitFor(`document.body.innerText.includes('Pilih cara Obt') || /Ambil di toko|Diantar/i.test(document.body.innerText)`, "langkah pembayaran");
  await sleep(2500);
  const pembeli = await evaluate(`(() => {
    const t = document.body.innerText;
    const cek = /Ambil di toko/i.test(t);
    // Pilih "Ambil di toko" supaya daftar lokasi ikut muncul.
    const btn = [...document.querySelectorAll('button')].find(b => /Ambil di toko/i.test((b.innerText||'').trim()));
    if (btn) btn.click();
    return { adaPilihMetode: cek, diklik: !!btn };
  })()`);
  await sleep(2000);
  const lok = await evaluate(`(() => {
    const t = document.body.innerText;
    return {
      judulMuncul: /Lokasi pengambilan/i.test(t),
      adaTitik: /Rumah Sushi/.test(t) && /UVERS/.test(t),
      adaCatatan: /Ambil pada jam Operational/.test(t),
    };
  })()`);
  cek("b1 Pemilih metode pengiriman", pembeli.adaPilihMetode, '"Ambil di toko" tersedia');
  cek("b2 Judul 'Lokasi pengambilan' muncul", lok.judulMuncul, "kondisi kind='pickup' sampai ke klien");
  cek("b3 Titik ambil tampil ke pembeli", lok.adaTitik, "Rumah Sushi & UVERS");
  cek("b4 Catatan jam ambil tampil", lok.adaCatatan, '"Ambil pada jam Operational. ..."');
  await shot("order-pickup");

  console.log(`\nScreenshot: ${shots.join(", ")}`);
  const gagal = hasil.filter((x) => !x).length;
  console.log(`\n${hasil.length - gagal}/${hasil.length} pemeriksaan lulus.`);
  if (gagal) process.exitCode = 1;
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  edge.kill(); await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch {}
}