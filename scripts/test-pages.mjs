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
await openPage("/admin/menu", { mustContain: ["Menu", "Stok", "jenis makanan"] });
// Pengaturan sudah jadi TAB (lihat SettingsClient): HTML yang dikirim server
// hanya berisi tab yang aktif, default-nya "identity". Label Kontak & Rekening
// baru muncul setelah admin mengklik tabnya, jadi jangan di sini.
await openPage("/admin/settings", { mustContain: ["Pengaturan", "Identitas toko"] });
await openPage("/admin/sales", { mustContain: ["Mutasi", "Pendapatan", "Rasa terlaris"] });
// Fitur Voucher DIHAPUS (permintaan Steven, 11-10-2026): route, komponen, dan
// action-nya dihapus; tabel & RPC di database sengaja dibiarkan supaya kalau
// Steven berubah pikiran tinggal dinyalakan lagi tanpa kehilangan data.
// Ujinya dibalik: bukan "halaman ini ada", tapi "halaman ini benar-benar 404".
{
  // WAJIB pakai cookie admin: tanpa itu semua `/admin/*` diarahkan ke login
  // oleh proxy, jadi kita hanya menguji middleware -- bukan route-nya.
  await openPage("/admin/vouchers", { expectStatus: 404 });
  const orders = await fetch(`${APP}/admin/orders`, {
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  const ordersText = await orders.text();
  check(
    "menu admin tidak punya tautan Voucher",
    !ordersText.includes('href="/admin/vouchers"')
  );
}
await openPage("/admin/customers", { mustContain: ["Pelanggan", "WhatsApp"] });
// Menu "Ambil & Kirim" (item 10 dokumen perbaikan): dua tab "Ambil di Toko"
// dan "Pengiriman", tab pertama terbuka secara default.
// Catatan: jangan cek judul lengkap — tanda "&" di HTML ter-escape jadi
// "&amp;", jadi yang dicek hanya bagian tanpa "&".
await openPage("/admin/pickup-delivery", {
  mustContain: ["Catatan Pengambilan", "Ambil di Toko", "Pengantaran"],
});
// Menu Profil (migration-41): bar menu sheet Profil di aplikasi pembeli.
await openPage("/admin/profile-menu", {
  mustContain: ["Menu Profil", "Tambah bar menu"],
});
// Menu FAQ (migration-46): isi /faq + section FAQ di /contact pindah dari kode
// ke tabel `faq_items`, jadi sekarang bisa disunting dari dashboard.
await openPage("/admin/faq", {
  mustContain: ["FAQ", "Tambah pertanyaan"],
});

console.log("\n=== 4. Halaman publik tetap terbuka ===");
// Nama merek = "Rumakomugi" (dari store_settings.store_name).
await openPage("/", { mustContain: ["Rumakomugi", "Pesan Sekarang"] });
// Section "Favorite" dipindah jadi baris sendiri DI BAWAH "Paket Hemat"
// (permintaan Steven 12-10-2026), dan badge bintang "Favorite" DIHAPUS dari
// kartu produk. Cek keduanya: baris baru harus muncul, dan kata "Favorite"
// tidak boleh lagi muncul sebagai badge per kartu.
{
  const home = await openPage("/", { mustContain: ["Rumakomugi"] });
  if (home.status === 200) {
    check("  beranda punya section Favorite", /Favorite/i.test(home.text));
    // 1 = hanya judul section. Kalau produk yang ditandai bintang masih
    // memakai badge, setiap kartu menambah satu kemunculan lagi.
    const n = (home.text.match(/Favorite/g) || []).length;
    check("  badge Favorite tidak lagi menempel di kartu", n <= 1, `(kemunculan=${n})`);
    check("  ada section Paket Hemat di beranda", /Paket Hemat/i.test(home.text));
  }
}
await openPage("/order", { mustContain: ["Pre-order", "Siapa yang memesan"] });
await openPage("/track", { mustContain: ["Cek Status Pesanan"] });
// Halaman FAQ (item 5, 12-10-2026) + halaman riwayat lokal (item 3).
// /faq harus menampilkan isi dari database: pertanyaan seed pertama.
await openPage("/faq", {
  mustContain: ["FAQ", "Bagaimana cara memesan?"],
});
await openPage("/riwayat", { mustContain: ["Riwayat Pesanan"] });
// /contact juga memuat FAQ yang sama (sumbernya satu tabel).
await openPage("/contact", {
  mustContain: ["Hubungi", "Bagaimana cara memesan?"],
});

console.log("\n=== 5. Admin tidak bisa melihat halaman pengaturan tanpa login ===");
const anon = await fetch(`${APP}/admin/settings`, { redirect: "manual" });
check("/admin/settings tanpa login -> diarahkan ke login",
  anon.status === 307 && (anon.headers.get("location") ?? "").includes("/admin/login"),
  `status=${anon.status} loc=${anon.headers.get("location")}`);

console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(46)}\n`);
process.exit(fail > 0 ? 1 : 0);
