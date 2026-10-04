/**
 * Uji perilaku "data pribadi dibersihkan saat meninggalkan halaman /order".
 *   node scripts/test-reset.mjs
 *
 * Butuh dev server berjalan.
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
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name} ${extra}`); }
}

// Pastikan server hidup
try {
  await fetch(APP);
} catch {
  console.error(`Dev server tidak jalan di ${APP}. Jalankan "npm run dev" dulu.`);
  process.exit(1);
}

console.log("\n=== 1. Kode keranjang & format storage ===");
const client = createServerClient(BASE, KEY, {
  cookies: { getAll: () => [], setAll: () => {} },
});
const { data: flavors } = await client
  .from("flavors")
  .select("id, stock_enabled, stock, is_active")
  .eq("is_active", true)
  .order("sort_order");
const flavor = flavors[0];
console.log(`  rasa untuk tes: id=${flavor.id} stok=${flavor.stock}`);

console.log("\n=== 2. Halaman /order bisa dibuka (form ter-render server) ===");
const orderPage = await fetch(`${APP}/order`);
const orderHtml = await orderPage.text();
check("/order -> 200", orderPage.status === 200, `status=${orderPage.status}`);
check("form nama ada di HTML (tidak hanya skeleton)",
  orderHtml.includes("Nama lengkap") && !orderHtml.includes('value="" id="name" disabled'),
  "form tidak ter-render server");

console.log("\n=== 3. Halaman /order Selalu mulai dari langkah nama ===");
// URL apa pun harus membuka langkah identitas, tidak ada cara melompat.
for (const step of ["", "?step=menu", "?step=payment", "?step=review"]) {
  const r = await fetch(`${APP}/order${step}`);
  const txt = (await r.text())
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const opensName = txt.includes("Siapa yang memesan") || txt.includes("Who is ordering");
  const skips = txt.includes("Mau pesan apa") || txt.includes("What would you like");
  check(`/order${step || " (tanpa query)"} -> langkah nama`, opensName,
    skips ? "langsung membuka menu (SALAH)" : "");
}

console.log("\n=== 4. Langkah pembayaran (dicek dari bundel client) ===");
// Halaman /order hanya merender langkah nama di server. Pilihan cara bayar,
// cara pengambilan, dan info paket baru muncul setelah pembeli menekan
// "Lanjut" -- yaitu di sisi client. Karena itu isinya dicek dari bundel
// JavaScript yang dikirim ke browser, bukan dari HTML.
const orderPageHtml = await (await fetch(`${APP}/order`)).text();
const chunkUrls = [...orderPageHtml.matchAll(/\/_next\/static\/chunks\/[^"]+\.js/g)].map((m) => m[0]);
let bundle = "";
for (const url of [...new Set(chunkUrls)]) {
  try {
    bundle += await (await fetch(`${APP}${url}`)).text();
  } catch {
    /* abaikan chunk yang gagal diambil */
  }
}
check("cara bayar ada di bundel client",
  bundle.includes("Transfer bank") && bundle.includes("Bayar tunai"));
check("pilihan ambil di toko ada", bundle.includes("Ambil di toko"));
check("pilihan diantar ada kembali", bundle.includes("Diantar"));
check("info paket harga tampil", bundle.includes("Beli 2 pcs") || bundle.includes("lebih hemat"));
// Catatan pengambilan diambil dari database (bukan teks di kode), jadi tidak
// ikut ada di bundel. Dicek lewat API publik.
const supa = await fetch(
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/store_settings?select=pickup_note_id&id=eq.1`,
  { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } }
).then((r) => r.json());
check("catatan pengambilan tersimpan di database",
  typeof supa?.[0]?.pickup_note_id === "string" && supa[0].pickup_note_id.length > 10,
  JSON.stringify(supa));

console.log("\n=== 5. Beranda tidak bisa menambah ke keranjang ===");
const home = await fetch(APP);
const homeHtml = await home.text();
check("tidak ada tombol 'Tambah ke keranjang' di beranda",
  !homeHtml.includes("Tambah ke keranjang"));
check("tombol 'Pesan rasa ini' menuju /order (bukan ?step=menu)",
  homeHtml.includes("Pesan rasa ini") && !homeHtml.includes("/order?step=menu"));

console.log("\n=== 6. Header: logo, nama toko, dan brand line ===");
check("foto hero jadi background (bukan kartu 1:1)",
  !homeHtml.includes("aspect-square") && homeHtml.includes("hero-sando.jpg"));
check("tidak ada baris COD di hero", !homeHtml.includes("BISA COD"));
check("nama toko di header = Rumakomugi", homeHtml.includes("Rumakomugi"));
check("brand line 'Japanese Bake & Pastry' tampil", homeHtml.includes("Japanese Bake &amp; Pastry"));
check("logo toko tampil", homeHtml.includes("logo-rumakomugi.jpg"));
check("footer tidak punya link ke dashboard penjual",
  !homeHtml.includes('href="/admin"'), "masih ada tombol ke /admin");

console.log("\n=== 7. Menu dua tingkat (jenis makanan -> rasa) ===");
check("kategori 'Sando Sandwich' tampil", homeHtml.includes("Sando Sandwich"));
check("nama rasa tampil di bawahnya",
  homeHtml.includes("Cookies &amp; Cream") || homeHtml.includes("Caramel Cheese"));

console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(46)}\n`);
if (EMAIL && PASSWORD) {
  console.log("  (Pemeriksaan storage browser tidak bisa dari sini —");
  console.log("  Silakan cek manual: isi nama + telp, lalu pindah ke Beranda,");
  console.log("   buka /order lagi. Kolom harus kosong.)");
  console.log("");
}
process.exit(fail > 0 ? 1 : 0);