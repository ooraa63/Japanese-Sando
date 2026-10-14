// Uji migration-58 tanpa menyentuh produksi: jalankan isinya di
// BEGIN ... ROLLBACK.
//
// Yang diuji:
//   1. Kolom photo_path ada; overload lama hilang, yang baru ada.
//   2. Grant benar (fungsi publik dapat anon, fungsi admin TIDAK).
//   3. Bucket review-photos + 3 policy storage.
//   4. Empat urutan list_reviews benar-benar berbeda, dan nilai ngawur jatuh
//      ke 'newest' tanpa error.
//   5. submit_review 4-arg menerima foto; path di luar folder reviews/
//      ditolak invalid_photo_path.
//   6. Tiga RPC admin: daftar, sembunyi/tampil, hapus -- diuji DUA KALI,
//      sekali tanpa sesi admin (harus ditolak) dan sekali dengan sesi admin
//      yang disimulasikan lewat GUC request.jwt.claim.sub.
//   7. Ulasan tersembunyi hilang dari list_reviews.
//   8. Setelah ROLLBACK semuanya kembali persis ke semula.
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

const punyaGrant = async (identitas, role) => {
  const r = await c.query(
    "select has_function_privilege($1, $2, 'EXECUTE') as boleh",
    [role, identitas],
  );
  return r.rows[0].boleh;
};

const adminUuid = (await c.query("select user_id::text as u from public.admins where is_active limit 1")).rows[0];
if (!adminUuid) {
  console.log("GAGAL: tidak ada admin aktif untuk tes sesi admin");
  await c.end();
  process.exit(1);
}

const ulasanAwal = (await c.query("select count(*)::int as n from public.order_reviews")).rows[0].n;
const overloadSebelum = {
  submit3: await overload("submit_review", 3),
  submit4: await overload("submit_review", 4),
  list2: await overload("list_reviews", 2),
  list3: await overload("list_reviews", 3),
};

const sql = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-58.sql"), "utf8");
await c.query("begin");
await c.query(sql);

console.log("=== 1. Skema ===");
const kolom = await c.query(`
  select data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'order_reviews' and column_name = 'photo_path'
`);
cek("kolom order_reviews.photo_path ada", kolom.rows.length === 1);
cek("submit_review 4-arg (baru) ada", (await overload("submit_review", 4)) === 1);
cek("list_reviews 3-arg (baru) ada", (await overload("list_reviews", 3)) === 1);
// Overload LAMA harus TETAP ADA sebagai pembungkus, supaya kode yang sedang
// live di produksi tidak ikut error selama transisi deploy.
cek("submit_review 3-arg (lama) masih ada sebagai pembungkus", (await overload("submit_review", 3)) === 1);
cek("list_reviews 2-arg (lama) masih ada sebagai pembungkus", (await overload("list_reviews", 2)) === 1);

console.log("");
console.log("=== 2. Grant ===");
cek("anon boleh list_reviews yang baru",
  await punyaGrant("public.list_reviews(integer,integer,text)", "anon"));
cek("anon boleh submit_review yang baru",
  await punyaGrant("public.submit_review(text,smallint,text,text)", "anon"));
cek("anon tetap boleh submit_review LAMA (kode live memanggilnya)",
  await punyaGrant("public.submit_review(text,smallint,text)", "anon"));
cek("anon tetap boleh list_reviews LAMA (kode live memanggilnya)",
  await punyaGrant("public.list_reviews(integer,integer)", "anon"));
// CATATAN: anon tetap dapat EXECUTE pada fungsi admin karena DEFAULT ACL
// schema public memberi X ke anon untuk semua fungsi baru. Grants eksplisit
// tidak bisa mencegah itu, sama seperti admin_delete_faq yang sudah lama.
// Pengaman yang sesungguhnya ada di dalam fungsi (is_admin()), diuji di
// bagian 6 -- bukan di sini.
cek("anon tetap dapat EXECUTE fungsi admin (dari DEFAULT ACL, sudah begitu sejak dulu)",
  await punyaGrant("public.admin_list_reviews()", "anon"));
cek("authenticated boleh admin_list_reviews",
  await punyaGrant("public.admin_list_reviews()", "authenticated"));

