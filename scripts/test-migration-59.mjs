// =============================================================================
//  Uji migration-59 tanpa menyentuh produksi: jalankan isinya di
//  BEGIN ... ROLLBACK.
//
//  Yang diuji:
//   1. Skema: `bundle_slots` + `bundle_slot_flavors`, constraint, cascade, RLS.
//   2. Helper `bundle_slot_groups()` menghasilkan bentuk JSON yang benar.
//   3. `admin_save_bundle` menolak pilihan kosong, rasa yang tidak ada, dan
//      lebih dari 10 pilihan -- semua dengan `invalid_bundle_slots`.
//   4. Menyimpan pilihan menyinkronkan `required_qty` dan memaksa `is_fixed`
//      jadi false.
//   5. Payload TANPA kunci `slots` tidak menyentuh `bundle_slots` (paket lama
//      tidak ikut berubah), dan `slots: []` mengembalikan ke mode biasa.
//   6. Label kosong diisi otomatis jadi "Pilihan N" / "Choice N".
//   7. `admin_list_bundles()` dan `public_menu()` mengirim daftar pilihan.
//   8. `create_order`: slot ke-i HANYA boleh memakai rasa dari daftar pilihan
//      ke-i. Rasa dari pilihan lain ditolak, jumlah slot tetap diperiksa.
//   9. Rasa yang sama boleh dipakai di dua pilihan berbeda (keputusan Steven).
//  10. Paket tanpa daftar pilihan tetap memakai aturan `bundle_flavors` lama.
//  11. Setelah ROLLBACK semua kembali persis ke semula.
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { Client } from "pg";

// bigint (OID 20) bawaan `pg` dikembalikan sebagai STRING. Id di database ini
// kecil semua, jadi diubah jadi number sekarang juga. Tanpa ini, `x.id === kat`
// diam-diam gagal karena satu sisi number satu sisi string -- dan gejalanya
// muncul jauh dari penyebabnya.
pg.types.setTypeParser(20, (v) => Number(v));

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
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

/** Jalankan fungsi yang HARUS gagal, lalu kembali ke savepoint. */
let sp = 0;
async function harusGagal(nama, regex, sql, param) {
  const namaSp = "sp" + ++sp;
  await c.query("savepoint " + namaSp);
  let pesan = "";
  let tertangkap = false;
  try {
    await c.query(sql, param);
  } catch (e) {
    tertangkap = true;
    pesan = String(e.message || e);
  }
  await c.query("rollback to savepoint " + namaSp);
  await c.query("release " + namaSp);
  cek(nama, tertangkap && regex.test(pesan), tertangkap ? pesan.slice(0, 90) : "TERIMA (tidak error!)");
}

const adminUuid = (await c.query("select user_id::text as u from public.admins where is_active limit 1"))
  .rows[0];
if (!adminUuid) {
  console.log("GAGAL: tidak ada admin aktif untuk tes sesi admin");
  await c.end();
  process.exit(1);
}

const adaFungsi = async (nama) =>
  (await c.query(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = $1`,
    [nama]
  )).rows[0].n;

const adaTabel = async (nama) =>
  (await c.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = $1`,
    [nama]
  )).rows[0].n;

console.log("=== 0. Sebelum migration ===");

// Kalau migration-59 sudah terpasang di database yang dipakai, asersi
// "tabel belum ada" memang tidak bisa Expectations. Menandainya GAGAL akan
// menyesatkan: yang gagal adalah ekspektasi test-nya, bukan fungsinya.
// Dicek di sini, lalu pemeriksaan "setelah rollback" dibandingkan dengan
// kondisi AWAL, bukan dengan ketiadaan tabel.
const snapshot = async () => ({
  bundle_slots: await adaTabel("bundle_slots"),
  bundle_slot_flavors: await adaTabel("bundle_slot_flavors"),
  bundle_slot_groups: await adaFungsi("bundle_slot_groups"),
  bundle_features: await adaFungsi("bundle_features"),
  policy: (
    await c.query(
      `select count(*)::int as n from pg_policies
        where schemaname = 'public' and tablename like 'bundle_slot%'`
    )
  ).rows[0].n,
});
const awal = await snapshot();
const SUDAH_TERPASANG = awal.bundle_slots === 1;

