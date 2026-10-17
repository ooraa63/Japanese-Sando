/**
 * Foto + periksa struktur halaman admin dengan sudah login.
 *
 * Kenapa skrip ini ada (17-10-2026):
 *   Struktur navigasi admin berubah menjadi launcher (/admin) + sidebar
 *   bergrouping per aplikasi. `test-pages.mjs` hanya bisa memastikan string
 *   ADA atau TIDAK di HTML, jadi dia tidak bisa memastikan sidebar memunculkan
 *   judul aplikasi dan bagian yang BENAR untuk tiap halaman. Skrip ini membaca
 *   DOM yang sudah dirender di Chrome, lalu mencetak:
 *     - judul aplikasi di sidebar
 *     - daftar bagian + menunya, dan menu mana yang ditandai aktif
 *     - isi launcher (salam, chip peringatan, lempeng aplikasi)
 *   Screenshot disimpan ke `.shots/admin/` supaya bisa dilihat langsung.
 *
 * Cara login: pakai `@supabase/ssr` persis seperti `inspect-admin-pages.mjs`,
 * jadi cookie session asli lalu cookie itu disuntikkan ke Chrome lewat
 * `Network.setCookies`. Tidak ada password yang dicetak ke layar.
 *
 * Pakai:
 *   APP_URL=http://localhost:3100 node scripts/shot-admin.mjs            (desktop)
 *   APP_URL=http://localhost:3100 node scripts/shot-admin.mjs mobile     (390px)
 *   APP_URL=http://localhost:3100 node scripts/shot-admin.mjs desktop /admin/menu
 *   APP_URL=http://localhost:3100 node scripts/shot-admin.mjs mobile /admin/orders drawer
 */
import { spawn, execFileSync } from "node:child_process";
import { createServerClient } from "@supabase/ssr";
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

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const APP = process.env.APP_URL || "http://localhost:3000";
const mode = process.argv[2] || "desktop";
const only = process.argv[3] || "";
/* "drawer": tekan tombol menu dulu supaya drawer mobile ikut kelihatan. */
const bukaDrawer = process.argv[4] === "drawer";
const LEBAR = mode === "mobile" ? 390 : 1440;
const TINGGI = mode === "mobile" ? 844 : 900;
const OUT = path.resolve(process.cwd(), ".shots", "admin");
fs.mkdirSync(OUT, { recursive: true });

/* Halaman yang harus dicek, urut dari layar awal lalu tiap aplikasi. */
const HALAMAN = [
  { slug: "00-launcher", url: "/admin" },
  { slug: "01-dashboard", url: "/admin/dashboard" },
  { slug: "02-orders", url: "/admin/orders" },
  { slug: "03-sales", url: "/admin/sales" },
  { slug: "04-customers", url: "/admin/customers" },
  { slug: "05-reviews", url: "/admin/reviews" },
  { slug: "06-menu", url: "/admin/menu" },
  { slug: "07-pickup-delivery", url: "/admin/pickup-delivery" },
  { slug: "08-po-berlangsung", url: "/admin/po?tab=berlangsung" },
  { slug: "09-po-selesai", url: "/admin/po?tab=selesai" },
  { slug: "10-po-detail", url: "/admin/po/22" },
  { slug: "11-set-identity", url: "/admin/settings?tab=identity" },
  { slug: "12-set-contact", url: "/admin/settings?tab=contact" },
  { slug: "13-set-hours", url: "/admin/settings?tab=hours" },
  { slug: "14-set-shipping", url: "/admin/settings?tab=shipping" },
  { slug: "15-set-payment", url: "/admin/settings?tab=payment" },
  { slug: "16-set-availability", url: "/admin/settings?tab=availability" },
  { slug: "17-set-home", url: "/admin/settings?tab=home" },
  { slug: "18-set-admin", url: "/admin/settings?tab=admin" },
  { slug: "19-set-bawaan", url: "/admin/settings" },
  { slug: "20-profile-menu", url: "/admin/profile-menu" },
  { slug: "21-announcements", url: "/admin/announcements" },
  { slug: "22-faq", url: "/admin/faq" },
  { slug: "23-terms", url: "/admin/terms" },
].filter((h) => !only || h.url === only || h.url.includes(only));