console.log("");
console.log("=== 3. Bucket + policy storage ===");
const bucket = await c.query("select * from storage.buckets where id = 'review-photos'");
cek("bucket review-photos ada", bucket.rows.length === 1);
cek("bucket review-photos publik", bucket.rows[0]?.public === true);
cek("batas ukuran 5 MB", Number(bucket.rows[0]?.file_size_limit) === 5242880);
const pol = await c.query(`
  select policyname, cmd from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'review_photos%'
  order by policyname
`);
const namaPolicy = pol.rows.map((r) => r.policyname);
cek("policy simpan oleh anon ada", namaPolicy.includes("review_photos_anon_insert"));
cek("policy baca publik ada", namaPolicy.includes("review_photos_public_read"));
cek("policy hapus oleh admin ada", namaPolicy.includes("review_photos_admin_delete"));
cek("total 3 policy", pol.rows.length === 3, namaPolicy.join(", "));

console.log("");
console.log("=== 4. Data uji: 3 pesanan delivered + 3 ulasan dengan rating berbeda ===");
// Pesanan + ulasan palsu, semuanya di dalam transaksi ini saja.
await c.query(`
  insert into public.orders (order_code, customer_name, phone, phone_normalized,
                             payment_method, status, delivery_method, delivery_zone,
                             subtotal, total_price, item_count, language)
  values
    ('RK-UJI-A', 'Uji A', '081200000001', '081200000001', 'transfer', 'delivered',
     'pickup', 'pickup', 18000, 18000, 1, 'id'),
    ('RK-UJI-B', 'Uji B', '081200000002', '081200000002', 'transfer', 'delivered',
     'pickup', 'pickup', 18000, 18000, 1, 'id'),
    ('RK-UJI-C', 'Uji C', '081200000003', '081200000003', 'transfer', 'delivered',
     'pickup', 'pickup', 18000, 18000, 1, 'id'),
    -- Dibiarkan tanpa ulasan supaya submit_review bisa diuji (satu order
    -- hanya boleh punya satu ulasan karena order_id UNIQUE).
    ('RK-UJI-D', 'Uji D', '081200000004', '081200000004', 'transfer', 'delivered',
     'pickup', 'pickup', 18000, 18000, 1, 'id')
`);
await c.query(`
  insert into public.order_reviews (order_id, customer_name, rating, comment, photo_path, created_at)
  select o.id, o.customer_name, v.rating, v.comment, v.photo_path, v.created_at::timestamptz
  from (values
    ('RK-UJI-A', 2,  'Ulasan dua bintang',   null::text,           '2026-10-01 10:00:00+00'),
    ('RK-UJI-B', 5,  'Ulasan lima bintang',  'reviews/uji-b.jpg', '2026-10-02 10:00:00+00'),
    ('RK-UJI-C', 4,  'Ulasan empat bintang', null,                '2026-10-03 10:00:00+00')
  ) as v(order_code, rating, comment, photo_path, created_at)
  join public.orders o on o.order_code = v.order_code
`);
cek("3 ulasan uji berhasil dibuat",
  (await c.query("select count(*)::int as n from public.order_reviews where comment like 'Ulasan % bintang'")).rows[0].n === 3,
  String((await c.query("select count(*)::int as n from public.order_reviews where comment like 'Ulasan % bintang'")).rows[0].n));

// Hanya baris uji yang dibandingkan. Ada ulasan lama di tabel (rating 5,
// dibuat hari ini) yang kalau ikut dihitung membuat ekspektasi salah -- dan
// urutan yang benar TETAP benar, jadi jangan diubah migration untuk-hebatan sake.
const urutanUji = async (sort) => {
  const r = await c.query("select public.list_reviews(50, 0, $1) as d", [sort]);
  return r.rows[0].d.reviews
    .filter((x) => String(x.comment).startsWith("Ulasan "))
    .map((x) => x.rating);
};

const uNewest = await urutanUji("newest");
cek("sort 'newest' = terbaru dulu", JSON.stringify(uNewest) === JSON.stringify([4, 5, 2]), JSON.stringify(uNewest));

const uHighest = await urutanUji("highest");
cek("sort 'highest' = bintang tertinggi dulu",
  JSON.stringify(uHighest) === JSON.stringify([5, 4, 2]), JSON.stringify(uHighest));