if (SUDAH_TERPASANG) {
  console.log("PERHATIAN: migration-59 sudah terpasang di database ini.");
  console.log("  Asersi 'tabel belum ada' dilewati (memang sudah ada), dan");
  console.log("  pemeriksaan setelah ROLLBACK dibandingkan dengan kondisi awal.");
  console.log("");
} else {
  cek("tabel bundle_slots belum ada", awal.bundle_slots === 0);
  cek("tabel bundle_slot_flavors belum ada", awal.bundle_slot_flavors === 0);
  cek("fungsi bundle_slot_groups belum ada", awal.bundle_slot_groups === 0);
  cek("fungsi bundle_features belum ada", awal.bundle_features === 0);
}

const bundleSebelum = (
  await c.query(`select count(*)::int as n, coalesce(sum(required_qty), 0)::int as qty from public.bundles`)
).rows[0];

const sql = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-59.sql"), "utf8");
await c.query("begin");
await c.query(sql);

// ---------------------------------------------------------------- 1. SKEMA
console.log("");
console.log("=== 1. Skema ===");
cek("tabel bundle_slots ada", (await adaTabel("bundle_slots")) === 1);
cek("tabel bundle_slot_flavors ada", (await adaTabel("bundle_slot_flavors")) === 1);

const kolomSlot = (
  await c.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'bundle_slots' order by column_name`
  )
).rows.map((r) => r.column_name);
cek(
  "kolom bundle_slots lengkap",
  ["bundle_id", "id", "label_en", "label_id", "slot_index"].every((k) => kolomSlot.includes(k)),
  kolomSlot.join(",")
);

const kolomSlotFlavor = (
  await c.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'bundle_slot_flavors' order by column_name`
  )
).rows.map((r) => r.column_name);
cek(
  "kolom bundle_slot_flavors lengkap",
  kolomSlotFlavor.join(",") === "bundle_slot_id,flavor_id",
  kolomSlotFlavor.join(",")
);

const cons = (
  await c.query(
    `select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid = 'public.bundle_slots'::regclass order by conname`
  )
).rows;
cek("ada UNIQUE (bundle_id, slot_index)",
  cons.some((r) => r.def.toLowerCase().includes("unique") && r.def.includes("slot_index")));
cek("ada CHECK slot_index >= 1",
  cons.some((r) => r.def.toLowerCase().includes("check") && /\b1\b/.test(r.def)));

const fk = (
  await c.query(
    `select confdeltype from pg_constraint
      where conrelid = 'public.bundle_slots'::regclass and contype = 'f'`
  )
).rows[0];
cek("bundle_slots FK ke bundles Pakai ON DELETE CASCADE", fk && fk.confdeltype === "c", fk ? fk.confdeltype : "tidak ada");

const fk2 = (
  await c.query(
    `select confdeltype from pg_constraint
      where conrelid = 'public.bundle_slot_flavors'::regclass and contype = 'f'`
  )
).rows;
cek("bundle_slot_flavors punya 2 FK cascade",
  fk2.length === 2 && fk2.every((r) => r.confdeltype === "c"),
  fk2.map((r) => r.confdeltype).join(","));

for (const t of ["bundle_slots", "bundle_slot_flavors"]) {
  const rls = (
    await c.query(`select relrowsecurity from pg_class where oid = to_regclass('public.' || $1)`, [t])
  ).rows[0];
  cek("RLS aktif di " + t, rls && rls.relrowsecurity === true);
}
const pol = (
  await c.query(
    `select tablename, policyname from pg_policies
      where schemaname = 'public' and tablename in ('bundle_slots','bundle_slot_flavors') order by tablename, policyname`
  )
).rows;
cek("empat policy RLS dibuat", pol.length === 4, pol.map((r) => r.tablename + "." + r.policyname).join(", "));

cek("fungsi bundle_slot_groups ada", (await adaFungsi("bundle_slot_groups")) === 1);

// Penanda kapabilitas untuk UI admin.
const fitur = (await c.query("select public.bundle_features() as d")).rows[0].d;
cek("bundle_features() melaporkan mode pilihan aktif",
  fitur && fitur.choices === true && fitur.max_choices === 10, JSON.stringify(fitur));
