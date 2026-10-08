/**
 * Diagnostic: login sebagai admin lalu periksa string apa yang benar-benar
 * muncul di halaman dashboard. Dipakai kalau test-pages.mjs gagal dan kita
 * perlu tahu apakah aplikasinya salah atau ekspektasi test yang sudah basi.
 *
 *   APP_URL=http://localhost:3099 node scripts/inspect-admin-pages.mjs
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
const APP = process.env.APP_URL || "http://localhost:3000";

const jar = new Map();
const supabase = createServerClient(BASE, KEY, {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (list) => { for (const { name, value } of list) jar.set(name, value); },
  },
});

const { error } = await supabase.auth.signInWithPassword({
  email: process.env.ADMIN_EMAIL,
  password: process.env.ADMIN_PASSWORD,
});
if (error) {
  console.error("Login gagal:", error.message);
  process.exit(1);
}

const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");

const pages = [
  { url: "/", probes: ["Rumakomugi", "Japanese Sando", "Pesan Sekarang", "Pilih rasa"] },
  {
    url: "/admin/settings",
    probes: [
      "Nomor WhatsApp", "WhatsApp", "Rekening", "Rekening bank",
      "bankAccounts", "Nomor telepon", "Pengaturan",
    ],
  },
  { url: "/admin/sales", probes: ["Mutasi", "Pendapatan", "Paling laris"] },
  { url: "/admin/vouchers", probes: ["Voucher", "Kode", "Diskon"] },
  { url: "/admin/customers", probes: ["Pelanggan", "WhatsApp", "Pesanan"] },
];

for (const { url, probes } of pages) {
  const res = await fetch(`${APP}${url}`, { redirect: "manual", headers: { cookie } });
  const html = res.status === 200 ? await res.text() : "";
  console.log(`\n### ${url} -> ${res.status}`);
  for (const probe of probes) {
    console.log(`   ${html.includes(probe) ? "ADA  " : "TIDAK"}  "${probe}"`);
  }
  // Tampilkan judul section yang benar-benar ada, biar gampangcomparedmanual.
  if (url === "/admin/settings" && res.status === 200) {
    const headings = [...html.matchAll(/>([^<>]{4,60})<\/h[23]>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    console.log("   heading yang dirender:", JSON.stringify([...new Set(headings)].slice(0, 25)));
  }
}