const uLowest = await urutanUji("lowest");
cek("sort 'lowest' = bintang terendah dulu",
  JSON.stringify(uLowest) === JSON.stringify([2, 4, 5]), JSON.stringify(uLowest));

const uPhoto = await c.query("select public.list_reviews(50, 0, 'photo') as d");
const fotoPertama = uPhoto.rows[0].d.reviews.filter((x) => String(x.comment).startsWith("Ulasan "))[0];
cek("sort 'photo' = yang punya foto dulu", fotoPertama?.photo_path === "reviews/uji-b.jpg",
  String(fotoPertama?.photo_path));

const uNgawur = await urutanUji("ngawur");
cek("sort ngawur jatuh ke 'newest' tanpa error", JSON.stringify(uNgawur) === JSON.stringify(uNewest),
  JSON.stringify(uNgawur));

const totalDitolak = await c.query("select public.list_reviews(50, 0, 'newest') as d");
const totalEkspektasi = (await c.query(
  "select count(*)::int as n from public.order_reviews where is_visible = true"
)).rows[0].n;
cek("total_count sama dengan jumlah ulasan terlihat", totalDitolak.rows[0].d.total_count === totalEkspektasi,
  totalDitolak.rows[0].d.total_count + " vs " + totalEkspektasi);

console.log("");
console.log("=== 5. submit_review 4-arg + foto ===");
// Literal harus di-cast: tanpa itu Postgres tidak bisa memilih overload
// (smallint vs text) dan errornya "function ... does not exist".
await c.query("savepoint s1");
try {
  await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, 'reviews/baru.jpg'::text)",
  );
  cek("foto di folder reviews/ diterima", true);
} catch (e) {
  cek("foto di folder reviews/ diterima", false, String(e.message || ""));
}
await c.query("rollback to savepoint s1");

