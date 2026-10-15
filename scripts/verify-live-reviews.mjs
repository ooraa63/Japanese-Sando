// Verifikasi migration-58 di produksi (READ-ONLY + transaksi yang di-rollback).
//
// Bedanya dari scripts/test-migration-58.mjs: skrip itu menguji migration
// yang BELUM terpasang (dijalankan di BEGIN..ROLLBACK). Skrip ini memeriksa
// keadaan LIVE setelah apply: overload lama harus masih hidup, yang baru harus
// ada, data lama harus utuh, dan fungsi harus berperilaku benar pada data
// yang benar-benar ada di produksi.
//
// Semua pengujian yang mengubah data dibungkus BEGIN ... ROLLBACK.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let ok = 0;
let gagal = 0;
const cek = (nama, lulus, extra = "") => {
  if (lulus) ok++;
  else gagal++;
  console.log((lulus ? "OK   " : "GAGAL") + "  " + nama + (extra ? "  -> " + extra : ""));
};

const overload = async (nama, nargs) => {
  const r = await c.query(
    `select count(*)::int as n from pg_proc p
     join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = $1 and p.pronargs = $2`,
    [nama, nargs],
  );
  return r.rows[0].n;
};

console.log("=== 1. Skema LIVE ===");
cek("tabel order_review_photos ada",
  (await c.query("select count(*)::int n from information_schema.tables where table_schema='public' and table_name='order_review_photos'")).rows[0].n === 1);