const grantHelper = await c.query(
  "select has_function_privilege('anon', 'public.bundle_slot_groups(bigint)', 'EXECUTE') as boleh"
);
cek("bundle_slot_groups boleh dipanggil anon (hanya membaca, tidak rahasia)",
  grantHelper.rows[0].boleh === true);

// ---------------------------------------------------------------- 2. DATA UJI
console.log("");
console.log("=== 2. Menyiapkan data uji ===");

const kat = (await c.query(`select id from public.categories order by id limit 1`)).rows[0].id;

// Tiga rasa sementara: A dan B kelompok satu, C kelompok dua. A sengaja
// dipakai di KEDUA kelompok supaya bisa diuji aturan "rasa boleh sama".
const buatRasa = async (slug, nama, harga) =>
  (
    await c.query(
      `insert into public.flavors (slug, name_id, name_en, price, category_id, is_active, stock_enabled, stock, sort_order)
       values ($1, $2, $2, $3, $4, true, true, 50, 999)
       returning id`,
      [slug, nama, harga, kat]
    )
  ).rows[0].id;

const rasaA = await buatRasa("uji-m59-a", "Uji A", 22000);
const rasaB = await buatRasa("uji-m59-b", "Uji B", 22000);
const rasaC = await buatRasa("uji-m59-c", "Uji C", 18000);
cek("tiga rasa uji dibuat", rasaA > 0 && rasaB > 0 && rasaC > 0, [rasaA, rasaB, rasaC].join(","));

// Batch PO sementara yang sedang BUKA hari ini, supaya create_order punya
// batch. Batch produksi yang ada sudah lewat tanggal.
const batch = (
  await c.query(
    `insert into public.po_batches (label, open_at, close_at, pickup_date, is_active)
     values ('Uji migrasi 59', current_date - 1, current_date + 1, current_date, true)
     returning id`
  )
).rows[0].id;
await c.query(
  `insert into public.po_batch_stock (batch_id, category_id, stock) values ($1, $2, 500)`,
  [batch, kat]
);
cek("batch uji dibuat dan punya stok", batch > 0, "batch=" + batch + " kat=" + kat);

await c.query("select set_config('request.jwt.claim.sub', $1, true)", [adminUuid.u]);

const simpan = async (payload) =>
  (await c.query("select public.admin_save_bundle($1::jsonb) as d", [JSON.stringify(payload)])).rows[0].d;

const pilih = (labelId, labelEn, ids) => ({ label_id: labelId, label_en: labelEn, flavor_ids: ids });

// ---------------------------------------------------------------- 3. VALIDASI
console.log("");
console.log("=== 3. admin_save_bundle menolak konfigurasi buruk ===");

await harusGagal(
  "pilihan dengan flavor_ids kosong DITOLAK",
  /invalid_bundle_slots/,
  "select public.admin_save_bundle($1::jsonb)",
  [JSON.stringify({
    name_id: "Uji Pilihan 59", price: 20000, required_qty: 2, is_active: true,
    slots: [pilih("Pilihan 1", "Choice 1", [rasaA]), pilih("Pilihan 2", "Choice 2", [])],
  })]
);

await harusGagal(
  "pilihan tanpa kunci flavor_ids DITOLAK",
  /invalid_bundle_slots/,
  "select public.admin_save_bundle($1::jsonb)",
  [JSON.stringify({
    name_id: "Uji Pilihan 59", price: 20000, required_qty: 1, is_active: true,
    slots: [{ label_id: "Pilihan 1" }],
  })]
);

await harusGagal(
  "rasa yang tidak ada DITOLAK",
  /invalid_bundle_slots/,
  "select public.admin_save_bundle($1::jsonb)",
  [JSON.stringify({
    name_id: "Uji Pilihan 59", price: 20000, required_qty: 1, is_active: true,
    slots: [pilih("Pilihan 1", "Choice 1", [99999999])],
  })]
);

await harusGagal(
  "lebih dari 10 pilihan DITOLAK",
  /invalid_bundle_slots/,
  "select public.admin_save_bundle($1::jsonb)",
  [JSON.stringify({
    name_id: "Uji Pilihan 59", price: 20000, required_qty: 11, is_active: true,
    slots: Array.from({ length: 11 }, (_, i) => pilih("Pilihan " + (i + 1), "Choice " + (i + 1), [rasaA])),
  })]
);

