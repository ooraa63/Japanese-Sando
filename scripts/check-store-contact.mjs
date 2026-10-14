/* eslint-disable */
/**
 * Cek cepat isi kontak toko di `store_settings`.
 * Dipakai setelah menambah tombol WhatsApp mengambang, supaya tahu nomornya
 * sudah diisi atau masih placeholder.
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

const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;

const res = await fetch(
  `${BASE}/rest/v1/store_settings?select=store_name,whatsapp,instagram,maps_url,hours_id`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
);
const rows = await res.json();
console.log(JSON.stringify(rows, null, 2));

const wa = Array.isArray(rows) ? (rows[0]?.whatsapp ?? "") : "";
// 621234567890 = contoh angka dari placeholder bawaan migration.
const placeholder = /^62123456789\d$/.test(wa.replace(/\D/g, ""));
console.log("\nnomor whatsapp:", wa || "(kosong)");
console.log(placeholder ? "PERINGATAN: masih placeholder" : "OK: nomor asli");
process.exit(0);