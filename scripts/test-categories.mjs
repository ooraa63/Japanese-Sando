/**
 * Uji kategori makanan (jenis makanan -> rasa).
 * Harga paket diuji terpisah di test-flavor-bundles.mjs.
 *   node scripts/test-categories.mjs
 */
import { Client } from "pg";
import {
  activeFlavorId,
  adminClaims,
  dbUrl,
  makeRunner,
  resetAll,
  tracker,
} from "./_testutil.mjs";

const t = tracker();
const client = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

const asUser = makeRunner(client);
const admin = await adminClaims(client);
const anon = { role: "anon" };

await resetAll(client, { bundles: [] });

// ================================================================
console.log("\n=== 1. Kategori ===");
const cats = await asUser("authenticated", admin, `select public.admin_list_categories();`);
const list = cats.rows[0].admin_list_categories;
t.check("ada minimal satu kategori", list.length >= 1, JSON.stringify(list.map((c) => c.name_id)));

const sandwich = list.find((c) => c.slug === "sando-sandwich");
t.check("kategori 'Sando Sandwich' ada", Boolean(sandwich));
t.check("kategori punya 5 rasa", sandwich?.flavor_count === 5, `${sandwich?.flavor_count}`);

const menu = await asUser("anon", anon, `select public.public_menu();`);
const pubMenu = menu.rows[0].public_menu;
t.check("public_menu bisa dibaca tanpa login", pubMenu.length >= 1);
t.check("public_menu menyertakan daftar rasa", (pubMenu[0]?.flavors?.length ?? 0) === 5,
  `${pubMenu[0]?.flavors?.length}`);

// ================================================================
console.log("\n=== 2. Tambah kategori & rasa ===");
const newCat = await asUser("authenticated", admin, `select public.admin_save_category(
  jsonb_build_object('name_id','Croissant', 'name_en','Croissant',
    'desc_id','Ragilementer', 'desc_en','Buttery', 'sort_order', 2));`);
t.check("kategori baru bisa dibuat", newCat.ok && Boolean(newCat.rows[0]?.admin_save_category?.id),
  newCat.error ?? "");
const catId = newCat.rows?.[0]?.admin_save_category?.id;

const newFlavor = await asUser("authenticated", admin, `select public.admin_save_flavor(
  jsonb_build_object('name_id','Croissant Mentega','price',15000,
    'category_id', $1::bigint, 'sort_order', 1));`, [String(catId)]);
t.check("rasa bisa ditambahkan ke kategori baru", newFlavor.ok, newFlavor.error ?? "");
const flavorId = newFlavor.rows?.[0]?.admin_save_flavor?.id;

const menu2 = await asUser("anon", anon, `select public.public_menu();`);
const croissant = menu2.rows[0].public_menu.find((c) => c.name_id === "Croissant");
t.check("kategori baru muncul di menu publik", Boolean(croissant));
t.check("rasa baru ada di kategorinya", croissant?.flavors?.length === 1,
  JSON.stringify(croissant?.flavors?.map((f) => f.name_id)));

// ================================================================
console.log("\n=== 3. Pindahkan rasa antar kategori ===");
const moved = await asUser("authenticated", admin, `select public.admin_save_flavor(
  jsonb_build_object('id', $1::bigint, 'name_id', $2::text,
    'price', 15000, 'category_id', $3::bigint));`,
  [String(flavorId), "Croissant Mentega", String(sandwich?.id ?? 1)]);
t.check("rasa bisa pindah kategori", moved.ok, moved.error ?? "");

const menu3 = await asUser("anon", anon, `select public.public_menu();`);
const s2 = menu3.rows[0].public_menu.find((c) => c.slug === "sando-sandwich");
t.check("rasa pindah ke kategori baru & ikut hilang dari yang lama",
  s2?.flavors?.length === 6, `jumlah=${s2?.flavors?.length}`);
t.check("kategori lama jadi kosong",
  (menu3.rows[0].public_menu.find((c) => c.name_id === "Croissant")?.flavors?.length ?? 0) === 0);

// Kembalikan
await asUser("authenticated", admin, `select public.admin_save_flavor(
  jsonb_build_object('id', $1::bigint, 'name_id', $2::text,
    'price', 15000, 'category_id', $3::bigint));`,
  [String(flavorId), "Croissant Mentega", String(catId)]);

// ================================================================
console.log("\n=== 4. Slug ganda ditolak ===");
const dupCat = await asUser("authenticated", admin, `select public.admin_save_category(
  jsonb_build_object('name_id','Croissant'));`);
t.check("nama kategori yang sama ditolak", !dupCat.ok && /slug_taken/.test(dupCat.error ?? ""),
  dupCat.error ?? "");

// ================================================================
console.log("\n=== 5. Otorisasi ===");
const anonSaveCat = await asUser("anon", anon,
  `select public.admin_save_category(jsonb_build_object('name_id','Pajah'));`);
t.check("anon tidak bisa buat kategori", !anonSaveCat.ok, anonSaveCat.error ?? "");

const anonList = await asUser("anon", anon, `select public.admin_list_categories();`);
t.check("anon tidak bisa daftar kategori", !anonList.ok, anonList.error ?? "");

const anonDel = await asUser("anon", anon, `select public.admin_delete_category($1);`, [String(catId)]);
t.check("anon tidak bisa hapus kategori", !anonDel.ok, anonDel.error ?? "");

const anonFlavor = await asUser("anon", anon, `select public.admin_save_flavor(
  jsonb_build_object('name_id','Pajah','price',1000));`);
t.check("anon tidak bisa tambah rasa", !anonFlavor.ok, anonFlavor.error ?? "");

// ================================================================
console.log("\n=== 6. Hapus kategori uji ===");
if (flavorId) {
  const delFlavor = await asUser("authenticated", admin, `select public.admin_delete_flavor($1);`,
    [String(flavorId)]);
  t.check("rasa uji bisa dihapus", delFlavor.ok, delFlavor.error ?? "");
}
if (catId) {
  const delCat = await asUser("authenticated", admin, `select public.admin_delete_category($1);`,
    [String(catId)]);
  t.check("kategori uji bisa dihapus", delCat.ok, delCat.error ?? "");
}
const after = await asUser("anon", anon, `select public.public_menu();`);
t.check("menu publik kembali ke 1 kategori", after.rows[0].public_menu.length === 1,
  `${after.rows[0].public_menu.length}`);
t.check("jumlah rasa kembali normal", (after.rows[0].public_menu[0]?.flavors?.length ?? 0) === 5,
  `${after.rows[0].public_menu[0]?.flavors?.length}`);

// ================================================================
await client.query(`delete from public.orders;`);
await client.query(`
  update public.store_settings set total_stock = 20, max_per_order = 20
  where id = 1;`);
const usedFlavor = await activeFlavorId(client);
void usedFlavor;

await client.end();
t.finish();