// ---------------------------------------------------------------- 4. SIMPAN
console.log("");
console.log("=== 4. Menyimpan paket dengan pilihan ===");

const hasilSimpan = await simpan({
  name_id: "Uji Pilihan 59", name_en: "Uji Pilihan 59",
  desc_id: "", desc_en: "",
  price: 20000, required_qty: 2,
  is_active: true, is_featured: false,
  flavor_ids: [], sort_order: 999,
  slots: [pilih("Pilihan 1", "Choice 1", [rasaA, rasaB]), pilih("Pilihan 2", "Choice 2", [rasaC, rasaA])],
});
const paketId = hasilSimpan && hasilSimpan.id;
cek("paket uji tersimpan", typeof paketId === "number" && paketId > 0, JSON.stringify(hasilSimpan));

const paket = (
  await c.query(`select required_qty, is_fixed, price from public.bundles where id = $1`, [paketId])
).rows[0];
cek("required_qty = jumlah pilihan (2)", paket.required_qty === 2, String(paket.required_qty));
cek("is_fixed dipaksa false", paket.is_fixed === false, String(paket.is_fixed));
cek("harga paket tidak ikut berubah (20000)", paket.price === 20000, String(paket.price));

const barisSlot = (
  await c.query(
    `select s.slot_index, s.label_id, s.label_en,
            coalesce(array_agg(bsf.flavor_id::int order by bsf.flavor_id) filter (where bsf.flavor_id is not null), '{}') as rasa
     from public.bundle_slots s
     left join public.bundle_slot_flavors bsf on bsf.bundle_slot_id = s.id
     where s.bundle_id = $1
     group by s.id, s.slot_index, s.label_id, s.label_en
     order by s.slot_index`,
    [paketId]
  )
).rows;
cek("dua baris slot tersimpan", barisSlot.length === 2, JSON.stringify(barisSlot.map((r) => r.slot_index)));
cek("slot 1 beranggotakan rasa A dan B",
  barisSlot[0] && JSON.stringify(barisSlot[0].rasa) === JSON.stringify([rasaA, rasaB].sort((a, b) => a - b)),
  JSON.stringify(barisSlot[0] && barisSlot[0].rasa));
cek("slot 2 beranggotakan rasa C dan A",
  barisSlot[1] && JSON.stringify(barisSlot[1].rasa) === JSON.stringify([rasaA, rasaC].sort((a, b) => a - b)),
  JSON.stringify(barisSlot[1] && barisSlot[1].rasa));

const helper = (
  await c.query("select public.bundle_slot_groups($1::bigint) as d", [paketId])
).rows[0].d;
cek("bundle_slot_groups mengirim 2 pilihan", Array.isArray(helper) && helper.length === 2, JSON.stringify(helper));
cek("bundle_slot_groups membawa index, label, dan rasa",
  helper[0] && helper[0].index === 1 && helper[0].label_id === "Pilihan 1" &&
  Array.isArray(helper[0].flavor_ids) && helper[0].flavor_ids.length === 2,
  JSON.stringify(helper[0]));
cek("helper mengembalikan array kosong untuk paket tanpa pilihan",
  JSON.stringify(
    (await c.query("select public.bundle_slot_groups(99999999::bigint) as d")).rows[0].d
  ) === "[]");

// ---------------------------------------------------------------- 5. BACKWARD COMPAT
console.log("");
console.log("=== 5. Paket lama tidak ikut berubah ===");

const paketLama = (await c.query(`select id, name_id, price, required_qty from public.bundles where is_active order by id limit 1`)).rows[0];
if (paketLama) {
  const hitung = async (id) => ({
    slot: (await c.query("select count(*)::int as n from public.bundle_slots where bundle_id = $1", [id])).rows[0].n,
    rasa: (await c.query("select count(*)::int as n from public.bundle_flavors where bundle_id = $1", [id])).rows[0].n,
    qty: (await c.query("select required_qty from public.bundles where id = $1", [id])).rows[0].required_qty,
  });
  const sebelum = await hitung(paketLama.id);

  // Simpan ulang TANPA kunci `slots` -- persis seperti klien admin lama,
  // dan seperti payload yang dikirim sebelum migration-59 ada.
  await simpan({
    id: paketLama.id,
    name_id: paketLama.name_id,
    price: paketLama.price,
    required_qty: paketLama.required_qty,
    is_active: true,
  });

  const sesudah = await hitung(paketLama.id);
  cek("payload tanpa `slots` tidak menyentuh bundle_slots",
    sebelum.slot === sesudah.slot, sebelum.slot + " -> " + sesudah.slot);
  cek("payload tanpa `slots` tidak mengubah required_qty",
    sebelum.qty === sesudah.qty, sebelum.qty + " -> " + sesudah.qty);
  cek("payload tanpa `slots` tidak menghapus bundle_flavors",
    sebelum.rasa === sesudah.rasa, sebelum.rasa + " -> " + sesudah.rasa);
} else {
  cek("ada paket lama untuk uji backward compat", false, "tidak ada bundle aktif");
}

