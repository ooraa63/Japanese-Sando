/* eslint-disable */
/**
 * Uji: harga bundle di batch SELALU ikut harga menu utama.
 *
 * Skenario (batch 12 = "1", aktif di 2026-10-14):
 *   1. Simpan bundle #1 dipakai untuk batch 12 dengan price NULL
 *      (payload baru dari savePoBatchBundlesAction).
 *   2. Cek public_po_batch_for_date -> harga paket harus 35000 (harga utama),
 *      bukan angka lain.
 *   3. Semua data uji dibersihkan di akhir.
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
const BATCHES = [2, 12];
const BUNDLE = 1;

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`  ${ok ? "OK   " : "GAGAL"} ${name}${extra ? " " + extra : ""}`);
  if (ok) pass++;
  else fail++;
};

async function rpc(name, args, token) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const loginRes = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }),
});
if (!loginRes.ok) {
  console.error("login admin gagal:", loginRes.status, await loginRes.text());
  process.exit(1);
}
const token = (await loginRes.json()).access_token;

console.log(`Uji harga bundle ikut menu utama (batch ${BATCHES.join(", ")})`);

// Harga utama bundle dari menu publik.
const menu = await rpc("public_menu");
const menuBundle = (menu.json.bundles ?? []).find((b) => b.id === BUNDLE);
const hargaUtama = menuBundle?.price;
check("harga utama bundle terbaca dari public_menu", typeof hargaUtama === "number", String(hargaUtama));

// 1. Simpan dengan price null (payload baru) di SEMUA batch aktif, karena
// `public_po_batch_for_date` memilih batch dengan sisa stok terkecil (bisa
// batch mana saja, bukan yang kita_target) — lihat MEMORY/gotchas.
let simpanOK = true;
for (const b of BATCHES) {
  const simpan = await rpc(
    "admin_save_po_batch_bundles",
    { p_batch_id: b, p_bundles: [{ bundle_id: BUNDLE, price: null, is_active: true }] },
    token
  );
  const ok = simpan.status === 200 || simpan.status === 201;
  if (!ok) simpanOK = false;
  check(`simpan bundle dipakai di batch ${b} (price null)`, ok, String(simpan.status));
}

// 2. Harga yang dilihat pembeli.
const publik = await rpc("public_po_batch_for_date", { p_pickup_date: "2026-10-14" });
const batchPublik = Array.isArray(publik.json) ? publik.json[0] : publik.json;
const paket = (batchPublik?.bundles ?? []).find((b) => (b.bundle_id ?? b.id) === BUNDLE);
check(
  `bundle muncul untuk pembeli (batch terpilih ${batchPublik?.batch_id})`,
  Boolean(paket),
  paket ? `harga=${paket.price}` : JSON.stringify(publik.json).slice(0, 300)
);
if (paket) {
  check("hanya ada 1 bundle untuk pembeli", (batchPublik.bundles ?? []).length === 1, `jumlah=${batchPublik.bundles.length}`);
  check(
    `harga paket = harga utama (${hargaUtama})`,
    Number(paket.price) === Number(hargaUtama),
    `dapat=${paket.price}`
  );
}

// 3. Cek kolom price di DB benar-benar null untuk setiap batch.
let dipakaiOK = true;
let nullOK = true;
for (const b of BATCHES) {
  const cek = await rpc("admin_list_po_batch_detail", { p_batch_id: b }, token);
  const detail = cek.json?.batch ? cek.json : (cek.json?.[0] ?? cek.json);
  const barisBundle = (detail?.bundles ?? []).find((x) => x.bundle_id === BUNDLE);
  if (barisBundle?.dipakai !== true) dipakaiOK = false;
  if (barisBundle?.harga_batch != null) nullOK = false;
  check(
    `batch ${b}: dipakai=${barisBundle?.dipakai} harga_batch=${barisBundle?.harga_batch}`,
    barisBundle?.dipakai === true && barisBundle?.harga_batch == null
  );
}

// Bersihkan semua batch uji.
let bersihOK = true;
for (const b of BATCHES) {
  const bersih = await rpc("admin_save_po_batch_bundles", { p_batch_id: b, p_bundles: [] }, token);
  const ok = bersih.status === 200 || bersih.status === 201;
  if (!ok) bersihOK = false;
  check(`data uji batch ${b} dibersihkan`, ok, String(bersih.status));
}
void dipakaiOK;
void nullOK;
void simpanOK;

console.log(`\nRingkasan: ${pass} OK, ${fail} GAGAL`);
process.exit(fail === 0 ? 0 : 1);