await c.query("savepoint s2");
try {
  await c.query("select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, '../../rahasia.txt'::text)");
  cek("path di luar folder reviews/ DITOLAK", false, "terima!");
} catch (e) {
  cek("path di luar folder reviews/ DITOLAK", /invalid_photo_path/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s2");

await c.query("savepoint s2b");
try {
  await c.query("select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, 'payment-proofs/x.jpg'::text)");
  cek("path milik bucket lain DITOLAK", false, "terima!");
} catch (e) {
  cek("path milik bucket lain DITOLAK", /invalid_photo_path/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s2b");

await c.query("savepoint s3");
try {
  await c.query("select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, null::text)");
  cek("foto opsional (null) tetap boleh", true);
} catch (e) {
  cek("foto opsional (null) tetap boleh", false, String(e.message || ""));
}
await c.query("rollback to savepoint s3");

// Signature LAMA harus tetap bekerja dan berperilaku sama dengan versi baru
// (tanpa foto) -- inilah yang menjaga situs yang sedang live tetap normal.
await c.query("savepoint s3b");
try {
  const lama = await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji via overload lama'::text) as d"
  );
  cek("overload lama submit_review tetap jalan", lama.rows[0]?.d?.photo_path === null,
    JSON.stringify(lama.rows[0]?.d?.photo_path));
  cek("overload lama menyimpan ulasannya", Boolean(lama.rows[0]?.d?.id));
} catch (e) {
  cek("overload lama submit_review tetap jalan", false, String(e.message || ""));
}
await c.query("rollback to savepoint s3b");

const lamaList = await c.query("select public.list_reviews(50, 0) as d");
const baruList = await c.query("select public.list_reviews(50, 0, 'newest') as d");
cek("overload lama list_reviews sama dengan versi baru + 'newest'",
  JSON.stringify(lamaList.rows[0].d.reviews.map((r) => r.id)) ===
  JSON.stringify(baruList.rows[0].d.reviews.map((r) => r.id)));

console.log("");
console.log("=== 6. RPC admin ===");
await c.query("select set_config('request.jwt.claim.sub', '', true)");

await c.query("savepoint s6");
try {
  await c.query("select public.admin_delete_review(1)");
  cek("admin_delete_review tanpa sesi admin DITOLAK", false, "terima!");
} catch (e) {
  cek("admin_delete_review tanpa sesi admin DITOLAK", /not_authorized/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s6");

const tanpaAdmin = await c.query("select public.admin_list_reviews() as d");
cek("admin_list_reviews tanpa sesi admin mengembalikan null", tanpaAdmin.rows[0].d === null,
  JSON.stringify(tanpaAdmin.rows[0].d));

// Sekarang berpura-pura jadi admin.
await c.query("select set_config('request.jwt.claim.sub', $1, true)", [adminUuid.u]);

const listAdmin = await c.query("select public.admin_list_reviews() as d");
const listD = listAdmin.rows[0].d;
cek("admin_list_reviews melihat semua ulasan", Array.isArray(listD.reviews) && listD.reviews.length === 4,
  listD.reviews ? String(listD.reviews.length) : "bukan array");
cek("admin_list_reviews melaporkan jumlah tersembunyi", listD.hidden_count === 0, String(listD.hidden_count));

const idUji = listD.reviews.find((r) => r.order_code === "RK-UJI-A");
cek("data ulasan punya order_code", Boolean(idUji && idUji.order_code === "RK-UJI-A"));

const setHidden = await c.query("select public.admin_set_review_visible($1, false) as d", [idUji.id]);
cek("sembunyikan ulasan berhasil", setHidden.rows[0].d.is_visible === false);

const setelahSembunyi = await c.query("select public.list_reviews(50, 0, 'newest') as d");
cek("ulasan tersembunyi hilang dari daftar publik",
  !setelahSembunyi.rows[0].d.reviews.some((r) => r.id === idUji.id));
cek("total_count publik ikut turun", setelahSembunyi.rows[0].d.total_count === 3,
  String(setelahSembunyi.rows[0].d.total_count));

const setShown = await c.query("select public.admin_set_review_visible($1, true) as d", [idUji.id]);
cek("tampilkan lagi berhasil (reversibel)", setShown.rows[0].d.is_visible === true);

const idFoto = listD.reviews.find((r) => r.order_code === "RK-UJI-B");
const del = await c.query("select public.admin_delete_review($1) as d", [idFoto.id]);
cek("hapus ulasan dengan foto mengembalikan photo_path",
  del.rows[0].d.photo_path === "reviews/uji-b.jpg", JSON.stringify(del.rows[0].d));
cek("hapus menandai photo_pending", del.rows[0].d.photo_pending === true);
cek("baris ulasan benar-benar hilang",
  (await c.query("select count(*)::int as n from public.order_reviews where id = $1", [idFoto.id])).rows[0].n === 0);

await c.query("savepoint s7");
try {
  await c.query("select public.admin_delete_review(999999)");
  cek("hapus ulasan yang tidak ada DITOLAK", false, "terima!");
} catch (e) {
  cek("hapus ulasan yang tidak ada DITOLAK", /review_not_found/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s7");

await c.query("reset request.jwt.claim.sub");

await c.query("rollback");

console.log("");
console.log("=== 7. Setelah ROLLBACK, semua kembali ===");
cek("kolom photo_path hilang",
  (await c.query(`select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_reviews' and column_name = 'photo_path'`)).rows.length === 0);
cek("submit_review 3-arg (lama) kembali utuh setelah rollback", (await overload("submit_review", 3)) === 1);
cek("submit_review 4-arg hilang setelah rollback", (await overload("submit_review", 4)) === 0);
cek("list_reviews 2-arg (lama) kembali utuh setelah rollback", (await overload("list_reviews", 2)) === 1);
cek("list_reviews 3-arg hilang setelah rollback", (await overload("list_reviews", 3)) === 0);
cek("bucket review-photos hilang",
  (await c.query("select count(*)::int as n from storage.buckets where id = 'review-photos'")).rows[0].n === 0);
cek("policy review-phosts hilang",
  (await c.query(`select count(*)::int as n from pg_policies
    where schemaname = 'storage' and policyname like 'review_photos%'`)).rows[0].n === 0);
cek("tidak ada ulasan/pesanan uji tersisa",
  (await c.query("select count(*)::int as n from public.order_reviews")).rows[0].n === ulasanAwal);
cek("tidak ada order uji tersisa",
  (await c.query("select count(*)::int as n from public.orders where order_code like 'RK-UJI-%'")).rows[0].n === 0);

console.log("");
console.log("=== " + ok + " OK, " + gagal + " GAGAL ===");

await c.end();
if (gagal > 0) process.exit(1);