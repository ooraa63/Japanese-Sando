/**
 * Uji end-to-end: login sungguhan lalu buka halaman dashboard admin
 * dengan session cookie seperti yang dilakukan browser.
 *
 *   node scripts/test-pages.mjs
 *
 * Butuh dev server berjalan (npm run dev).
 */
import { createServerClient } from "@supabase/ssr";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = path.resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const APP = process.env.APP_URL || "http://localhost:3000";

if (!EMAIL || !PASSWORD) {
  console.error("Set ADMIN_EMAIL dan ADMIN_PASSWORD lebih dulu.");
  process.exit(1);
}

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name} ${extra}`); }
}

// Kumpulkan cookie session persis seperti @supabase/ssr di browser.
const jar = new Map();
const supabase = createServerClient(BASE, KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => {
      for (const { name, value } of list) jar.set(name, value);
    },
  },
});

console.log("\n=== 1. Login ===");
const { data, error } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});
check("login berhasil", !error && Boolean(data?.session), error?.message ?? "");
if (error) process.exit(1);
console.log(`  cookie session: ${[...jar.keys()].join(", ")}`);

async function openPage(url, { expectStatus = 200, mustContain = [], mustNotContain = [] } = {}) {
  const res = await fetch(`${APP}${url}`, {
    redirect: "manual",
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  const text = res.status === 200 || res.status === 307 ? await res.text() : "";
  const missing = mustContain.filter((s) => !text.includes(s));
  const present = mustNotContain.filter((s) => text.includes(s));
  check(
    `${url} -> ${res.status}`,
    res.status === expectStatus && missing.length === 0 && present.length === 0,
    `${missing.length ? `tidak ada: ${missing.join(", ")} ` : ""}${present.length ? `takutnya muncul: ${present.join(", ")}` : ""}`
  );
  return { status: res.status, text };
}

console.log("\n=== 2. Halaman dashboard (butuh login) ===");
const dash = await openPage("/admin", {
  mustContain: ["Pendapatan", "Menunggu", "Pesanan terbaru", EMAIL],
});
if (dash.status === 200) {
  check("  menu sidebar tampil",
    dash.text.includes("Menu &amp; Stok") || dash.text.includes("Menu & Stok"));
  check("  tombol keluar tampil", dash.text.includes("Keluar"));
}

console.log("\n=== 3. Halaman lain di dashboard ===");
await openPage("/admin/orders", { mustContain: ["Pesanan", "Semua"] });
await openPage("/admin/menu", { mustContain: ["Menu", "Stok", "Tambah rasa"] });
await openPage("/admin/settings", { mustContain: ["Pengaturan", "Nomor WhatsApp", "Rekening"] });

console.log("\n=== 4. Halaman publik tetap terbuka ===");
await openPage("/", { mustContain: ["Japanese Sando", "Pesan Sekarang"] });
await openPage("/order", { mustContain: ["Pre-order", "Siapa yang memesan"] });
await openPage("/track", { mustContain: ["Cek Status Pesanan"] });

console.log("\n=== 5. Admin tidak bisa melihat halaman pengaturan tanpa login ===");
const anon = await fetch(`${APP}/admin/settings`, { redirect: "manual" });
check("/admin/settings tanpa login -> diarahkan ke login",
  anon.status === 307 && (anon.headers.get("location") ?? "").includes("/admin/login"),
  `status=${anon.status} loc=${anon.headers.get("location")}`);

console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(46)}\n`);
process.exit(fail > 0 ? 1 : 0);