/* ---------- 1. Login, ambil cookie session ---------- */
const jar = new Map();
const supabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar.set(name, value);
      },
    },
  },
);
const { error } = await supabase.auth.signInWithPassword({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
if (error) {
  console.log("GAGAL LOGIN: " + error.message);
  process.exit(1);
}
console.log("Login admin OK, " + jar.size + " cookie siap.");

/* ---------- 2. Jalankan Chrome ---------- */
const PORT = 9800 + Math.floor(Math.random() * 300);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + path.join(process.cwd(), ".shots", ".profile-admin"),
    "--remote-debugging-port=" + PORT,
    "--window-size=" + LEBAR + "," + TINGGI,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(p, method = "GET") {
  const res = await fetch("http://127.0.0.1:" + PORT + p, { method });
  return JSON.parse(await res.text());
}

let ws;
let seq = 0;
const tunggu = new Map();
/** Pesan console/exception yang dikumpulkan per halaman. */
let jejak = [];

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

/**
 * Probe DOM yang sudah dirender. Dipisah dari Node supaya tidak perlu
 * escaping horrible saat menyalin ke `Runtime.evaluate`.
 */
const PROBE = `(() => {
  const teks = (el) => (el ? (el.textContent || '').replace(/\\s+/g, ' ').trim() : null);
  const main = document.querySelector('main');
  if (!main) return JSON.stringify({ galat: 'tidak ada <main>', body: document.body ? teks(document.body).slice(0, 200) : '' });

  const nav = document.querySelector('aside nav');
  let sidebar = { mode: 'daftar-aplikasi' };
  if (nav) {
    const anak = [...nav.children];
    const judulDiv = anak.find((k) => k.tagName === 'DIV' && !k.className.includes('space-y-1'));
    const grup = anak.filter((k) => k.className.includes('space-y-1'));
    sidebar = {
      mode: 'dalam-aplikasi',
      aplikasi: judulDiv ? teks(judulDiv.lastElementChild) : null,
      tombolKembali: anak[0] && anak[0].tagName === 'A' ? teks(anak[0]) : null,
      bagian: grup.map((g) => ({
        judul: teks(g.querySelector('p')),
        menu: [...g.querySelectorAll('a')].map((a) => ({
          teks: teks(a),
          href: a.getAttribute('href'),
          aktif: a.getAttribute('aria-current') === 'page',
        })),
      })),
    };
  }

  // Launcher: lempeng aplikasi = kartu, chip peringatan = link biasa.
  // Penandanya BUKAN kelas "card" saja — kartu juga dipakai untuk statistik di
  // /admin/dashboard. Yang membedakan: di dalam aplikasi sidebar selalu
  // memakai AppNav (ada elemen nav), sedangkan di layar awal sidebar cuma
  // daftar aplikasi tanpa nav.
  const tile = nav ? [] : [...main.querySelectorAll('a.card')];
  const launcher = tile.length
    ? {
        tanggal: teks(main.querySelector('header p')),
        salam: teks(main.querySelector('header h1')),
        chip: [...main.querySelectorAll('a')].filter((a) => !a.classList.contains('card') && !a.querySelector('h1, h2, table')).map((a) => ({ teks: teks(a).slice(0, 90), href: a.getAttribute('href') })),
        lempeng: tile.map((a) => {
          const s = [...a.querySelectorAll('span')].filter((x) => !x.querySelector('svg') && (x.textContent || '').trim());
          return { label: s[0] ? teks(s[0]) : null, detail: s[1] ? teks(s[1]) : null, href: a.getAttribute('href') };
        }),
      }
    : null;

  return JSON.stringify({
    href: location.href,
    judul: main.querySelector('h1') ? teks(main.querySelector('h1')) : null,
    subJudul: [...main.querySelectorAll('h2')].map(teks).filter(Boolean).slice(0, 6),
    deretTab: [...main.querySelectorAll('[aria-current="page"]')].map((a) => teks(a)).filter(Boolean).slice(0, 12),
    sidebar,
    launcher,
  });
})()`;

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
    } else if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
      jejak.push(m.params.type + ": " + m.params.args.map((a) => a.value || a.description || "").join(" ").slice(0, 180));
    } else if (m.method === "Runtime.exceptionThrown") {
      jejak.push("exception: " + (m.params.exceptionDetails.text || "").slice(0, 180));
    }
  });

  await kirim("Page.enable");
  await kirim("Runtime.enable");
  await kirim("Network.enable");
  await kirim("Emulation.setDeviceMetricsOverride", {
    width: LEBAR,
    height: TINGGI,
    deviceScaleFactor: 1,
    mobile: mode === "mobile",
  });

  // Cookie disuntikkan SEBELUM navigasi supaya tidak pernah kena halaman login.
  await kirim("Network.setCookies", {
    cookies: [...jar].map(([name, value]) => ({ name, value, url: APP })),
  });

  for (const h of HALAMAN) {
    jejak = [];
    const url = APP + h.url;
    await kirim("Page.navigate", { url });
    await tidur(3200);
    await kirim("Runtime.evaluate", {
      expression: "new Promise(r => requestAnimationFrame(() => setTimeout(r, 700)))",
      awaitPromise: true,
    });

    // Drawer mobile tidak ada di DOM sampai tombol menu ditekan.
    if (bukaDrawer) {
      await kirim("Runtime.evaluate", {
        expression:
          "document.querySelector('header button[aria-label]')?.click(), 'klik menu'",
        returnByValue: true,
      });
      await kirim("Runtime.evaluate", {
        expression: "new Promise(r => setTimeout(r, 800))",
        awaitPromise: true,
      });
    }

    const probe = await kirim("Runtime.evaluate", {
      expression: PROBE,
      returnByValue: true,
    });
    let data;
    try {
      data = JSON.parse(probe.result.value);
    } catch {
      data = { galat: "probe tidak bisa dibaca" };
    }

    const shot = await kirim("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    const file = path.join(OUT, mode + (bukaDrawer ? "-drawer-" : "-") + h.slug + ".png");
    fs.writeFileSync(file, Buffer.from(shot.data, "base64"));

    console.log("\n=== " + h.url + "  (" + mode + ")");
    if (data.galat) {
      console.log("  GALAT: " + data.galat + (data.body ? " | teks: " + data.body : ""));
      gagal = true;
      continue;
    }
    if (data.launcher) {
      console.log("  salam    : " + data.launcher.salam);
      console.log("  tanggal  : " + data.launcher.tanggal);
      console.log("  chip     : " + (data.launcher.chip.map((c) => c.teks).join(" | ") || "(tidak ada)"));
      console.log("  lempeng  : " + data.launcher.lempeng.map((t) => t.label).join(" | "));
      for (const t of data.launcher.lempeng) {
        console.log("      - " + t.label + "  -> " + t.href + "   [" + t.detail + "]");
      }
    } else {
      console.log("  judul    : " + data.judul);
      console.log("  sidebar  : " + (data.sidebar.aplikasi ?? "(tidak ada - mode: " + data.sidebar.mode + ")"));
      console.log("  kembali  : " + (data.sidebar.tombolKembali ?? "-"));
      for (const b of data.sidebar.bagian ?? []) {
        console.log("      [" + b.judul + "]");
        for (const m of b.menu) {
          console.log("        " + (m.aktif ? "> " : "  ") + m.teks + "  -> " + m.href);
        }
      }
    }
    if (data.deretTab?.length) console.log("  aktif    : " + data.deretTab.join(" | "));
    console.log("  url      : " + data.href);
    if (jejak.length) {
      console.log("  PERINGATAN KONSOL:");
      for (const j of jejak.slice(0, 6)) console.log("      " + j);
    }
    console.log("  foto     : " + file);
  }
} catch (e) {
  console.log("GAGAL: " + (e.message || e));
  gagal = true;
} finally {
  try { ws?.close(); } catch {}
  chrome.kill();
  try {
    execFileSync("taskkill", ["/PID", String(chrome.pid), "/F", "/T"], { stdio: "ignore" });
  } catch {}
}
process.exit(gagal ? 1 : 0);