/* eslint-disable */
/**
 * Cek + perbarui `profile_menu_items.href` ke URL baru di bawah /profile-menu.
 *
 * Steven 14-10-2026: halaman info pindah. `href` di bar Menu Profil adalah
 * satu-satunya cara pembeli sampai ke halaman-halaman itu (dari ProfileSheet /
 * MobileBottomNav), jadi kalau tidak di-update bar tersebut jadi buntu.
 *
 * Dipakai dua kali: tanpa argumen = hanya cek, dengan `--apply` = tulis.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}
loadEnv();

const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const APPLY = process.argv.includes("--apply");

async function login() {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`login gagal: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const token = await login();

const PATCH = {
  contact: "/profile-menu/contact",
  faq: "/profile-menu/faq",
  hours: "/profile-menu/jam-buka",
  terms: "/profile-menu/syarat-ketentuan",
};

const sel = await fetch(
  `${BASE}/rest/v1/profile_menu_items?select=id,code,href,is_active`,
  { headers: { apikey: KEY, Authorization: `Bearer ${token}` } }
);
const rows = await sel.json();
if (!Array.isArray(rows)) {
  console.error("gagal baca:", JSON.stringify(rows));
  process.exit(1);
}

console.log(`baris profile_menu_items: ${rows.length}`);
for (const r of rows) {
  const target = PATCH[r.code];
  const tanda = target ? (r.href === target ? "OK" : "PERLU DIUBAH") : "-";
  console.log(
    `  ${tanda.padEnd(14)} code=${String(r.code).padEnd(10)} aktif=${r.is_active} href=${r.href ?? "(null)"}`
  );
  if (target && r.href !== target && APPLY) {
    const up = await fetch(`${BASE}/rest/v1/profile_menu_items?id=eq.${r.id}`, {
      method: "PATCH",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ href: target }),
    });
    console.log(`     -> ditulis: ${up.status} ${target}`);
  }
}
if (!APPLY) console.log("\n(jalankan ulang dengan --apply untuk menulis)");
process.exit(0);