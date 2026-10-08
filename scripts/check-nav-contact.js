/**
 * Verifikasi item 1, 2, 3, 6 dari dokumen "Perbaikan Ruma Komugi 2":
 *   1. Bottom nav hanya tampil di laptop, hilang di HP.
 *   2. "Kontak" hilang dari navigasi (footer/header), hidup di Akun sbg popup.
 *   3. Tekan "Pesan Sekarang" -> popup kecil login / tamu.
 *   6. Sticky bar keranjang tidak ketimpa nav bawah di /order.
 *
 *   node scripts/check-nav-contact.js
 */
import { spawn } from "node:child_process";
import { rmSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9500 + Math.floor(Math.random() * 300);
const profileDir = path.join(os.tmpdir(), `nav-test-${PORT}`);
const BASE = process.env.APP_URL || "http://localhost:3099";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shots = [];

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  "--headless=new", "--hide-scrollbars", "--no-first-run", "--disable-extensions",
  "--remote-allow-origins=*", "--window-size=1400,1000", "about:blank",
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
async function goto(route, viewport, wait = 4500) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: viewport.w, height: viewport.h, deviceScaleFactor: 1, mobile: viewport.w < 768,
  });
  await send("Page.navigate", { url: `${BASE}${route}` });
  await sleep(wait);
}
async function shot(name) {
  const s = await send("Page.captureScreenshot", { format: "png" });
  const p = path.join(os.tmpdir(), `nav-${name}.png`);
  writeFileSync(p, Buffer.from(s.data, "base64"));
  shots.push(p);
  return p;
}

const NAV_PROBE = `(() => {
  const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
  const r = nav?.getBoundingClientRect();
  return {
    ada: !!nav,
    tampil: nav ? getComputedStyle(nav).display !== 'none' && r.width > 0 : false,
    top: r ? Math.round(r.top) : null,
    vh: window.innerHeight,
  };
})()`;

/** Footer = blok INFORMASI TOKO (Tautan Cepat + Hubungi Kami). */
const FOOTER_PROBE = `(() => {
  const f = document.querySelector('footer');
  const r = f?.getBoundingClientRect();
  return {
    ada: !!f,
    tampil: f ? getComputedStyle(f).display !== 'none' && r.height > 0 : false,
    tinggi: r ? Math.round(r.height) : null,
    isi: f ? f.innerText.replace(/\\s+/g,' ').trim().slice(0, 70) : null,
  };
})()`;

