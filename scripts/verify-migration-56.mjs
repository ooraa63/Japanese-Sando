// Verifikasi statis supabase/migration-56.sql (tidak menyentuh database).
import fs from "node:fs";

const s = fs.readFileSync("supabase/migration-56.sql", "utf8");
const lines = s.split(/\r?\n/);

const checks = [
  ["signature create_order ada", /^CREATE OR REPLACE FUNCTION public\.create_order\($/m.test(s)],
  ["20 parameter dideklarasikan", (s.match(/^ {4}p_[a-z_]+ .*DEFAULT/mg) || []).length === 20],
  ["guard no_active_batch ada", s.includes("raise exception 'no_active_batch'")],
  // Hanya yang berbentuk PERINTAH yangmage forbidden. Teks "v_batch := null"
  // boleh muncul di komentar header (itu dokumentasi perilaku lama).
  ["perintah v_batch := null hilang", !/^\s*v_batch := null;\s*$/m.test(s)],
  ["validasi batch lama masih utuh", s.includes("raise exception 'batch_not_found'") && s.includes("raise exception 'batch_closed'") && s.includes("raise exception 'batch_pickup_mismatch'")],
  ["validasi bundle tetap utuh", s.includes("invalid_bundle_fixed") || s.includes("bundle_flavors")],
  ["potong stok categories.stock masih ada di kode (tak tersentuh)", s.includes("update public.categories")],
  ["potong stok po_batch_stock masih ada", s.includes("update public.po_batch_stock")],
  ["grant ke anon/authenticated/service_role", /grant execute on function public\.create_order\(text,text,text,text,text,text,text,text,text,double precision,double precision,text,text,text,text,jsonb,jsonb,uuid,bigint,date\) to anon, authenticated, service_role;/.test(s)],
  ["tidak ada '))' di grant/comment", !/create_order\([^)]*\)\)/.test(s)],
  ["$function$ pembuka & penutup seimbang", (s.match(/\$function\$/g) || []).length === 2],
  ["hanya 1 blok AS $function$ (tidak ada fungsi lain)", (s.match(/^AS \$function\$/gm) || []).length === 1],
  ["tidak ada karakter CJK", !/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(s)],
];

let fail = 0;
for (const [name, ok] of checks) {
  if (!ok) fail++;
  console.log((ok ? "OK   " : "GAGAL") + "  " + name);
}

// Blok validasi batch versi final.
const j = lines.findIndex((l) => l.includes("Migration-49: validasi batch PO"));
console.log("\n=== blok validasi batch (versi final) ===");
lines.slice(j + 14, j + 34).forEach((l, i) => console.log("  " + (j + 15 + i) + ": " + l));

console.log("\n" + (fail === 0 ? "SEMUA CEK LULUS" : fail + " CEK GAGAL"));
process.exit(fail === 0 ? 0 : 1);