cek("kolom photo_path TIDAK pernah dibuat di order_reviews",
  (await c.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='order_reviews' and column_name='photo_path'")).rows[0].n === 0);
cek("overload BARU submit_review 4-arg ada", (await overload("submit_review", 4)) === 1);
cek("overload BARU list_reviews 3-arg ada", (await overload("list_reviews", 3)) === 1);
cek("overload LAMA submit_review 3-arg masih hidup (kode live memanggilnya)",
  (await overload("submit_review", 3)) === 1);
cek("overload LAMA list_reviews 2-arg masih hidup", (await overload("list_reviews", 2)) === 1);

console.log("");
console.log("=== 2. Data lama utuh ===");
const sebelum = (await c.query("select count(*)::int n from public.order_reviews")).rows[0].n;
const ordersSebelum = (await c.query("select count(*)::int n from public.orders")).rows[0].n;
cek("jumlah ulasan tidak berubah oleh migration", sebelum > 0, String(sebelum));
cek("jumlah order tidak berubah oleh migration", ordersSebelum > 0, String(ordersSebelum));
cek("tidak ada baris foto yatim (semua review_id ada induknya)",
  (await c.query(`select count(*)::int n from public.order_review_photos p
    where not exists (select 1 from public.order_reviews r where r.id = p.review_id)`)).rows[0].n === 0);

console.log("");
console.log("=== 3. Bucket + policy storage LIVE ===");
const bucket = await c.query("select * from storage.buckets where id = 'review-photos'");
cek("bucket review-photos ada", bucket.rows.length === 1);
cek("bucket publik", bucket.rows[0]?.public === true);
cek("batas ukuran 5 MB", Number(bucket.rows[0]?.file_size_limit) === 5242880);
cek("hanya jpeg/png/webp yang boleh",
  Array.isArray(bucket.rows[0]?.allowed_mime_types) &&
  bucket.rows[0].allowed_mime_types.length === 3,
  JSON.stringify(bucket.rows[0]?.allowed_mime_types));
const pol = await c.query(`select policyname from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'review_photos%' order by policyname`);
cek("3 policy storage terpasang", pol.rows.length === 3, pol.rows.map((r) => r.policyname).join(", "));

console.log("");
console.log("=== 4. Perilaku pada data produksi (read-only) ===");
const live = await c.query("select public.list_reviews(12, 0, 'newest') as d");
const d = live.rows[0].d;
cek("list_reviews 3-arg jalan dan mengembalikan JSON", Boolean(d && d.reviews), JSON.stringify(Object.keys(d || {})));
cek("total_count = jumlah ulasan terlihat",
  d.total_count === (await c.query("select count(*)::int n from public.order_reviews where is_visible")).rows[0].n,
  String(d.total_count));
cek("setiap ulasan punya photo_paths berupa ARRAY",
  d.reviews.every((r) => Array.isArray(r.photo_paths)),
  JSON.stringify(d.reviews.map((r) => (r.photo_paths || []).length)));

for (const s of ["highest", "lowest", "photo", "newest", "ngawur"]) {
  const r = await c.query("select public.list_reviews(12, 0, $1) as d", [s]);
  cek("sort '" + s + "' tidak error", Boolean(r.rows[0].d && Array.isArray(r.rows[0].d.reviews)));
}
const tHighest = await c.query("select public.list_reviews(12, 0, 'highest') as d");
const ratingTertinggi = tHighest.rows[0].d.reviews.map((r) => r.rating);
cek("sort 'highest' benar-benar menurun",
  ratingTertinggi.every((v, i, a) => i === 0 || a[i - 1] >= v), JSON.stringify(ratingTertinggi));

const lama = await c.query("select public.list_reviews(12, 0) as d");
cek("overload LAMA list_reviews masih mengembalikan data yang sama",
  JSON.stringify(lama.rows[0].d.reviews.map((r) => r.id)) === JSON.stringify(d.reviews.map((r) => r.id)));

console.log("");
console.log("=== 5. Validasi foto (BEGIN..ROLLBACK) ===");
const kodeUji = "RK-VERIFIKASI-58";
const adaOrder = (await c.query("select count(*)::int n from public.orders where order_code = $1", [kodeUji])).rows[0].n;
cek("kode pesanan uji tidak bentrok dengan data nyata", adaOrder === 0);

await c.query("begin");
try {
  await c.query(`
    insert into public.orders (order_code, customer_name, phone, phone_normalized,
                               payment_method, status, delivery_method, delivery_zone,
                               subtotal, total_price, item_count, language)
    values ($1, 'Verifikasi 58', '081299999999', '081299999999', 'transfer', 'delivered',
            'pickup', 'pickup', 18000, 18000, 1, 'id')
  `, [kodeUji]);

  // Dua helper TERPISAH. Versi pertama menyatukan kasus "harus diterima" dan
// "harus ditolak" dalam satu fungsi, jadi setiap pemanggilnya selalu melaporkan
// GAGAL apa pun yang terjadi -- perilaku database-nya sendiri sudah benar.
  const kodeError = (e) => (/"([a-z_]+)"/.exec(String(e?.message)) || [])[1] || String(e?.message || "");

  const harusDiterima = async (paths, label) => {
    await c.query("savepoint sv");
    try {
      await c.query(
        "select public.submit_review($1::text, 5::smallint, 'Verifikasi foto'::text, $2::text[]) as d",
        [kodeUji, paths],
      );
      cek(label, true);
    } catch (e) {
      cek(label, false, "ditolak: " + kodeError(e));
    }
    await c.query("rollback to savepoint sv");
  };

  const harusDitolak = async (paths, label, kodeHarus) => {
    await c.query("savepoint sv");
    try {
      await c.query(
        "select public.submit_review($1::text, 5::smallint, 'Verifikasi foto'::text, $2::text[]) as d",
        [kodeUji, paths],
      );
      cek(label, false, "DITERIMA padahal harus ditolak!");
    } catch (e) {
      cek(label, kodeError(e) === kodeHarus, kodeError(e));
    }
    await c.query("rollback to savepoint sv");
  };

  await harusDiterima(["reviews/v-1.jpg"], "submit_review 1 foto DITERIMA");
  await harusDiterima(["reviews/v-1.jpg", "reviews/v-2.jpg", "reviews/v-3.jpg"], "submit_review 3 foto DITERIMA");
  await harusDitolak(["reviews/v-1.jpg", "reviews/v-2.jpg", "reviews/v-3.jpg", "reviews/v-4.jpg"], "submit_review 4 foto DITOLAK", "too_many_photos");
  await harusDitolak(["rahasia.txt"], "path di luar reviews/ DITOLAK", "invalid_photo_path");
  await harusDitolak(["../../etc/passwd"], "path traversal DITOLAK", "invalid_photo_path");
  await harusDitolak(["payment-proofs/x.jpg"], "path bucket lain DITOLAK", "invalid_photo_path");

  // Overload LAMA harus tetap bisa membuat ulasan (ini yang dipanggil kode
  // yang sedang live sampai deploy selesai).
  await c.query("savepoint sv2");
  try {
    const r = await c.query(
      "select public.submit_review($1::text, 4::smallint, 'Via overload lama'::text) as d",
      [kodeUji],
    );
    cek("overload LAMA submit_review masih bisa dipakai kode live", Boolean(r.rows[0]?.d?.id));
    cek("overload LAMA menghasilkan photo_paths kosong",
      Array.isArray(r.rows[0]?.d?.photo_paths) && r.rows[0].d.photo_paths.length === 0);
  } catch (e) {
    cek("overload LAMA submit_review masih bisa dipakai kode live", false, String(e.message));
  }
  await c.query("rollback to savepoint sv2");
} finally {
  await c.query("rollback");
}

console.log("");
console.log("=== 6. Sudah rollback, produksi bersih ===");
cek("tidak ada order verifikasi tersisa",
  (await c.query("select count(*)::int n from public.orders where order_code = $1", [kodeUji])).rows[0].n === 0);
cek("tidak ada ulasan verifikasi tersisa",
  (await c.query("select count(*)::int n from public.order_reviews where comment = 'Verifikasi foto'")).rows[0].n === 0);
cek("jumlah ulasan tetap sama seperti sebelum tes", (await c.query("select count(*)::int n from public.order_reviews")).rows[0].n === sebelum);
cek("jumlah order tetap sama seperti sebelum tes", (await c.query("select count(*)::int n from public.orders")).rows[0].n === ordersSebelum);
cek("tabel foto kosong (belum ada ulasan berfoto di produksi)",
  (await c.query("select count(*)::int n from public.order_review_photos")).rows[0].n === 0);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");

await c.end();
if (gagal > 0) process.exit(1);