// Label kosong harus diisi otomatis supaya pembeli tidak lihat label kosong.
await simpan({
  id: paketId, name_id: "Uji Pilihan 59", price: 20000, required_qty: 2,
  is_active: true, sort_order: 999,
  slots: [pilih("", "", [rasaA]), pilih("", "", [rasaC])],
});
const labelOtomatis = (
  await c.query("select label_id, label_en from public.bundle_slots where bundle_id = $1 order by slot_index", [paketId])
).rows;
cek("label kosong diisi jadi Pilihan N / Choice N",
  labelOtomatis[0].label_id === "Pilihan 1" && labelOtomatis[1].label_en === "Choice 2",
  JSON.stringify(labelOtomatis));

// Kembalikan isi yang benar untuk tahap create_order.
await simpan({
  id: paketId, name_id: "Uji Pilihan 59", price: 20000, required_qty: 2,
  is_active: true, sort_order: 999,
  slots: [pilih("Pilihan 1", "Choice 1", [rasaA, rasaB]), pilih("Pilihan 2", "Choice 2", [rasaC, rasaA])],
});
await c.query(
  `insert into public.po_batch_bundles (batch_id, bundle_id, is_active) values ($1, $2, true)`,
  [batch, paketId]
);

// ---------------------------------------------------------------- 6. DITAMPILKAN
console.log("");
console.log("=== 6. Daftar pilihan ikut terkirim ke klien ===");

const listAdmin = (
  await c.query("select public.admin_list_bundles() as d")
).rows[0].d;
const diAdmin = (listAdmin || []).find((b) => b.id === paketId);
cek("admin_list_bundles mengirim slots", diAdmin && Array.isArray(diAdmin.slots) && diAdmin.slots.length === 2,
  JSON.stringify(diAdmin && diAdmin.slots));
cek("admin_list_bundles tetap mengirim flavor_ids (backward compat)",
  diAdmin && Array.isArray(diAdmin.flavor_ids));
cek("admin_list_bundles mengirim is_fixed", diAdmin && diAdmin.is_fixed === false);

const menu = (await c.query("select public.public_menu() as d")).rows[0].d;
const menuAtas = (menu.bundles || []).find((b) => b.id === paketId);
const katMenu = (menu.categories || []).find((x) => x.id === kat);
const diKategori = ((katMenu && katMenu.bundles) || []).find((b) => b.id === paketId);
cek("public_menu mengirim slots di daftar atas",
  menuAtas && Array.isArray(menuAtas.slots) && menuAtas.slots.length === 2,
  JSON.stringify(menuAtas && menuAtas.slots));
cek("kategori uji ada di public_menu", Boolean(katMenu), "id=" + kat + " ada=" + JSON.stringify((menu.categories || []).map((x) => x.id)));
cek("paket uji muncul di daftar bundle kategori",
  Boolean(diKategori),
  JSON.stringify((katMenu && katMenu.bundles || []).map((b) => b.id + ":" + b.slug)));
cek("public_menu mengirim slots juga di daftar per kategori",
  diKategori && Array.isArray(diKategori.slots) && diKategori.slots.length === 2,
  JSON.stringify(diKategori));

// ---------------------------------------------------------------- 7. PEMESANAN
console.log("");
console.log("=== 7. create_order mengikat tiap slot ke pilihannya ===");

await c.query("select set_config('request.jwt.claim.sub', '', true)");

