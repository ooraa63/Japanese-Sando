// =============================================================================
//  Siapkan data uji paket pilihan di produksi.
//
//  Steven 15-10-2026 menyetujui membuka "batch PO tes sebentar" supaya alur
//  /order bisa dicoba. Batch produksi yang ada (id 13) sudah lewat tanggal,
//  jadi halaman /order menampilkan "Belum ada batch PO" dan tidak ada apa pun
//  yang bisa dicoba.
//
//  Dua hal dibuat di sini:
//   1. Batch PO tes yang aktif HARI INI, dengan allowlist rasa dan stok.
//   2. Satu paket uji bermode PILIHAN, memakai 5 rasa yang sudah ada (Steven
//      memilih tidak menambah rasa baru dulu). Rasa 1-2 jadi Pilihan 1,
//      rasa 3-5 jadi Pilihan 2 -- jadi adaitelist yang saling lepas, dan
//      itulah yang membuktikan slot-nya benar-benar terikat ke pilihannya.
//
//  Skrip `bersihkan-paket-pilihan.mjs` membatalkan semua ini.
// =============================================================================
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { Client } from "pg";

pg.types.setTypeParser(20, (v) => Number(v));

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Sesi admin, dalam transaksi eksplisit (GUC claim itu transaction-local).
const adminUuid = (await c.query(
  "select user_id::text as u from public.admins where is_active limit 1"
)).rows[0];
if (!adminUuid) {
  console.log("GAGAL: tidak ada admin aktif");
  await c.end();
  process.exit(1);
}

const LABEL_BATCH = "Tes paket pilihan";
const NAMA_PAKET = "Uji Pilihan";

// Jangan sampai ada dua batch tes aktif kalau skrip dijalankan berulang.
const ada = (await c.query(
  "select id from public.po_batches where label = $1 and is_active limit 1",
  [LABEL_BATCH]
)).rows[0];
if (ada) {
  console.log("Sudah ada batch tes aktif (id " + ada.id + "). Jalankan skrip pembersih dulu.");
  await c.end();
  process.exit(1);
}

const kat = (await c.query("select id from public.categories order by id limit 1")).rows[0].id;
const rasa = (await c.query(
  "select id, name_id, price from public.flavors where is_active order by id"
)).rows;
if (rasa.length < 5) {
  console.log("GAGAL: butuh minimal 5 rasa aktif, ada " + rasa.length);
  await c.end();
  process.exit(1);
}

// Rasa 1-2 untuk Pilihan 1, sisanya untuk Pilihan 2. Dua daftar yang tidak
// beririsan: kalau pilihannya tidak benar-benar terpisah, tidak ada yang
// bisa gagal di UI.
const pilihan1 = rasa.slice(0, 2);
const pilihan2 = rasa.slice(2);

await c.query("begin");
await c.query("select set_config('request.jwt.claim.sub', $1, true)", [adminUuid.u]);

const batch = (
  await c.query(
    `insert into public.po_batches (label, open_at, close_at, pickup_date, is_active)
     values ($1, current_date - 1, current_date + 1, current_date, true)
     returning id`,
    [LABEL_BATCH]
  )
).rows[0].id;

await c.query(
  `insert into public.po_batch_stock (batch_id, category_id, stock) values ($1, $2, 100)`,
  [batch, kat]
);
for (const r of rasa) {
  await c.query(
    `insert into public.po_batch_flavors (batch_id, flavor_id, is_active) values ($1, $2, true)`,
    [batch, r.id]
  );
}

// Paket uji: 2 pilihan, masing-masing mengambil tepat satu rasa.
const hargaPaket = 32000;
const tersimpan = (await c.query("select public.admin_save_bundle($1::jsonb) as d", [
  JSON.stringify({
    name_id: NAMA_PAKET,
    name_en: NAMA_PAKET,
    desc_id: "Paket coba-coba mode pilihan. Akan dihapus setelah diuji.",
    desc_en: "Test pack for choice mode. Removed after testing.",
    price: hargaPaket,
    required_qty: 2,
    is_active: true,
    is_featured: false,
    sort_order: 999,
    flavor_ids: [],
    slots: [
      { label_id: "Pilihan 1", label_en: "Choice 1", flavor_ids: pilihan1.map((r) => r.id) },
      { label_id: "Pilihan 2", label_en: "Choice 2", flavor_ids: pilihan2.map((r) => r.id) },
    ],
  }),
])).rows[0].d;
const paket = tersimpan && tersimpan.id;

if (!paket) {
  await c.query("rollback");
  console.log("GAGAL: admin_save_bundle menolak, batch dibatalkan");
  await c.end();
  process.exit(1);
}

// Paket uji DAN Sando 2 ikut ditawarkan di batch tes, supaya Steven bisa
// membandingkan mode lama dan mode baru berdampingan.
for (const id of [paket, 1]) {
  await c.query(
    `insert into public.po_batch_bundles (batch_id, bundle_id, is_active)
     values ($1, $2, true) on conflict do nothing`,
    [batch, id]
  );
}

const cek = (await c.query(
  "select required_qty, is_fixed from public.bundles where id = $1",
  [paket]
)).rows[0];
const slot = (await c.query(
  `select s.slot_index, s.label_id,
          coalesce(array_agg(bsf.flavor_id::int order by bsf.flavor_id)
                   filter (where bsf.flavor_id is not null), '{}') as rasa
     from public.bundle_slots s
     left join public.bundle_slot_flavors bsf on bsf.bundle_slot_id = s.id
    where s.bundle_id = $1
    group by s.id, s.slot_index, s.label_id order by s.slot_index`,
  [paket]
)).rows;

await c.query("commit");

console.log("");
console.log("Data uji tersimpan:");
console.log("  batch   : " + batch + " (" + LABEL_BATCH + ")");
console.log("  paket   : " + paket + " (" + NAMA_PAKET + ") Rp" + hargaPaket);
console.log("  required_qty = " + cek.required_qty + ", is_fixed = " + cek.is_fixed);
for (const s of slot) {
  const nama = s.rasa.map((id) => (rasa.find((r) => r.id === id) || {}).name_id);
  console.log("  " + s.label_id + ": " + nama.join(", "));
}
console.log("");
console.log("Setelah selesai:  node scripts/bersihkan-paket-pilihan.mjs");

await c.end();