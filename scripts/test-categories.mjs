/**
 * Uji kategori makanan + harga paket custom (daftar paket bebas).
 *   node scripts/test-categories.mjs
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

await client.query(`delete from public.orders;`);
await client.query(`update public.store_settings set
  is_preorder_open = true, stock_enabled = true, total_stock = 100,
  max_per_order = 50, delivery_fee = 0, min_order = 1,
  bundle_enabled = true, bundle_tiers = '[]'::jsonb where id = 1;`);

const setTiers = (tiers) =>
  asUser("authenticated", admin,
    `select public.admin_save_settings(jsonb_build_object('bundle_tiers', $1::jsonb));`,
    [JSON.stringify(tiers)]);

const orderQty = async (name, phone, qty) => {
  const r = await asUser("anon", anon,
    `select public.create_order($1,$2,'cash','pickup',null,null,null,null,'id',
       jsonb_build_array(jsonb_build_object('flavor_id',1,'quantity',$3::int)));`,
    [name, phone, String(qty)]);
  return r.ok ? r.rows[0].create_order : { error: r.error };
};

// ---------------------------------------------------------------- 1
console.log("\n=== 1. Kategori ===");
const cats = await asUser("authenticated", admin, `select public.admin_list_categories();`);
const list = cats.rows[0].admin_list_categories;
check("ada minimal satu kategori", list.length >= 1, JSON.stringify(list.map(c => c.name_id)));
const sandwich = list.find((c) => c.slug === "sando-sandwich");
check("kategori 'Sando Sandwich' ada", Boolean(sandwich));
check("kategori punya 5 rasa", sandwich?.flavor_count === 5, `${sandwich?.flavor_count}`);

const menu = await asUser("anon", anon, `select public.public_menu();`);
const pubMenu = menu.rows[0].public_menu;
check("public_menu bisa dibaca tanpa login", pubMenu.length >= 1);
check("public_menu menyertakan daftar rasa", (pubMenu[0]?.flavors?.length ?? 0) === 5,
  `${pubMenu[0]?.flavors?.length}`);

// Tambah kategori baru
const newCat = await asUser("authenticated", admin, `select public.admin_save_category(
  jsonb_build_object('name_id','Croissant', 'name_en','Croissant',
    'desc_id','Ragilementer', 'desc_en','Buttery', 'sort_order', 2));`);
check("kategori baru bisa dibuat", newCat.ok && Boolean(newCat.rows[0]?.admin_save_category?.id),
  JSON.stringify(newCat).slice(0, 140));
if (!newCat.ok) console.log("  ERROR:", newCat.error);
const catId = newCat.rows?.[0]?.admin_save_category?.id;

// Tambah rasa ke kategori itu
const newFlavor = await asUser("authenticated", admin, `select public.admin_save_flavor(
  jsonb_build_object('name_id','Croissant Mentega','price',15000,
    'category_id', $1::bigint, 'sort_order', 1));`, [String(catId)]);
check("rasa bisa ditambahkan ke kategori baru", newFlavor.ok, JSON.stringify(newFlavor).slice(0, 140));
if (!newFlavor.ok) console.log("  ERROR:", newFlavor.error);
const flavorId = newFlavor.rows?.[0]?.admin_save_flavor?.id;

const menu2 = await asUser("anon", anon, `select public.public_menu();`);
const croissant = menu2.rows[0].public_menu.find((c) => c.name_id === "Croissant");
check("kategori baru muncul di menu publik", Boolean(croissant));
check("rasa baru ada di kategorinya", croissant?.flavors?.length === 1, JSON.stringify(croissant?.flavors?.map(f => f.name_id)));

// ---------------------------------------------------------------- 2
console.log("\n=== 2. Harga paket custom ===");
console.log("  Disetel: beli 2 = Rp35.000, beli 4 = Rp65.000\n");

await setTiers([
  { qty: 2, price: 35000 },
  { qty: 4, price: 65000 },
]);
const tiers = await asUser("anon", anon, `select public.public_bundle_tiers();`);
check("daftar paket tersimpan", tiers.rows[0].public_bundle_tiers.length === 2,
  JSON.stringify(tiers.rows[0].public_bundle_tiers));

// Harga sando = 18.000
const cases = [
  { n: 1, expect: 18000, label: "1 pcs" },
  { n: 2, expect: 35000, label: "2 pcs -> paket 2" },
  { n: 3, expect: 53000, label: "3 pcs -> paket 2 + 1" },
  { n: 4, expect: 65000, label: "4 pcs -> paket 4" },
  { n: 5, expect: 83000, label: "5 pcs -> paket 4 + 1" },
  { n: 6, expect: 100000, label: "6 pcs -> paket 4 + 1 + 1" },
  { n: 8, expect: 130000, label: "8 pcs -> paket 4 x2" },
];

for (const c of cases) {
  const o = await orderQty(`Paket ${c.n}`, `0811222${String(c.n).padStart(4, "0")}`, c.n);
  const ok = o.total_price === c.expect;
  check(
    `${c.label.padEnd(26)} = Rp${String(c.expect).padStart(6)}`,
    ok,
    ok ? "" : `dapat Rp${o.total_price} (${o.error ?? ""})`
  );
  if (ok) {
    const used = Array.isArray(o.bundles) ? o.bundles : [];
    const desc = used.length
      ? used.map((b) => `${b.qty}@${b.price}`).join(" + ")
      : "-";
    console.log(`         paket: ${desc} + ${o.leftover_count} biasa`);
  }
}

// ---------------------------------------------------------------- 3
console.log("\n=== 3. Paket yang tidak menguntungkan diabaikan ===");
await setTiers([{ qty: 3, price: 60000 }]); // 3 x 18.000 = 54.000, jadi lebih mahal
const notWorth = await orderQty("Tidak Untung", "08112220000", 3);
check("paket Rp60.000 untuk 3 pcs (b正常的 54.000) diabaikan",
  notWorth.total_price === 54000, `dapat Rp${notWorth.total_price}`);

await setTiers([{ qty: 1, price: 5000 }, { qty: 3, price: 50000 }]);
const badQty = await orderQty("Qty1", "08112220001", 3);
check("paket dengan qty 1 otomatis dibuang", badQty.total_price === 50000, `dapat Rp${badQty.total_price}`);

// ---------------------------------------------------------------- 4
console.log("\n=== 4. Paket dimatikan ===");
await setTiers([{ qty: 2, price: 35000 }]);
await asUser("authenticated", admin,
  `select public.admin_save_settings(jsonb_build_object('bundle_enabled', false));`);
const off = await orderQty("Mati", "08112220002", 2);
check("paket mati -> harga satuan (Rp36.000)", off.total_price === 36000, `dapat Rp${off.total_price}`);
await asUser("authenticated", admin,
  `select public.admin_save_settings(jsonb_build_object('bundle_enabled', true));`);

// ---------------------------------------------------------------- 5
console.log("\n=== 5. Otorisasi ===");
const anonSaveCat = await asUser("anon", anon,
  `select public.admin_save_category(jsonb_build_object('name_id','Pajah'));`);
check("anon tidak bisa buat kategori", !anonSaveCat.ok, anonSaveCat.error ?? "");
const anonList = await asUser("anon", anon, `select public.admin_list_categories();`);
check("anon tidak bisa daftar kategori", !anonList.ok, anonList.error ?? "");
const anonDel = await asUser("anon", anon, `select public.admin_delete_category($1);`, [String(catId)]);
check("anon tidak bisa hapus kategori", !anonDel.ok, anonDel.error ?? "");

// ---------------------------------------------------------------- 6
console.log("\n=== 6. Hapus kategori uji ===");
if (flavorId) {
  const delFlavor = await asUser("authenticated", admin, `select public.admin_delete_flavor($1);`, [String(flavorId)]);
  check("rasa uji bisa dihapus", delFlavor.ok, JSON.stringify(delFlavor).slice(0, 120));
}
if (catId) {
  const delCat = await asUser("authenticated", admin, `select public.admin_delete_category($1);`, [String(catId)]);
  check("kategori uji bisa dihapus", delCat.ok, JSON.stringify(delCat).slice(0, 120));
}
const after = await asUser("anon", anon, `select public.public_menu();`);
check("menu publik kembali ke 1 kategori", after.rows[0].public_menu.length === 1,
  `${after.rows[0].public_menu.length}`);

// ---------------------------------------------------------------- 7
console.log("\n=== 7. Cek harga paket tak terpakai (paket 1 & harga lebih mahal) ===");
await setTiers([{ qty: 2, price: 35000 }]);
const saved = await asUser("anon", anon, `select public.public_bundle_tiers();`);
check("paket tidak valid dibuang server-side",
  saved.rows[0].public_bundle_tiers.length === 1 &&
  saved.rows[0].public_bundle_tiers[0].qty === 2,
  JSON.stringify(saved.rows[0].public_bundle_tiers));

// Bersihkan
await client.query(`delete from public.orders;`);
await client.query(`alter sequence public.order_code_seq restart with 1;`);
await client.query(`update public.store_settings set
  total_stock = 20, max_per_order = 20, delivery_fee = 0,
  bundle_enabled = true, bundle_tiers = '[{"qty":2,"price":35000}]'::jsonb,
  is_preorder_open = true where id = 1;`);

await client.end();
console.log(`\n${"=".repeat(52)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(52)}\n`);
process.exit(fail > 0 ? 1 : 0);
