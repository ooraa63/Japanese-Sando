/**
 * Uji bahwa pengaturan tidak terhapus saat sebagian field dikirim.
 *   node scripts/test-settings.mjs
 */
import { Client } from "pg";
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

const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name} ${extra}`); }
}

async function asUser(role, claims, sql, params = []) {
  await client.query("begin");
  try {
    await client.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify(claims), claims.sub ?? ""]
    );
    await client.query(`set local role ${role}`);
    const res = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, rows: res.rows, count: res.rowCount };
  } catch (e) {
    await client.query("rollback");
    return { ok: false, error: e.message };
  }
}

const { rows: adm } = await client.query(`select user_id from public.admins where is_active limit 1;`);
if (!adm.length) { console.error("Tidak ada admin."); await client.end(); process.exit(1); }
const admin = { sub: adm[0].user_id, role: "authenticated", aud: "authenticated" };
const anon = { role: "anon" };

const FIELDS = [
  "store_name", "whatsapp", "address", "total_stock", "delivery_fee",
  "bundle_price", "bundle_size", "pickup_note_id", "delivery_note_id",
  "min_order", "max_per_order", "hours_id", "is_preorder_open",
];

const readAll = async () => {
  const { rows } = await client.query(
    `select ${FIELDS.join(", ")} from public.store_settings where id = 1;`
  );
  return rows[0];
};

const setFixture = () =>
  client.query(`
    update public.store_settings set
      store_name = 'Rumakomugi',
      whatsapp = '628123456789',
      address = 'Vihara Tian En, Jl.buffers',
      total_stock = 25,
      delivery_fee = 5000,
      bundle_price = 35000,
      bundle_size = 2,
      pickup_note_id = 'Hanya Vihara Tian En & UVERS, jam 18-20',
      delivery_note_id = 'Ongkir ditanggung pembeli',
      min_order = 1,
      max_per_order = 20,
      hours_id = 'Setiap hari 18.00-20.00',
      is_preorder_open = true
    where id = 1;`);

// ---------------------------------------------------------------- 1
console.log("\n=== 1. Simpan sebagian field (tombol toggle pre-order) ===");
await setFixture();
const before = await readAll();
console.log(`  sebelum: nama="${before.store_name}" wa="${before.whatsapp}" stok=${before.total_stock} ongkir=${before.delivery_fee}`);

const toggled = await asUser("authenticated", admin,
  `select public.admin_save_settings(jsonb_build_object('is_preorder_open', false));`);
check("payload sebagian diterima", toggled.ok, toggled.error ?? "");

const after = await readAll();
check("nama toko tidak berubah", after.store_name === before.store_name, `"${after.store_name}"`);
check("nomor WhatsApp tidak berubah", after.whatsapp === before.whatsapp, `"${after.whatsapp}"`);
check("stok tidak di-reset", after.total_stock === before.total_stock, `${after.total_stock}`);
check("ongkir tidak di-reset", after.delivery_fee === before.delivery_fee, `${after.delivery_fee}`);
check("catatan ambil tidak terhapus", after.pickup_note_id === before.pickup_note_id, `"${after.pickup_note_id}"`);
check("catatan antar tidak terhapus", after.delivery_note_id === before.delivery_note_id, `"${after.delivery_note_id}"`);
check("harga paket tidak berubah", after.bundle_price === before.bundle_price, `${after.bundle_price}`);
check("hanya is_preorder_open yang berubah", after.is_preorder_open === false, `${after.is_preorder_open}`);

// ---------------------------------------------------------------- 2
console.log("\n=== 2. admin_toggle_preorder (fungsi khusus) ===");
const t2 = await asUser("authenticated", admin, `select public.admin_toggle_preorder(true);`);
check("toggle berhasil", t2.ok, t2.error ?? "");
const after2 = await readAll();
check("tidak ada field lain yang berubah", after2.whatsapp === before.whatsapp && after2.total_stock === before.total_stock);
check("pre-order kembali dibuka", after2.is_preorder_open === true);

// ---------------------------------------------------------------- 3
console.log("\n=== 3. Simpan field teks yang dikosongkan (harus bisa dihapus) ===");
const cleared = await asUser("authenticated", admin,
  `select public.admin_save_settings(jsonb_build_object('delivery_note_id', '', 'whatsapp', ''));`);
check("payload teks kosong diterima", cleared.ok, cleared.error ?? "");
const after3 = await readAll();
check("catatan antar bisa dikosongkan", after3.delivery_note_id === "", `"${after3.delivery_note_id}"`);
check("WhatsApp bisa dikosongkan", after3.whatsapp === "", `"${after3.whatsapp}"`);
check("field lain tetap", after3.store_name === before.store_name && after3.total_stock === before.total_stock);

// ---------------------------------------------------------------- 4
console.log("\n=== 4. Simpan banyak field sekaligus (form Pengaturan) ===");
const many = await asUser("authenticated", admin, `select public.admin_save_settings(
  jsonb_build_object(
    'store_name', 'Toko Baru',
    'whatsapp', '081999888777',
    'total_stock', 40,
    'delivery_fee', 7500,
    'bundle_size', 3,
    'bundle_price', 50000,
    'pickup_note_id', 'Ambil di gerai A',
    'is_preorder_open', true
  ));`);
check("banyak field sekaligus", many.ok, many.error ?? "");
const after4 = await readAll();
check("nama toko berubah", after4.store_name === "Toko Baru", `"${after4.store_name}"`);
check("WhatsApp berubah", after4.whatsapp === "081999888777", `"${after4.whatsapp}"`);
check("stok berubah", after4.total_stock === 40, `${after4.total_stock}`);
check("ongkir berubah", after4.delivery_fee === 7500, `${after4.delivery_fee}`);
check("ukuran paket berubah", after4.bundle_size === 3, `${after4.bundle_size}`);
check("harga paket berubah", after4.bundle_price === 50000, `${after4.bundle_price}`);
check("alamat lama tetap (tidak dikirim)", after4.address === before.address, `"${after4.address}"`);

// ---------------------------------------------------------------- 5
console.log("\n=== 5. Otorisasi ===");
const anonSave = await asUser("anon", anon, `select public.admin_save_settings(jsonb_build_object('store_name','Dibobol'));`);
check("anon tidak bisa ubah pengaturan", !anonSave.ok, anonSave.error ?? "");
const after5 = await readAll();
check("nama toko tetap aman", after5.store_name === "Toko Baru", `"${after5.store_name}"`);

const anonToggle = await asUser("anon", anon, `select public.admin_toggle_preorder(false);`);
check("anon tidak bisa toggle pre-order", !anonToggle.ok, anonToggle.error ?? "");

// ---------------------------------------------------------------- 6
console.log("\n=== 6. Kembalikan ke nilai siap-jualan ===");
await client.query(`
  update public.store_settings set
    store_name = 'Rumakomugi',
    whatsapp = '',
    total_stock = 20,
    delivery_fee = 0,
    bundle_enabled = true, bundle_size = 2, bundle_price = 35000,
    min_order = 1, max_per_order = 20,
    pickup_note_id = 'Hanya untuk Vihara Tian En dan UVERS, gratis ongkir. Pengambilan jam 18.00 - 20.00.',
    pickup_note_en = 'Only at Vihara Tian En and UVERS, free delivery. Pickup hours 18:00 - 20:00.',
    delivery_note_id = 'Ongkir ditanggung sendiri oleh pembeli.',
    delivery_note_en = 'Shipping costs are paid by the customer.',
    is_preorder_open = true,
    stock_enabled = true
  where id = 1;`);
const final = await readAll();
console.log(`  nama toko: ${final.store_name} | paket: ${final.bundle_size} pcs = Rp${final.bundle_price} | stok: ${final.total_stock}`);

await client.end();
console.log(`\n${"=".repeat(50)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
