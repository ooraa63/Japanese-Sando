/**
 * Cek cepat: apakah validasi batch PO & logika bundle lain masih ada di
 * create_order yang sekarang hidup, setelah migration-55 override.
 *
 *   node scripts/check-create-order-live.js
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

const WAJIB_ADA = [
  ["po_batch_flavors (sembunyikan rasa per batch)", /po_batch_flavors/],
  ["bundle_flavors (pembatasan rasa per bundle)", /bundle_flavors/],
  ["is_fixed (mode combo)", /is_fixed/],
  ["pengecekan jumlah slot", /jsonb_array_length\(v_slots\)\s*<>\s*v_required_qty/],
  ["potong stok kategori", /update public\.categories set stock/],
  ["qris_midtrans", /qris_midtrans/],
  ["insufficient_stock", /insufficient_stock/],
  ["return order_code", /jsonb_build_object\('order_code'/],
];

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(
    "select pg_get_functiondef('public." +
      "create_order(text,text,text,text,text,text,text,text,text,double precision," +
      "double precision,text,text,text,text,jsonb,jsonb,uuid,bigint,date)'::regprocedure) as def"
  );
  const def = rows[0] ? rows[0].def : "";
  if (!def) {
    console.error("GAGAL: definisi create_order tidak ditemukan");
    process.exit(1);
  }

  let gagal = 0;
  for (const [label, re] of WAJIB_ADA) {
    const ada = re.test(def);
    if (!ada) gagal++;
    console.log((ada ? "  OK    " : "  HILANG ") + label);
  }

  console.log("");
  console.log(gagal === 0 ? "Semua logika penting masih ada." : gagal + " logika hilang!");
  if (gagal > 0) process.exitCode = 1;

  await c.end();
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});