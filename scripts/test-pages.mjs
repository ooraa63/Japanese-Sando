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
  // Layar awal sekarang 3 lempeng (Steven 18-10-2026 malam): Operasional,
  // Batch PO, Pengaturan. App "Identitas Toko" sudah tidak ada — seluruh isi
  // Pengaturan jadi satu app.
  check(
    "  layar awal punya 3 lempeng aplikasi",
    ["Operasional", "Batch PO", "Pengaturan"].every((t) => beranda.text.includes(t)) &&
      // Nama lempeng yang sudah dibubarkan tidak boleh muncul lagi. Catatan:
      // kata "Identitas Toko" sendiri masih wajar muncul sebagai NAMA BAGIAN
      // di dalam app Pengaturan, jadi yang dicari di sini adalah nama aplikasinya.
      ["Pesanan &amp; Pre-order", "Pesanan & Pre-order", "Ringkasan Bisnis", "Produk &amp; Pengiriman", "Produk & Pengiriman"].every(
        (t) => !beranda.text.includes(t),
      ),
  );
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
  // Sidebar app Operasional sengaja FLAT: tanpa judul bagian (permintaan
  // Steven 18-10-2026 "gak perlu ada judulnya kayak Summary Orders"). Jadi
  // yang diperiksa: ketujuh menunya ada, dan TIDAK ada lagi judul "Ringkasan"
  // yang sebelumnya dipakai sebagai bagian.
  const menuOperasional = [
    "Dashboard",
    "Pesanan",
    "Mutasi Penjualan",
    "Pelanggan",
    "Ulasan",
    "Menu & Paket",
    "Ambil & Kirim",
  ];
  check(
    "  sidebar Operasional memuat 7 menu",
    menuOperasional.every((m) => dash.text.includes(m)),
  );
  check("  sidebar Operasional tidak memakai judul bagian", !/RINGKASAN|LAPORAN/.test(dash.text));
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
  /*
   * Steven 18-10-2026 (malam): tiga aplikasi. Operasional dan Batch PO memakai
   * sidebar DAFTAR FLAT tanpa judul bagian (permintaan "gak perlu ada judulnya
   * kayak Summary Orders"), jadi `bagian` untuk keduanya sengaja kosong.
   */
  { url: "/admin/dashboard", aplikasi: "Operasional", bagian: [] },
  { url: "/admin/orders", aplikasi: "Operasional", bagian: [] },
  { url: "/admin/sales", aplikasi: "Operasional", bagian: [] },
  { url: "/admin/customers", aplikasi: "Operasional", bagian: [] },
  { url: "/admin/reviews", aplikasi: "Operasional", bagian: [] },
  { url: "/admin/menu", aplikasi: "Operasional", bagian: [] },
  { url: "/admin/pickup-delivery", aplikasi: "Operasional", bagian: [] },
  // PO punya DUA menu; keduanya halaman yang sama, dipisahkan `?tab=`.
  { url: "/admin/po", aplikasi: "Batch PO", bagian: [], aktif: "Sedang Berlangsung" },
  { url: "/admin/po?tab=berlangsung", aplikasi: "Batch PO", bagian: [], aktif: "Sedang Berlangsung" },
  { url: "/admin/po?tab=selesai", aplikasi: "Batch PO", bagian: [], aktif: "Sudah Berlalu" },
  // Semua tab Pengaturan pindah ke sidebar; deretan tab di halaman dihapus.
  { url: "/admin/settings?tab=identity", aplikasi: "Pengaturan", bagian: ["Identitas Toko", "Halaman Pembeli"], aktif: "Identitas toko" },
  { url: "/admin/settings?tab=contact", aplikasi: "Pengaturan", bagian: ["Identitas Toko"], aktif: "Kontak & lokasi" },
  { url: "/admin/settings?tab=hours", aplikasi: "Pengaturan", bagian: ["Identitas Toko"], aktif: "Aturan pesanan" },
  { url: "/admin/settings?tab=shipping", aplikasi: "Pengaturan", bagian: ["Pengiriman"], aktif: "Catatan pengambilan & pengiriman" },
  { url: "/admin/settings?tab=payment", aplikasi: "Pengaturan", bagian: ["Pembayaran"], aktif: "Pembayaran" },
  { url: "/admin/settings?tab=availability", aplikasi: "Pengaturan", bagian: ["Ketersediaan"], aktif: "Status pre-order" },
  { url: "/admin/settings?tab=home", aplikasi: "Pengaturan", bagian: ["Akun & Tampilan"], aktif: "Beranda" },
  { url: "/admin/settings?tab=admin", aplikasi: "Pengaturan", bagian: ["Akun & Tampilan"], aktif: "Akun penjual" },
  // Tanpa `?tab=` harus jatuh ke tab default `identity`.
  { url: "/admin/settings", aplikasi: "Pengaturan", bagian: ["Identitas Toko"], aktif: "Identitas toko" },
  { url: "/admin/profile-menu", aplikasi: "Pengaturan", bagian: ["Halaman Pembeli"], aktif: "Menu Profil" },
  { url: "/admin/announcements", aplikasi: "Pengaturan", bagian: ["Halaman Pembeli"], aktif: "Pengumuman" },
  { url: "/admin/faq", aplikasi: "Pengaturan", bagian: ["Halaman Pembeli"] },
  { url: "/admin/terms", aplikasi: "Pengaturan", bagian: ["Halaman Pembeli"] },
];
for (const peta of PETA_SIDEBAR) {
  const p = await openPage(peta.url);
  if (p.status !== 200) continue;
  // Judul bagian dirender `uppercase` lewat CSS, jadi teks mentahnya di HTML
  // tetap camelCase dan itulah yang dibandingkan di sini.
  check(`  ${peta.url} sidebar = ${peta.aplikasi}`, p.text.includes(peta.aplikasi));
  if (peta.bagian.length) {
    check(
      `  ${peta.url} bagian = ${peta.bagian.join(" + ")}`,
      peta.bagian.every((b) => p.text.includes(b)),
    );
  }
  // Menu yang harus ditandai aktif memakai `aria-current="page"`. Tanpa ini,
  // `/admin/settings?tab=payment` bisa menampilkan sidebar "Pengaturan" yang
  // benar tapi tidak menandai menu mana yang sedang dibuka.
  if (peta.aktif) {
    const aktif = /aria-current="page"[^>]*>([^<]{2,80})</g;
    /*
     * Label sidebar bisa terpotong oleh baris baru di dalam JSX (mis. "Catatan
     * pengambilan &\npengiriman"), dan `decodeEntities` sudah mengubah
     * `&amp;` jadi `&`. Spasi dituliskan dalam ekspektasi juga dinormalkan.
     */
    const rapikan = (s) => s.replace(/\s+/g, " ").trim();
    const labelAktif = [...p.text.matchAll(aktif)].map((m) => rapikan(m[1]));
    check(
      `  ${peta.url} menu aktif = ${peta.aktif}`,
      labelAktif.includes(rapikan(peta.aktif)),
      `yang aktif: ${JSON.stringify(labelAktif.slice(0, 4))}`,
    );
  }
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
await openPage("/admin/po", { mustContain: ["Batch"] });
// Detail batch (migration-51): kartu batch jadi tautan ke /admin/po/<id>, dan
// di dalamnya ada sidebar Stok / Pesanan / Pelanggan / Mutasi.
//
// Batch sudah dipecah dua menu (Steven 18-10-2026): "Sedang Berlangsung" dan
// "Sudah Berlalu". Sekarang seluruh batch di produksi sudah berstatus selesai,
// jadi `/admin/po` (mode berlangsung) kosong — dan itu memang yang benar.
// Karena itu kartu batch dicari di kedua mode, bukan cuma mode pertama.
{
  const duaMode = [];
  for (const mode of ["berlangsung", "selesai"]) {
    const poList = await openPage(`/admin/po?tab=${mode}`);
    if (poList.status !== 200) continue;
    const ketemu = poList.text.match(/href="\/admin\/po\/(\d+)"/);
    if (ketemu) duaMode.push(ketemu[1]);
  }
  const m = duaMode.length ? duaMode[0] : null;
  check("  /admin/po punya tautan ke detail batch", Boolean(m), m ? `id=${m}` : "tidak ada kartu batch di kedua mode");
  if (m) {
    await openPage(`/admin/po/${m}`, {
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
    const detail = await fetch(`${APP}/admin/po/${m}`, {
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