const pesan = async (slots) =>
  c.query(
    `select public.create_order(
       p_customer_name => 'Uji Pilihan 59',
       p_phone => '080000000000',
       p_payment_method => 'transfer',
       p_delivery_method => 'pickup',
       p_delivery_zone => 'pickup',
       p_bundles => $1::jsonb,
       p_po_batch_id => $2::bigint,
       p_pickup_date => current_date
     ) as d`,
    [JSON.stringify([{ bundle_id: paketId, slots }]), batch]
  );

const namaRasa = { [rasaA]: "Uji A", [rasaB]: "Uji B", [rasaC]: "Uji C" };

// Pilihan 1 harus dari {A, B}, pilihan 2 harus dari {C, A}.
const namaOrder = (id) => (namaRasa[id] ?? String(id));

const harusBerhasil = async (nama, slots) => {
  const namaSp = "sp" + ++sp;
  await c.query("savepoint " + namaSp);
  let hasil = null;
  let pesanError = "";
  try {
    hasil = (await pesan(slots)).rows[0].d;
  } catch (e) {
    pesanError = String(e.message || e);
  }
  await c.query("rollback to savepoint " + namaSp);
  await c.query("release " + namaSp);
  cek(nama, hasil !== null && hasil !== undefined, hasil ? "" : pesanError.slice(0, 90));
  return hasil;
};

// Rasanya sengaja dipakai ulang supaya urutannya diuji, bukan nama slot.
const urut = (s) => s.map((x) => namaOrder(x.flavor_id)).join(" + ");

await harusBerhasil("pilihan 1 dari A, pilihan 2 dari C", [
  { flavor_id: rasaA },
  { flavor_id: rasaC },
]);

await harusBerhasil("rasa yang sama boleh dipakai di dua pilihan (A + A)", [
  { flavor_id: rasaA },
  { flavor_id: rasaA },
]);

await harusGagal(
  "pilihan 1 memakai rasa dari pilihan 2 DITOLAK (C + C)",
  /flavor_unavailable/,
  `select public.create_order(
     p_customer_name => 'Uji Pilihan 59', p_phone => '080000000000',
     p_payment_method => 'transfer', p_delivery_method => 'pickup', p_delivery_zone => 'pickup',
     p_bundles => $1::jsonb, p_po_batch_id => $2::bigint, p_pickup_date => current_date)`,
  [JSON.stringify([{ bundle_id: paketId, slots: [{ flavor_id: rasaC }, { flavor_id: rasaC }] }]), batch]
);

await harusGagal(
  "pilihan 2 memakai rasa yang hanya ada di pilihan 1 DITOLAK (A + B)",
  /flavor_unavailable/,
  `select public.create_order(
     p_customer_name => 'Uji Pilihan 59', p_phone => '080000000000',
     p_payment_method => 'transfer', p_delivery_method => 'pickup', p_delivery_zone => 'pickup',
     p_bundles => $1::jsonb, p_po_batch_id => $2::bigint, p_pickup_date => current_date)`,
  [JSON.stringify([{ bundle_id: paketId, slots: [{ flavor_id: rasaA }, { flavor_id: rasaB }] }]), batch]
);

await harusGagal(
  "jumlah slot tidak sama jumlah pilihan DITOLAK (hanya A)",
  /invalid_quantity/,
  `select public.create_order(
     p_customer_name => 'Uji Pilihan 59', p_phone => '080000000000',
     p_payment_method => 'transfer', p_delivery_method => 'pickup', p_delivery_zone => 'pickup',
     p_bundles => $1::jsonb, p_po_batch_id => $2::bigint, p_pickup_date => current_date)`,
  [JSON.stringify([{ bundle_id: paketId, slots: [{ flavor_id: rasaA }] }]), batch]
);

// ---------------------------------------------------------------- 8. ISI ORDER
console.log("");
console.log("=== 8. Rincian order menyimpan slot dengan benar ===");

const orderuji = (
  await pesan([{ flavor_id: rasaA }, { flavor_id: rasaC }])
).rows[0].d;
const orderId = orderuji && orderuji.order_id;
cek("create_order mengembalikan order_id", typeof orderId === "number" && orderId > 0,
  JSON.stringify(orderuji));

