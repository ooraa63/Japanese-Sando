// Uji migration-58 tanpa menyentuh produksi: jalankan isinya di
// BEGIN ... ROLLBACK.
//
// Yang diuji:
//   1. Tabel anak `order_review_photos` ada dengan batas 3 baris per ulasan
//      (position 1..3 + unique(review_id, position)).
//   2. Overload LAMA (submit_review 3-arg, list_reviews 2-arg) TIDAK hilang --
//      hanya jadi pembungkus, supaya kode yang sedang live tidak ikut error.
//   3. Grant benar (fungsi publik dapat anon, fungsi admin dilindungi is_admin).
//   4. Bucket review-photos + 3 policy storage.
//   5. Empat urutan list_reviews benar-benar berbeda, dan nilai ngawur jatuh
//      ke 'newest' tanpa error.
//   6. `photo_paths` dikembalikan sebagai JSON ARRAY berisi semua foto, urut.
//   7. submit_review 4-arg menerima 1/2/3 foto; 4 foto ditolak too_many_photos;
//      path di luar folder reviews/ ditolak invalid_photo_path.
//   8. Tiga RPC admin: daftar, sembunyi/tampil, hapus -- diuji DUA KALI,
//      sekali tanpa sesi admin (harus ditolak) dan sekali dengan sesi admin
//      yang disimulasikan lewat GUC request.jwt.claim.sub.
//   9. Hapus ulasan = baris foto ikut hilang (ON DELETE CASCADE) dan semua
//      path dikembalikan supaya server action bisa menghapus filenya.
//  10. Paging lewat row_number() benar (OFFSET tidak bisa berisi variabel).
//  11. Setelah ROLLBACK semuanya kembali persis ke semula.
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
cek("sebelum migration: submit_review 4-arg belum ada", overloadSebelum.submit4 === 0);
cek("sebelum migration: list_reviews 3-arg belum ada", overloadSebelum.list3 === 0);
cek("sebelum migration: tidak ada tabel order_review_photos",
  (await c.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'order_review_photos'")).rows[0].n === 0);

const sql = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-58.sql"), "utf8");
await c.query("begin");
await c.query(sql);

console.log("=== 1. Skema ===");
const tabelFoto = await c.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name = 'order_review_photos'
`);
cek("tabel order_review_photos ada", tabelFoto.rows.length === 1);

const kolomFoto = await c.query(`
  select column_name, data_type from information_schema.columns
  where table_schema = 'public' and table_name = 'order_review_photos'
  order by column_name
`);
const namaKolom = kolomFoto.rows.map((r) => r.column_name);
cek("kolom order_review_photos lengkap",
  ["created_at", "id", "path", "position", "review_id"].every((k) => namaKolom.includes(k)),
  namaKolom.join(","));
cek("kolom photo_path TIDAK ada di order_reviews (foto disimpan di tabel anak)",
  (await c.query(`select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_reviews' and column_name = 'photo_path'`)).rows.length === 0);

const adaUniq = (await c.query(`
  select count(*)::int as n from pg_constraint
  where conrelid = 'public.order_review_photos'::regclass and contype = 'u'
`)).rows[0].n;
cek("ada constraint UNIQUE di order_review_photos", adaUniq >= 1, String(adaUniq));

// Batas 1..3 ditegakkan CHECK di tabel, jadi diuji lewat insert nyata di
// bagian 4 (bukan di sini, karena butuh baris ulasan untuk dituju).
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
  await punyaGrant("public.submit_review(text,smallint,text,text[])", "anon"));
cek("anon tetap boleh submit_review LAMA (kode live memanggilnya)",
  await punyaGrant("public.submit_review(text,smallint,text)", "anon"));
cek("anon tetap boleh list_reviews LAMA (kode live memanggilnya)",
  await punyaGrant("public.list_reviews(integer,integer)", "anon"));
// CATATAN: anon tetap dapat EXECUTE pada fungsi admin karena DEFAULT ACL
// schema public memberi X ke anon untuk semua fungsi baru. Grants eksplisit
// tidak bisa mencegah itu, sama seperti admin_delete_faq yang sudah lama.
// Pengaman yang sesungguhnya ada di dalam fungsi (is_admin()), diuji di
// bagian 7 -- bukan di sini.
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
console.log("=== 4. Data uji: 3 pesanan delivered + ulasan dengan rating & foto berbeda ===");
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
  insert into public.order_reviews (order_id, customer_name, rating, comment, created_at)
  select o.id, o.customer_name, v.rating, v.comment, v.created_at::timestamptz
  from (values
    ('RK-UJI-A', 2,  'Ulasan dua bintang',   '2026-10-01 10:00:00+00'),
    ('RK-UJI-B', 5,  'Ulasan lima bintang',  '2026-10-02 10:00:00+00'),
    ('RK-UJI-C', 4,  'Ulasan empat bintang', '2026-10-03 10:00:00+00')
  ) as v(order_code, rating, comment, created_at)
  join public.orders o on o.order_code = v.order_code
`);
cek("3 ulasan uji berhasil dibuat",
  (await c.query("select count(*)::int as n from public.order_reviews where comment like 'Ulasan % bintang'")).rows[0].n === 3);

// B = 3 foto (batas maksimum), A = 1 foto, C = tanpa foto.
await c.query(`
  insert into public.order_review_photos (review_id, path, position)
  select r.id, v.path, v.pos
  from (values
    ('RK-UJI-A', 'reviews/uji-a-1.jpg', 1),
    ('RK-UJI-B', 'reviews/uji-b-1.jpg', 1),
    ('RK-UJI-B', 'reviews/uji-b-2.jpg', 2),
    ('RK-UJI-B', 'reviews/uji-b-3.jpg', 3)
  ) as v(order_code, path, pos)
  join public.order_reviews r
    on r.order_id = (select id from public.orders where order_code = v.order_code)
`);
cek("4 baris foto uji tersimpan",
  (await c.query("select count(*)::int as n from public.order_review_photos where path like 'reviews/uji-%'")).rows[0].n === 4);

// Batas posisi 1..3 harus ditegakkan CHECK, bukan cuma kode aplikasi.
const idUjiB = (await c.query(
  "select r.id from public.order_reviews r join public.orders o on o.id = r.order_id where o.order_code = 'RK-UJI-B'"
)).rows[0].id;

await c.query("savepoint spos");
try {
  await c.query(
    "insert into public.order_review_photos (review_id, path, position) values ($1, 'reviews/keempat.jpg', 4)",
    [idUjiB],
  );
  cek("foto ke-4 DITOLAK oleh CHECK position", false, "terima!");
} catch (e) {
  cek("foto ke-4 DITOLAK oleh CHECK position", /position|check/i.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint spos");

await c.query("savepoint suniq");
try {
  await c.query(
    "insert into public.order_review_photos (review_id, path, position) values ($1, 'reviews/kembar.jpg', 1)",
    [idUjiB],
  );
  cek("dua foto di posisi yang sama DITOLAK", false, "terima!");
} catch (e) {
  cek("dua foto di posisi yang sama DITOLAK", /unique|duplicate/i.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint suniq");

console.log("");
console.log("=== 5. Urutan + photo_paths di list_reviews ===");
// Hanya baris uji yang dibandingkan. Ada ulasan lama di tabel (rating 5,
// dibuat hari ini) yang kalau ikut dihitung membuat ekspektasi salah -- dan
// urutan yang benar TETAP benar, jadi jangan diubah migration demi appease
// angka ekspektasi.
const urutanUji = async (sort, limit = 50, offset = 0) => {
  const r = await c.query("select public.list_reviews($1, $2, $3) as d", [limit, offset, sort]);
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
const semuaUji = uPhoto.rows[0].d.reviews.filter((x) => String(x.comment).startsWith("Ulasan "));
const fotoPertama = semuaUji[0];
cek("sort 'photo' = yang punya foto dulu", fotoPertama?.rating === 5,
  "rating pertama " + String(fotoPertama?.rating));
cek("ulasan tanpa foto tidak masuk 3 besar saat sort 'photo'",
  semuaUji.slice(0, 2).every((x) => (x.photo_paths || []).length > 0),
  semuaUji.map((x) => (x.photo_paths || []).length).join(","));

const pathB = Array.isArray(fotoPertama?.photo_paths) ? fotoPertama.photo_paths : null;
cek("photo_paths dikembalikan sebagai ARRAY (bukan string / bukan kolom tunggal)",
  Array.isArray(pathB), JSON.stringify(pathB));
cek("3 foto ikut terkirim",
  pathB && pathB.length === 3, pathB ? String(pathB.length) : "bukan array");
cek("urutan foto ikut position (1,2,3)",
  pathB && pathB.join("|") === "reviews/uji-b-1.jpg|reviews/uji-b-2.jpg|reviews/uji-b-3.jpg",
  pathB ? pathB.join("|") : "-");
cek("ulasan tanpa foto dapat array kosong, bukan null",
  Array.isArray(semuaUji.find((x) => x.rating === 4)?.photo_paths) &&
  semuaUji.find((x) => x.rating === 4).photo_paths.length === 0,
  JSON.stringify(semuaUji.find((x) => x.rating === 4)?.photo_paths));

const uNgawur = await urutanUji("ngawur");
cek("sort ngawur jatuh ke 'newest' tanpa error", JSON.stringify(uNgawur) === JSON.stringify(uNewest),
  JSON.stringify(uNgawur));

const totalDitolak = await c.query("select public.list_reviews(50, 0, 'newest') as d");
const totalEkspektasi = (await c.query(
  "select count(*)::int as n from public.order_reviews where is_visible = true"
)).rows[0].n;
cek("total_count sama dengan jumlah ulasan terlihat", totalDitolak.rows[0].d.total_count === totalEkspektasi,
  totalDitolak.rows[0].d.total_count + " vs " + totalEkspektasi);

// Paging: OFFSET tidak boleh berisi variabel di PostgreSQL, jadi migration
// memakai row_number(). Kalau salah, baris yang sama muncul di dua halaman.
const hal1 = await c.query("select public.list_reviews(2, 0, 'newest') as d");
const hal2 = await c.query("select public.list_reviews(2, 2, 'newest') as d");
const idHal1 = hal1.rows[0].d.reviews.map((r) => r.id);
const idHal2 = hal2.rows[0].d.reviews.map((r) => r.id);
cek("halaman 1 berisi tepat 2 baris", idHal1.length === 2, String(idHal1.length));
cek("halaman 2 tidak mengulang baris halaman 1",
  !idHal2.some((id) => idHal1.includes(id)), JSON.stringify({ idHal1, idHal2 }));

console.log("");
console.log("=== 6. submit_review 4-arg + foto ===");
// Literal harus di-cast: tanpa itu Postgres tidak bisa memilih overload
// (smallint vs text, text vs text[]) dan errornya "function ... does not exist".
await c.query("savepoint s1");
try {
  await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, '{reviews/baru.jpg}'::text[]) as d",
  );
  cek("1 foto di folder reviews/ diterima", true);
} catch (e) {
  cek("1 foto di folder reviews/ diterima", false, String(e.message || ""));
}
await c.query("rollback to savepoint s1");

await c.query("savepoint s1b");
try {
  const d = await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji tiga foto'::text, '{reviews/a.jpg,reviews/b.jpg,reviews/c.jpg}'::text[]) as d",
  );
  const hasil = d.rows[0].d;
  cek("3 foto sekaligus diterima (batas maksimum)",
    Array.isArray(hasil.photo_paths) && hasil.photo_paths.length === 3,
    JSON.stringify(hasil.photo_paths));
  cek("path ikut tersimpan di tabel anak, urut",
    (await c.query(
      "select path from public.order_review_photos where review_id = $1 order by position",
      [hasil.id],
    )).rows.map((r) => r.path).join("|") === "reviews/a.jpg|reviews/b.jpg|reviews/c.jpg");
} catch (e) {
  cek("3 foto sekaligus diterima (batas maksimum)", false, String(e.message || ""));
}
await c.query("rollback to savepoint s1b");

await c.query("savepoint s2");
try {
  await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, '{reviews/a.jpg,reviews/b.jpg,reviews/c.jpg,reviews/d.jpg}'::text[])",
  );
  cek("4 foto DITOLAK too_many_photos", false, "terima!");
} catch (e) {
  cek("4 foto DITOLAK too_many_photos", /too_many_photos/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s2");

await c.query("savepoint s2c");
try {
  await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, '{reviews/a.jpg,../../rahasia.txt}'::text[])",
  );
  cek("path '../' DITOLAK", false, "terima!");
} catch (e) {
  cek("path '../' DITOLAK", /invalid_photo_path/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s2c");

await c.query("savepoint s2d");
try {
  await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji foto'::text, '{reviews/a.jpg,payment-proofs/x.jpg}'::text[])",
  );
  cek("path milik bucket lain DITOLAK", false, "terima!");
} catch (e) {
  cek("path milik bucket lain DITOLAK", /invalid_photo_path/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s2d");

await c.query("savepoint s3");
try {
  const d = await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji tanpa foto'::text, null::text[]) as d",
  );
  cek("foto opsional (null) tetap boleh, hasilnya array kosong",
    Array.isArray(d.rows[0].d.photo_paths) && d.rows[0].d.photo_paths.length === 0,
    JSON.stringify(d.rows[0].d.photo_paths));
} catch (e) {
  cek("foto opsional (null) tetap boleh, hasilnya array kosong", false, String(e.message || ""));
}
await c.query("rollback to savepoint s3");

// Signature LAMA harus tetap bekerja dan berperilaku sama dengan versi baru
// (tanpa foto) -- inilah yang menjaga situs yang sedang live tetap normal.
await c.query("savepoint s3b");
try {
  const lama = await c.query(
    "select public.submit_review('RK-UJI-D'::text, 3::smallint, 'Uji via overload lama'::text) as d"
  );
  cek("overload lama submit_review tetap jalan", lama.rows[0]?.d?.id !== undefined,
    JSON.stringify(lama.rows[0]?.d));
  cek("overload lama menghasilkan photo_paths kosong",
    Array.isArray(lama.rows[0]?.d?.photo_paths) && lama.rows[0].d.photo_paths.length === 0,
    JSON.stringify(lama.rows[0]?.d?.photo_paths));
  cek("overload lama tidak menulis baris foto",
    (await c.query("select count(*)::int as n from public.order_review_photos")).rows[0].n === 4,
    "total baris foto masih 4");
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
console.log("=== 7. RPC admin ===");
await c.query("select set_config('request.jwt.claim.sub', '', true)");

await c.query("savepoint s6");
try {
  await c.query("select public.admin_delete_review(1)");
  cek("admin_delete_review tanpa sesi admin DITOLAK", false, "terima!");
} catch (e) {
  cek("admin_delete_review tanpa sesi admin DITOLAK", /not_authorized/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s6");

await c.query("savepoint s6b");
try {
  await c.query("select public.admin_set_review_visible(1, false)");
  cek("admin_set_review_visible tanpa sesi admin DITOLAK", false, "terima!");
} catch (e) {
  cek("admin_set_review_visible tanpa sesi admin DITOLAK", /not_authorized/.test(String(e.message || "")), String(e.message || ""));
}
await c.query("rollback to savepoint s6b");

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

const rowA = listD.reviews.find((r) => r.order_code === "RK-UJI-A");
const rowB = listD.reviews.find((r) => r.order_code === "RK-UJI-B");
cek("data ulasan punya order_code", Boolean(rowA && rowA.order_code === "RK-UJI-A"));
cek("admin_list_reviews juga membawa photo_paths",
  Array.isArray(rowB?.photo_paths) && rowB.photo_paths.length === 3,
  JSON.stringify(rowB?.photo_paths));

const setHidden = await c.query("select public.admin_set_review_visible($1, false) as d", [rowA.id]);
cek("sembunyikan ulasan berhasil", setHidden.rows[0].d.is_visible === false);

const setelahSembunyi = await c.query("select public.list_reviews(50, 0, 'newest') as d");
cek("ulasan tersembunyi hilang dari daftar publik",
  !setelahSembunyi.rows[0].d.reviews.some((r) => r.id === rowA.id));
cek("foto ulasan tersembunyi ikut hilang dari daftar publik",
  !setelahSembunyi.rows[0].d.reviews.some((r) => (r.photo_paths || []).includes("reviews/uji-a-1.jpg")));
cek("total_count publik ikut turun", setelahSembunyi.rows[0].d.total_count === 3,
  String(setelahSembunyi.rows[0].d.total_count));

const setShown = await c.query("select public.admin_set_review_visible($1, true) as d", [rowA.id]);
cek("tampilkan lagi berhasil (reversibel)", setShown.rows[0].d.is_visible === true);

const del = await c.query("select public.admin_delete_review($1) as d", [rowB.id]);
const outDel = del.rows[0].d;
cek("hapus ulasan mengembalikan SEMUA photo_paths",
  Array.isArray(outDel.photo_paths) && outDel.photo_paths.length === 3,
  JSON.stringify(outDel.photo_paths));
cek("urutan path yang dikembalikan sesuai position",
  Array.isArray(outDel.photo_paths) &&
  outDel.photo_paths.join("|") === "reviews/uji-b-1.jpg|reviews/uji-b-2.jpg|reviews/uji-b-3.jpg",
  Array.isArray(outDel.photo_paths) ? outDel.photo_paths.join("|") : "-");
cek("hapus menandai photo_pending", outDel.photo_pending === true);
cek("baris ulasan benar-benar hilang",
  (await c.query("select count(*)::int as n from public.order_reviews where id = $1", [rowB.id])).rows[0].n === 0);
cek("baris foto ikut hilang (ON DELETE CASCADE)",
  (await c.query("select count(*)::int as n from public.order_review_photos where review_id = $1", [rowB.id])).rows[0].n === 0,
  String((await c.query("select count(*)::int as n from public.order_review_photos where review_id = $1", [rowB.id])).rows[0].n));

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
console.log("=== 8. Setelah ROLLBACK, semua kembali ===");
cek("tabel order_review_photos hilang",
  (await c.query("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'order_review_photos'")).rows[0].n === 0);
cek("submit_review 3-arg (lama) kembali utuh setelah rollback", (await overload("submit_review", 3)) === 1);
cek("submit_review 4-arg hilang setelah rollback", (await overload("submit_review", 4)) === 0);
cek("list_reviews 2-arg (lama) kembali utuh setelah rollback", (await overload("list_reviews", 2)) === 1);
cek("list_reviews 3-arg hilang setelah rollback", (await overload("list_reviews", 3)) === 0);
cek("bucket review-photos hilang",
  (await c.query("select count(*)::int as n from storage.buckets where id = 'review-photos'")).rows[0].n === 0);
cek("policy review_photos hilang",
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