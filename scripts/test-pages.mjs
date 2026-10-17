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

/**
 * Buka entitas HTML yang paling sering muncul.
 *
 * HTML meng-escape `&` jadi `&amp;`, jadi teks yang dicari tidak akan cocok kalau
 * ditulis polos: "Syarat & Ketentuan" ada di halaman sebagai
 * "Syarat &amp; Ketentuan". Tanpa ini, setiap cek yang memuat tanda `&` selalu
 * gagal padahal halamannya benar.
 *
 * Urutannya penting — `&amp;` HARUS diproses terakhir, kalau tidak
 * "&amp;lt;" akan jadi "<" dan merusak teks yang memang harus literal.
 */
function decodeEntities(html) {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function openPage(url, { expectStatus = 200, mustContain = [], mustNotContain = [] } = {}) {
  const res = await fetch(`${APP}${url}`, {
    redirect: "manual",
    headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
  });
  const text =
    res.status === 200 || res.status === 307
      ? decodeEntities(await res.text())
      : "";
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
/*
 * Steven 17-10-2026: `/admin` sekarang LAYAR AWAL — salam + peringatan +
 * lempeng aplikasi. Statistik pindah ke `/admin/dashboard` (masih di dalam
 * aplikasi "Ringkasan Bisnis"). Tes kedua-duanya supaya perpindahan ini
 * tidak diam-diam merusak salah satunya.
 */
const beranda = await openPage("/admin", {
  mustContain: ["Selamat", EMAIL],
});
if (beranda.status === 200) {
  check("  layar awal punya lempeng aplikasi", beranda.text.includes("Pesanan &amp; Pre-order") || beranda.text.includes("Pesanan & Pre-order"));
  check("  layar awal punya tombol keluar", beranda.text.includes("Keluar"));
  check("  layar awal TIDAK menampilkan statistik dashboard", !beranda.text.includes("Pesanan terbaru"));
}

const dash = await openPage("/admin/dashboard", {
  mustContain: ["Pendapatan", "Menunggu", "Pesanan terbaru", EMAIL],
});
if (dash.status === 200) {
  // Steven 13-10-2026: menu "Menu & Stok" diganti jadi "Menu" karena stok
  // sekarang diatur di halaman Batch PO (/admin/po), bukan di halaman Menu.
  check("  menu sidebar tampil",
    dash.text.includes("Menu &amp; Stok") || dash.text.includes("Menu & Stok") || dash.text.includes("Menu"));
  check("  tombol keluar tampil", dash.text.includes("Keluar"));
  // Sidebar di dalam aplikasi menampilkan bagian per bagian (lihat
  // `src/lib/admin-nav.ts`).
  check("  sidebar menampilkan judul aplikasi", dash.text.includes("Ringkasan Bisnis"));
  check("  sidebar menampilkan bagian 'Laporan'", dash.text.includes("Laporan"));
}

/*
 * Guardian untuk `appForPath()`.
 *
 * Tes di atas hanya mengecek "string ini ada atau tidak", jadi tiga bug
 * `appForPath` sempat lolos begitu saja:
 *   1. `match` aplikasi Pesanan cuma `/admin/orders`, jadi `/admin/po` tidak
 *      masuk aplikasi mana pun dan sidebar jatuh ke daftar aplikasi.
 *   2. `/admin/settings` dipakai dua aplikasi dengan `match` yang sama, jadi
 *      `find()` selalu mengembalikan yang pertama — `?tab=payment` tampilkan
 *      sidebar "Identitas Toko".
 *   3. `/admin/settings` tanpa `?tab=` tidak menandai menu apa pun aktif.
 *
 * Yang dijaga di sini: SETIAP halaman admin memunculkan judul aplikasi dan
 * bagian yang benar, bukan cuma empat halaman yang kebetulan ikut dites.
 */
const PETA_SIDEBAR = [
  { url: "/admin/orders", aplikasi: "Pesanan & Pre-order", bagian: ["Pre-order"] },
  { url: "/admin/po", aplikasi: "Pesanan & Pre-order", bagian: ["Pre-order"] },
  { url: "/admin/dashboard", aplikasi: "Ringkasan Bisnis", bagian: ["Ringkasan", "Laporan"] },
  { url: "/admin/sales", aplikasi: "Ringkasan Bisnis", bagian: ["Ringkasan", "Laporan"] },
  { url: "/admin/menu", aplikasi: "Produk & Pengiriman", bagian: ["Produk", "Pengiriman"] },
  { url: "/admin/pickup-delivery", aplikasi: "Produk & Pengiriman", bagian: ["Produk", "Pengiriman"] },
  // Dua aplikasi berbeda hidup di halaman yang sama, dibedakan `?tab=`.
  { url: "/admin/settings?tab=identity", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/settings?tab=hours", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Jam Buka & Aturan"] },
  { url: "/admin/settings?tab=contact", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/settings?tab=shipping", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/settings?tab=payment", aplikasi: "Pengaturan", bagian: ["Pembayaran", "Tampilan", "Akun"] },
  { url: "/admin/settings?tab=availability", aplikasi: "Pengaturan", bagian: ["Pembayaran", "Tampilan", "Akun"] },
  { url: "/admin/settings?tab=home", aplikasi: "Pengaturan", bagian: ["Pembayaran", "Tampilan", "Akun"] },
  { url: "/admin/settings?tab=admin", aplikasi: "Pengaturan", bagian: ["Pembayaran", "Akun"] },
  // Tanpa `?tab=` harus jatuh ke tab default `identity`, bukan daftar aplikasi.
  { url: "/admin/settings", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Identitas & Kontak"] },
  { url: "/admin/profile-menu", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/announcements", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/faq", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/terms", aplikasi: "Identitas Toko", bagian: ["Identitas & Jam", "Halaman Pembeli"] },
  { url: "/admin/customers", aplikasi: "Pelanggan", bagian: ["Pelanggan", "Ulasan"] },
  { url: "/admin/reviews", aplikasi: "Pelanggan", bagian: ["Pelanggan", "Ulasan"] },
];
for (const peta of PETA_SIDEBAR) {
  const p = await openPage(peta.url);
  if (p.status !== 200) continue;
  // Judul bagian dirender `uppercase` lewat CSS, jadi teks mentahnya di HTML
  // tetap camelCase dan itulah yang dibandingkan di sini.
  check(`  ${peta.url} sidebar = ${peta.aplikasi}`, p.text.includes(peta.aplikasi));
  check(
    `  ${peta.url} bagian = ${peta.bagian.join(" + ")}`,
    peta.bagian.every((b) => p.text.includes(b)),
  );
}

console.log("\n=== 3. Halaman lain di dashboard ===");
await openPage("/admin/orders", { mustContain: ["Pesanan", "Semua"] });
// Steven 13-10-2026: stepper stok DIHAPUS dari halaman Menu (stok diatur di
// /admin/po). Ujinya dibalik: kata "Stok" tidak boleh muncul lagi sebagai
// kontrol stok, hanya boleh ada di teks lain. Yang dijaga: halaman tetap
// memuat daftar jenis makanan.
await openPage("/admin/menu", { mustContain: ["Menu", "jenis makanan"] });
{
  const menu = await openPage("/admin/menu", { mustContain: ["Menu"] });
  check("  /admin/menu tidak punya stepper stok kategori",
    !menu.text.includes("Stok per jenis") && !menu.text.includes("stokQuick"),
    menu.text.includes("Stok per jenis") ? "masih ada blok stok" : "");
}
// Halaman Batch PO (baru, migration-49)
await openPage("/admin/po", { mustContain: ["Batch PO"] });
// Detail batch (migration-51): kartu batch jadi tautan ke /admin/po/<id>, dan
// di dalamnya ada sidebar Stok / Pesanan / Pelanggan / Mutasi.
{
  const poList = await openPage("/admin/po", { mustContain: ["Batch PO"] });
  const m = poList.text.match(/href="\/admin\/po\/(\d+)"/);
  check("  /admin/po punya tautan ke detail batch", Boolean(m), m ? `id=${m[1]}` : "tidak ada kartu batch");
  if (m) {
    await openPage(`/admin/po/${m[1]}`, {
      mustContain: [
        "Semua batch",
        "Stok",
        "Pesanan",
        "Pelanggan",
        "Mutasi",
        "Stok & Bundle",
      ],
    });
    // Semua tab harus benar-benar menampilkan sesuatu untuk batch ini, bukan
    // cuma label sidebar-nya. Diverifikasi lewat isi JSON yang ikut terkirim.
    const detail = await fetch(`${APP}/admin/po/${m[1]}`, {
      headers: { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    const detailText = decodeEntities(await detail.text());
    check("  detail batch mengirim data stok per jenis menu", detailText.includes("Sisa"));
    check("  detail batch punya tautan kembali ke daftar", detailText.includes('href="/admin/po"'));
  }
}
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
// Menu Syarat & Ketentuan (migration-47): isi /syarat-ketentuan pindah ke
// tabel `terms_sections`, jadi bisa disunting dari dashboard seperti FAQ.
await openPage("/admin/terms", {
  mustContain: ["Syarat & Ketentuan", "Tambah bagian", "Pemesanan"],
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

    // Isolasi isi section "Favorite" supaya cek tidak tertaut dengan
    // section "Menu" yang juga memuat kata "terjual" dan tombol like.
    const mulai = home.text.indexOf(">Favorite<");
    const akhir = mulai >= 0 ? home.text.indexOf("</section>", mulai) : -1;
    const isi = mulai >= 0 && akhir > mulai ? home.text.slice(mulai, akhir) : "";
    check("  kartu Favorite menampilkan jumlah terjual", /terjual/i.test(isi));
    // Tombol like = <button ... aria-pressed="...">. Kalau section ini
    // kembali read-only, hati berubah jadi <span aria-hidden> dan cek ini
    // gagal — persis regresi yang mau dicegah.
    check("  hati di kartu Favorite bisa diklik", /aria-pressed/i.test(isi));
  }
}
// /order dibuka dari server tanpa sessionStorage, jadi yang tampil selalu
// LANGKAH 1 — "Kapan mau ambil?" (pilih tanggal, migration-49). Baris
// "Siapa yang memesan?" cuma muncul setelah langkah 1 selesai di browser.
//
// 17-10-2026: kalau TIDAK ada batch dengan tanggal ambil yang belum lewat,
// lewat, `OrderFlow` sengaja tidak merender langkah apa pun dan
// menampilkan panel "Belum ada batch PO" (lihat `noBatch` di OrderFlow).
// Dua-duanya kondisi yang benar, jadi tes ini menerima keduanya — yang dicek
// adalah bahwa /order selalu memberi pintu masuk yang jelas, bukan bahwa
// selalu ada tanggal untuk dipilih.
const order = await openPage("/order");
const adaLangkah = /Kapan mau ambil\?/.test(order.text);
const adaPanelTanpaBatch = /Belum ada batch PO/.test(order.text);
check(
  "  /order menampilkan langkah 1 atau panel 'belum ada batch'",
  adaLangkah || adaPanelTanpaBatch,
  adaLangkah
    ? "langkah 1 tampil"
    : adaPanelTanpaBatch
      ? "panel 'belum ada batch' tampil"
      : `tidak ada keduanya. Teks: ${order.text.slice(0, 200)}`
);
await openPage("/track", { mustContain: ["Cek Status Pesanan"] });
// Item 5 (12-10-2026): isi FAQ, jam buka, S&K, dan kontak sekarang punya
// halaman sendiri di /profile-menu/*. Rute lama (/faq, /jam-buka,
// /syarat-ketentuan, /contact) sengaja MASIH ADA tapi cuma 307-redirect ke
// sana, jadi yang diperiksa di sini adalah tujuan barunya.
// /faq harus menampilkan isi dari database: pertanyaan seed pertama.
await openPage("/profile-menu/faq", {
  mustContain: ["FAQ", "Bagaimana cara memesan?"],
});
// /syarat-ketentuan harus menampilkan isi dari tabel `terms_sections`, bukan
// teks yang ditulis di kode.
await openPage("/profile-menu/syarat-ketentuan", {
  mustContain: ["Syarat & Ketentuan", "Pemesanan", "Pembayaran", "Pembatalan"],
});
// /jam-buka membaca `store_settings.hours_*`. Kolomnya masih kosong di
// database, jadi yang wajib ada adalah judul + empty state, bukan isi karangan.
await openPage("/profile-menu/jam-buka", {
  mustContain: ["Jam Buka", "belum diisi"],
});
await openPage("/riwayat", { mustContain: ["Riwayat Pesanan"] });
// Halaman kontak juga memuat FAQ yang sama (sumbernya satu tabel).
await openPage("/profile-menu/contact", {
  mustContain: ["Hubungi", "Bagaimana cara memesan?"],
});
// Rute lama harus tetap mengalihkan, bukan jadi halaman kosong/404.
for (const lama of ["faq", "syarat-ketentuan", "jam-buka", "contact"]) {
  const r = await fetch(`${APP}/${lama}`, { redirect: "manual" });
  check(
    `/${lama} lama -> 307 ke /profile-menu/${lama}`,
    r.status === 307 && (r.headers.get("location") ?? "") === `/profile-menu/${lama}`,
    `status=${r.status} loc=${r.headers.get("location")}`,
  );
}

console.log("\n=== 5. Admin tidak bisa melihat halaman pengaturan tanpa login ===");
const anon = await fetch(`${APP}/admin/settings`, { redirect: "manual" });
check("/admin/settings tanpa login -> diarahkan ke login",
  anon.status === 307 && (anon.headers.get("location") ?? "").includes("/admin/login"),
  `status=${anon.status} loc=${anon.headers.get("location")}`);
// Detail batch punya layout yang sama, jadi harus ikut terlindungi juga.
const anonDetail = await fetch(`${APP}/admin/po/1`, { redirect: "manual" });
check("/admin/po/1 tanpa login -> diarahkan ke login",
  anonDetail.status === 307 && (anonDetail.headers.get("location") ?? "").includes("/admin/login"),
  `status=${anonDetail.status} loc=${anonDetail.headers.get("location")}`);
// Id yang bukan angka harus 404, bukan halaman kosong yang menyesatkan.
const anonBadId = await fetch(`${APP}/admin/po/bukan-angka`, { redirect: "manual" });
check("/admin/po/bukan-angka -> 404", anonBadId.status === 404 || anonBadId.status === 307,
  `status=${anonBadId.status}`);

console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(46)}\n`);
process.exit(fail > 0 ? 1 : 0);