const hasil = [];
const cek = (nama, ok, detail) => {
  hasil.push({ nama, ok: ok ? "✅" : "❌", detail });
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

  // ---------- ITEM 1: FOOTER (informasi toko) hanya di PC ----------
  await goto("/", { w: 390, h: 844 });
  const hpFooter = await evaluate(FOOTER_PROBE);
  cek("Item 1 — footer (info toko) TIDAK tampil di HP",
    hpFooter.tampil === false,
    `display=${hpFooter.tampil ? "tampil" : "tersembunyi"}`);

  const hpNav = await evaluate(NAV_PROBE);
  cek("Item 1 — nav bawah (Beranda/Pesanan Saya/Akun) tetap ada di HP",
    hpNav.tampil === true,
    `top=${hpNav.top} dari ${hpNav.vh}px`);
  await shot("hp-beranda");

  await goto("/", { w: 1280, h: 900 });
  const laptopFooter = await evaluate(FOOTER_PROBE);
  cek("Item 1 — footer (info toko) tampil di laptop",
    laptopFooter.tampil === true,
    `tinggi=${laptopFooter.tinggi}px, isi="${(laptopFooter.isi || "").slice(0, 45)}..."`);

  const laptopNav = await evaluate(NAV_PROBE);
  cek("Item 1 — nav bawah tidak muncul di laptop",
    laptopNav.tampil === false,
    `tampil=${laptopNav.tampil}`);
  await shot("laptop-beranda");

  // ---------- ITEM 2: Kontak hilang dari navigasi ----------
  // Catatan: We're di viewport laptop (1280px) supaya footer ikut ter-render
  // — di HP footer memang tidak ada sama sekali (item 1).
  const navLinks = await evaluate(`(() => {
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const footerQuick = [...document.querySelectorAll('footer h3')]
      .find(h => /tautan cepat/i.test(h.innerText))
      ?.nextElementSibling;
    const headerNav = document.querySelector('nav[aria-label="Main"]');
    return {
      bottomNav: nav ? nav.innerText.replace(/\\s+/g,' ').trim() : null,
      footer: footerQuick ? footerQuick.innerText.replace(/\\s+/g,' ').trim() : null,
      header: headerNav ? headerNav.innerText.replace(/\\s+/g,' ').trim() : null,
    };
  })()`);
  const adaKontak = (s) => s && /kontak/i.test(s);
  cek("Item 2 — Kontak hilang dari nav bawah HP", !adaKontak(navLinks.bottomNav), `isi: "${navLinks.bottomNav}"`);
  cek("Item 2 — Kontak hilang dari TAUTAN CEPAT footer", !adaKontak(navLinks.footer), `isi: "${navLinks.footer}"`);
  cek("Item 2 — Kontak hilang dari nav header", !adaKontak(navLinks.header), `isi: "${navLinks.header}"`);

  // ---------- ITEM 3: popup Pesan Sekarang ----------
  await goto("/", { w: 390, h: 844 }, 5500);
  const popup = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('button, a')]
      .find(b => /^Pesan Sekarang$/.test((b.innerText || '').trim()));
    if (!btn) return { ketemu: false };
    btn.click();
    return { ketemu: true };
  })()`);
  await sleep(900);
  const isiPopup = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    return { judul: d.querySelector('h2')?.innerText?.trim(), teks: d.innerText.replace(/\\s+/g,' ').trim().slice(0,180) };
  })()`);
  cek("Item 3 — popup muncul saat tekan Pesan Sekarang",
    !!isiPopup && /akun|tamu/i.test(isiPopup.teks),
    isiPopup ? `"${isiPopup.judul}" — ${isiPopup.teks.slice(0, 110)}` : "tidak ada [role=dialog]");
  await shot("popup-pesan");

  // ---------- ITEM 6: sticky bar keranjang tidak ketimpa ----------
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `try { sessionStorage.setItem('js_order_step','menu'); } catch(e){}` });
  await goto("/order", { w: 390, h: 844 }, 6500);
  const orderHp = await evaluate(NAV_PROBE);
  cek("Item 6 — nav bawah tidak muncul di /order", orderHp.tampil === false, `tampil=${orderHp.tampil}`);

  // Isi keranjang lewat UI supaya sticky bar muncul. Tombol pertama di kartu
  // rasaBernama "Tambah ke keranjang"; stepper +/- baru muncul setelah itu.
  const ditambah = await evaluate(`(() => {
    const btn = [...document.querySelectorAll('article button')]
      .find(b => /Tambah ke keranjang/i.test((b.innerText || '').trim()));
    if (!btn) return null;
    btn.click();
    return (btn.innerText || '').trim();
  })()`);
  await sleep(1800);
  const sticky = await evaluate(`(() => {
    const all = [...document.querySelectorAll('div')]
      .filter(d => getComputedStyle(d).position === 'sticky')
      .map(d => {
        const r = d.getBoundingClientRect();
        return { teks: (d.innerText || '').replace(/\\s+/g,' ').trim().slice(0,60), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const nr = nav?.getBoundingClientRect();
    const bar = all.find(x => /Rumakomugi/i.test(x.teks));
    return {
      semua: all,
      bar,
      navAda: !!nr,
      vh: window.innerHeight,
      terpotong: bar ? bar.bottom > window.innerHeight : null,
    };
  })()`);
  cek("Item 6 — sticky bar keranjang terender penuh",
    !!(sticky.bar && !sticky.terpotong),
    sticky.bar
      ? `teks="${sticky.bar.teks}" bottom=${sticky.bar.bottom} vs viewport ${sticky.vh}, nav=${sticky.navAda}`
      : `tidak ketemu (tombol: ${ditambah}, sticky: ${JSON.stringify(sticky.semua)})`);
  await shot("order-hp-sticky");

  await goto("/", { w: 1280, h: 900 }, 4500);
  await evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await sleep(800);
  // Di desktop tidak ada nav bawah lagi, jadi footer (info toko) bebas penuh
  // sampai dasar halaman — copyright-nya tidak boleh terpotong viewport.
  const footerNav = await evaluate(`(() => {
    const nav = document.querySelector('nav[aria-label="Mobile navigation"]');
    const copyright = [...document.querySelectorAll('footer p')].find(p => /©/.test(p.innerText));
    const c = copyright?.getBoundingClientRect();
    return {
      navAda: !!nav && getComputedStyle(nav).display !== 'none',
      copyrightBottom: c ? Math.round(c.bottom) : null,
      vh: window.innerHeight,
    };
  })()`);
  cek("Item 6 — footer penuh sampai bawah di desktop",
    footerNav.navAda === false && (footerNav.copyrightBottom ?? 0) <= footerNav.vh,
    `nav bawah=${footerNav.navAda}, copyright bawah=${footerNav.copyrightBottom}px dari ${footerNav.vh}px`);
  await shot("laptop-footer");

  console.log(`\nScreenshot: ${shots.join(", ")}`);
  const gagal = hasil.filter((h) => h.ok === "❌");
  console.log(`\n${hasil.length - gagal.length}/${hasil.length} pemeriksaan lulus.`);
  if (gagal.length) process.exitCode = 1;
} catch (e) {
  console.error("GAGAL:", e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  edge.kill(); await sleep(300);
  try { if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true }); } catch {}
}