if (orderId) {
  const isiBundle = (
    await c.query(
      `select bi.slot, bi.flavor_id from public.bundle_items bi
        where bi.order_id = $1 order by bi.slot`,
      [orderId]
    )
  ).rows;
  cek("bundle_items menyimpan 2 baris dengan slot urut",
    isiBundle.length === 2 && isiBundle[0].slot === 1 && isiBundle[1].slot === 2,
    JSON.stringify(isiBundle));
  cek("slot 1 = A, slot 2 = C",
    isiBundle[0] && isiBundle[0].flavor_id === rasaA && isiBundle[1] && isiBundle[1].flavor_id === rasaC,
    urut([{ flavor_id: isiBundle[0] && isiBundle[0].flavor_id }, { flavor_id: isiBundle[1] && isiBundle[1].flavor_id }]));

  const item = (
    await c.query(
      `select flavor_name, unit_price, line_total from public.order_items
        where order_id = $1 order by id`,
      [orderId]
    )
  ).rows;
  cek("nama item memuat nomor slot",
    item.length === 2 && /#1\)$/.test(item[0].flavor_name) && /#2\)$/.test(item[1].flavor_name),
    JSON.stringify(item.map((x) => x.flavor_name)));
  cek("harga paket dibagi rata ke tiap slot (20000 / 2)",
    item.every((x) => x.unit_price === 10000 && x.line_total === 10000),
    JSON.stringify(item.map((x) => x.unit_price)));

  const order = (
    await c.query(`select subtotal, item_count from public.orders where id = $1`, [orderId])
  ).rows[0];
  cek("subtotal = harga paket (20000)", order.subtotal === 20000, String(order.subtotal));
  cek("item_count = jumlah pilihan (2)", order.item_count === 2, String(order.item_count));
}

// ---------------------------------------------------------------- 9. MODE LAMA
console.log("");
console.log("=== 9. Paket tanpa daftar pilihan tetap pakai aturan lama ===");

// Kembali jadi admin: create_order tidak butuh admin, tapi
// menyimpan paket baru di bagian ini butuh sesi admin.
await c.query("select set_config('request.jwt.claim.sub', $1, true)", [adminUuid.u]);

const paketFlat = await simpan({
  name_id: "Uji Rata 59", name_en: "Uji Rata 59",
  price: 20000, required_qty: 2, is_active: true, sort_order: 998,
  flavor_ids: [rasaA, rasaC],
});
const flatId = paketFlat && paketFlat.id;
await c.query(
  `insert into public.po_batch_bundles (batch_id, bundle_id, is_active) values ($1, $2, true)`,
  [batch, flatId]
);
const flatSlot = (
  await c.query("select count(*)::int as n from public.bundle_slots where bundle_id = $1", [flatId])
).rows[0].n;
cek("paket rata tidak punya baris slot", flatSlot === 0, String(flatSlot));

const flatHelper = (
  await c.query("select public.bundle_slot_groups($1::bigint) as d", [flatId])
).rows[0].d;
cek("helper mengembalikan array kosong untuk paket rata", JSON.stringify(flatHelper) === "[]");

// Paket rata harus tetap bisa dibeli lewat whitelist `bundle_flavors` biasa.
// Dibuat dengan savepoint sendiri supaya kalau ternyata ditolak, pesan
// errornya ikut ditampilkan -- bukan hanya "harusnya diterima".
const namaSp = "sp" + ++sp;
await c.query("savepoint " + namaSp);
let pesanFlat = "";
try {
  await c.query(
    `select public.create_order(
       p_customer_name => 'Uji Rata 59', p_phone => '080000000000',
       p_payment_method => 'transfer', p_delivery_method => 'pickup', p_delivery_zone => 'pickup',
       p_bundles => $1::jsonb, p_po_batch_id => $2::bigint, p_pickup_date => current_date)`,
    [JSON.stringify([{ bundle_id: flatId, slots: [{ flavor_id: rasaA }, { flavor_id: rasaC }] }]), batch]
  );
  cek("paket rata: A + C dari whitelist DITERIMA", true);
  await c.query("rollback to savepoint " + namaSp);
} catch (e) {
  pesanFlat = String(e.message || e);
  cek("paket rata: A + C dari whitelist DITERIMA", false, pesanFlat.slice(0, 120));
  await c.query("rollback to savepoint " + namaSp);
}
await c.query("release " + namaSp);

