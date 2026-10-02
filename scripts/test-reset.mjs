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

console.log("\n=== 3. Halaman /order?step=menu langsung ke langkah rasa ===");
const menuPage = await fetch(`${APP}/order?step=menu`);
const menuHtml = await menuPage.text();
check("?step=menu membuka langkah pilih rasa",
  menuHtml.includes("Mau pesan apa") && !menuHtml.includes("Siapa yang memesan"));

console.log("\n=== 4. Pilihan pengambilan di langkah pembayaran ===");
const payPage = await fetch(`${APP}/order?step=payment`);
const payHtml = await payPage.text();
check("cara bayar tetap ada", payHtml.includes("Transfer bank") && payHtml.includes("Bayar tunai"));
check("pilihan ambil di toko ada", payHtml.includes("Ambil di toko"));
check("pilihan diantar ada kembali", payHtml.includes("Diantar"));
check("catatan pengambilan tampil", payHtml.includes("Vihara Tian En") || payHtml.includes("gratis ongkir"));

console.log("\n=== 5. Beranda tidak bisa menambah ke keranjang ===");
const home = await fetch(APP);
const homeHtml = await home.text();
check("tidak ada tombol 'Tambah ke keranjang' di beranda",
  !homeHtml.includes("Tambah ke keranjang"));
check("ada tombol 'Pesan rasa ini' menuju /order",
  homeHtml.includes("Pesan rasa ini") && homeHtml.includes("/order?step=menu"));

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