await harusGagal(
  "paket rata: rasa di luar whitelist DITOLAK (A + B)",
  /flavor_unavailable/,
  `select public.create_order(
     p_customer_name => 'Uji Rata 59', p_phone => '080000000000',
     p_payment_method => 'transfer', p_delivery_method => 'pickup', p_delivery_zone => 'pickup',
     p_bundles => $1::jsonb, p_po_batch_id => $2::bigint, p_pickup_date => current_date)`,
  [JSON.stringify([{ bundle_id: flatId, slots: [{ flavor_id: rasaA }, { flavor_id: rasaB }] }]), batch]
);

// ---------------------------------------------------------------- 10. RLS
console.log("");
console.log("=== 10. RLS benar-benar menolak tulis dari peran publik ===");

// Penting: perintah yang gagal membatalkan transaksi, jadi `reset role`
// harus dilakukan lewat `rollback to savepoint`, bukan dipanggil terpisah
// setelah error. `set local role` ikut kembali ke peran semula saat rollback.
const spBaca = "sp" + ++sp;
await c.query("savepoint " + spBaca);
await c.query("set local role anon");
try {
  const baca = await c.query("select count(*)::int as n from public.bundle_slots");
  cek("anon boleh MEMBACA bundle_slots", baca.rows[0].n >= 2, String(baca.rows[0].n));
} catch (e) {
  cek("anon boleh MEMBACA bundle_slots", false, String(e.message || e));
}
const spTulis = "sp" + ++sp;
await c.query("savepoint " + spTulis);
let tulisDitolak = false;
let pesanTulis = "";
try {
  await c.query(
    "insert into public.bundle_slots (bundle_id, slot_index, label_id, label_en) values ($1, 99, 'x', 'x')",
    [paketId]
  );
} catch (e) {
  pesanTulis = String(e.message || e);
  tulisDitolak = /row-level security|permission denied/i.test(pesanTulis);
}
await c.query("rollback to savepoint " + spTulis);
await c.query("release " + spTulis);
cek("anon TIDAK boleh menulis bundle_slots", tulisDitolak, pesanTulis.slice(0, 90));

await c.query("rollback to savepoint " + spBaca);
await c.query("release " + spBaca);
const sudahPostgres = (await c.query("select current_user as u")).rows[0].u;
cek("peran kembali ke postgres setelah rollback", sudahPostgres === "postgres", sudahPostgres);

// ---------------------------------------------------------------- 11. ROLLBACK
console.log("");
console.log("=== 11. Setelah ROLLBACK ===");
await c.query("rollback");

// Setelah ROLLBACK, kondisi skema harus PERSIS seperti sebelum test dimulai --
// entah itu "belum ada" (database belum punya migration) atau "sudah ada"
// (sudah terpasang). Yang diuji adalah "tidak ada yang berubah", bukan
// "harus hilang".
const akhir = await snapshot();
cek("kondisi skema kembali persis seperti sebelum test",
  JSON.stringify(akhir) === JSON.stringify(awal),
  JSON.stringify(awal) + " -> " + JSON.stringify(akhir));
cek("empat fungsi yang diganti masih ada",
  (await adaFungsi("admin_save_bundle")) === 1 &&
  (await adaFungsi("admin_list_bundles")) === 1 &&
  (await adaFungsi("public_menu")) === 1 &&
  (await adaFungsi("create_order")) === 1);
cek("rasa uji tidak tersisa", (await c.query(`select count(*)::int as n from public.flavors where slug like 'uji-m59-%'`)).rows[0].n === 0);
cek("paket uji tidak tersisa",
  (await c.query(`select count(*)::int as n from public.bundles where name_id like 'Uji %59'`)).rows[0].n === 0);
cek("batch uji tidak tersisa",
  (await c.query(`select count(*)::int as n from public.po_batches where label = 'Uji migrasi 59'`)).rows[0].n === 0);
cek("jumlah paket dan total required_qty kembali seperti semula",
  JSON.stringify((await c.query(`select count(*)::int as n, coalesce(sum(required_qty),0)::int as qty from public.bundles`)).rows[0]) ===
  JSON.stringify(bundleSebelum));

console.log("");
console.log("=== RINGKASAN ===");
console.log(ok + " OK, " + gagal + " GAGAL");
await c.end();
process.exit(gagal === 0 ? 0 : 1);