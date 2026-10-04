/**
 * Uji harga paket per JENIS MAKANAN (kategori), bukan per rasa.
 *
 *   node scripts/test-category-bundles.mjs
 *
 * Contoh: jenis "Sando Sandwich" @ Rp18.000 dengan paket 2 = 35.000
 * dan 4 = 65.000.
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
const check = t.check;
const client = new Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();

const asUser = makeRunner(client);
const admin = await adminClaims(client);
const anon = { role: "anon" };

// ================================================================
// Setup: pastikan ada jenis "Sando Sandwich" dengan 5 rasa di dalamnya
// ================================================================
const { rows: mainRows } = await client.query(
  `select id from public.categories where slug = 'sando-sandwich';`
);
const MAIN = mainRows[0]?.id;
if (!MAIN) {
  console.error("Kategori 'Sando Sandwich' tidak ada. Jalankan db:push dulu.");
  await client.end();
  process.exit(1);
}

const setTiers = (tiers) =>
  asUser(
    "authenticated",
    admin,
    `select public.admin_save_category(
       jsonb_build_object('id', $1::bigint, 'name_id', 'Sando Sandwich',
                          'bundle_tiers', $2::jsonb));`,
    [String(MAIN), JSON.stringify(tiers)]
  );

await resetAll(client, { bundles: [] });
await setTiers([
  { qty: 2, price: 35000 },
  { qty: 4, price: 65000 },
]);

const F1 = await activeFlavorId(client, 0);
const F2 = await activeFlavorId(client, 1);
const F3 = await activeFlavorId(client, 2);
console.log(`\n  jenis   : Sando Sandwich (id=${MAIN}), satuan Rp18.000`);
console.log(`  rasa uji: ${F1}, ${F2}, ${F3}`);
console.log("  paket    : 2 = Rp35.000, 4 = Rp65.000\n");

const order = async (label, items) => {
  const r = await asUser(
    "anon",
    anon,
    `select public.create_order($1,$2,'cash','pickup',null,null,null,null,'id',$3::jsonb);`,
    [
      label,
      `0812${String(Math.floor(Math.random() * 90000) + 10000)}`,
      JSON.stringify(items.map(([id, qty]) => ({ flavor_id: id, quantity: qty }))),
    ]
  );
  return r.ok ? r.rows[0].create_order : { error: r.error };
};

// ================================================================
console.log("=== 1. Paket dihitung per jenis, bukan per rasa ===");
for (const c of [
  { items: [[F1, 1]], expect: 18000, label: "1 pcs" },
  { items: [[F1, 2]], expect: 35000, label: "2 pcs rasa sama -> paket 2" },
  { items: [[F1, 3]], expect: 53000, label: "3 pcs -> paket 2 + 1 biasa" },
  { items: [[F1, 4]], expect: 65000, label: "4 pcs -> paket 4" },
  { items: [[F1, 5]], expect: 83000, label: "5 pcs -> paket 4 + 1" },
  { items: [[F1, 6]], expect: 100000, label: "6 pcs -> paket 4 + paket 2" },
  { items: [[F1, 8]], expect: 130000, label: "8 pcs -> paket 4 x2" },
]) {
  const o = await order(`Paket ${c.label}`, c.items);
  const ok = o.total_price === c.expect;
  check(
    `${c.label.padEnd(30)} = Rp${String(c.expect).padStart(6)}`,
    ok,
    ok ? "" : `dapat Rp${o.total_price} (${o.error ?? ""})`
  );
}

// ================================================================
console.log("\n=== 2. Rasa berbeda dalam 1 jenis = tetap ikut paket ===");
const m1 = await order("Campur 1-1", [[F1, 1], [F2, 1]]);
check("2 rasa berbeda (2 pcs) = paket Rp35.000", m1.total_price === 35000, `dapat Rp${m1.total_price}`);

const m2 = await order("Campur 2-1", [[F1, 1], [F2, 1], [F3, 1]]);
check("3 rasa berbeda (3 pcs) = paket 2 + 1 = Rp53.000", m2.total_price === 53000, `dapat Rp${m2.total_price}`);

const m3 = await order("Campur 2-2", [[F1, 2], [F2, 2]]);
check("2 rasa, masing-masing 2 pcs = 4 pcs = paket 4 = Rp65.000", m3.total_price === 65000, `dapat Rp${m3.total_price}`);

// ================================================================
console.log("\n=== 3. Dua jenis berbeda = paket dihitung terpisah ===");
// Buang sisa kategori uji dari run sebelumnya supaya test bisa diulang.
const { rows: stale } = await client.query(
  `select id from public.categories where slug = 'croissant';`
);
for (const cat of stale) {
  await client.query(`update public.flavors set category_id = $1 where category_id = $2;`, [
    String(MAIN),
    cat.id,
  ]);
  await asUser("authenticated", admin, `select public.admin_delete_category($1);`, [
    String(cat.id),
  ]);
}
check("sisa kategori uji dibersihkan", true);

const cat2Res = await asUser("authenticated", admin, `select public.admin_save_category(
  jsonb_build_object('name_id','Croissant','name_en','Croissant',
    'desc_id','Ragilementer','bundle_tiers','[]'::jsonb,'sort_order',2));`);
const cat2Id = cat2Res.ok ? cat2Res.rows[0]?.admin_save_category?.id : null;
check("jenis kedua dibuat", Boolean(cat2Id), cat2Res.error ?? "");

if (cat2Id) {
  const fRes = await asUser("authenticated", admin, `select public.admin_save_flavor(
    jsonb_build_object('name_id','Croissant Mentega','price',15000,
      'category_id', $1::bigint,'sort_order',1));`, [String(cat2Id)]);
  const CF = fRes.ok ? fRes.rows[0]?.admin_save_flavor?.id : null;
  check("rasa di jenis kedua dibuat", Boolean(CF), fRes.error ?? "");

  if (CF) {
    const two = await order("Dua jenis", [[F1, 2], [CF, 1]]);
    check("2 sando (paket 35k) + 1 croissant (satuan 15k) = Rp50.000",
      two.total_price === 50000, `dapat Rp${two.total_price}`);

    // Beri croissant paket sendiri
    await asUser("authenticated", admin, `select public.admin_save_category(
      jsonb_build_object('id', $1::bigint, 'name_id','Croissant',
        'bundle_tiers','[{"qty":2,"price":28000}]'::jsonb));`, [String(cat2Id)]);
    const both = await order("Dua jenis ada paket", [[F1, 2], [CF, 2]]);
    check("kedua jenis punya paket sendiri: 35k + 28k = Rp63.000",
      both.total_price === 63000, `dapat Rp${both.total_price}`);

    await asUser("authenticated", admin, `select public.admin_delete_flavor($1);`, [String(CF)]);
    await asUser("authenticated", admin, `select public.admin_delete_category($1);`, [String(cat2Id)]);
    check("jenis uji dibersihkan", true);
  }
}

// ================================================================
console.log("\n=== 4. Paket yang tidak menguntungkan diabaikan ===");
await setTiers([{ qty: 3, price: 60000 }]); // 3 x 18.000 = Rp54.000 normalnya
const notWorth = await order("TidakUntung", [[F1, 3]]);
check("paket 3 pcs Rp60.000 (normalnya Rp54.000) diabaikan",
  notWorth.total_price === 54000, `dapat Rp${notWorth.total_price}`);

// ================================================================
console.log("\n=== 5. Isian tidak valid dibuang ===");
await setTiers([
  { qty: 1, price: 5000 },   // qty < 2 -> buang
  { qty: 2, price: 35000 },
  { qty: 0, price: 1000 },   // tidak valid -> buang
  { qty: 4, price: -500 },   // harga negatif -> buang
]);
const { rows: catRows } = await client.query(
  `select bundle_tiers from public.categories where id = $1;`,
  [String(MAIN)]
);
const kept = catRows[0]?.bundle_tiers ?? [];
check("paket qty<2 / harga<0 otomatis dibuang",
  kept.length === 1 && kept[0].qty === 2 && kept[0].price === 35000,
  JSON.stringify(kept));

// ================================================================
console.log("\n=== 6. Simpan dari dashboard Menu ===");
const saved = await asUser("authenticated", admin, `select public.admin_save_category(
  jsonb_build_object('id', $1::bigint, 'name_id','Sando Sandwich',
    'bundle_tiers','[{"qty":2,"price":33000},{"qty":10,"price":160000}]'::jsonb));`,
  [String(MAIN)]);
check("paket bisa disimpan dari layar jenis makanan", saved.ok, saved.error ?? "");

const p10 = await order("Paket10", [[F1, 10]]);
check("10 pcs pakai paket 10 = Rp160.000", p10.total_price === 160000, `dapat Rp${p10.total_price}`);

await setTiers([
  { qty: 2, price: 35000 },
  { qty: 4, price: 65000 },
]);

// ================================================================
console.log("\n=== 7. Paket tidak lagi ada di tabel flavors ===");
const { rows: colRows } = await client.query(`
  select count(*)::int as n from information_schema.columns
  where table_schema='public' and table_name='flavors' and column_name='bundle_tiers';`);
check("flavors.bundle_tiers sudah dihapus (paket milik jenis)", colRows[0].n === 0, `n=${colRows[0].n}`);

const { rows: catCol } = await client.query(`
  select count(*)::int as n from information_schema.columns
  where table_schema='public' and table_name='categories' and column_name='bundle_tiers';`);
check("categories.bundle_tiers ada", catCol[0].n === 1, `n=${catCol[0].n}`);

// ================================================================
console.log("\n=== 8. Menu publik mengirim paket per jenis ===");
const menu = await asUser("anon", anon, `select public.public_menu();`);
const first = menu.rows[0]?.public_menu?.[0];
check("kategori membawa bundle_tiers",
  Array.isArray(first?.bundle_tiers) && first.bundle_tiers.length > 0,
  JSON.stringify(first?.bundle_tiers));
check("rasa tidak lagi membawa bundle_tiers",
  Boolean(first?.flavors?.[0]) && !("bundle_tiers" in first.flavors[0]));

// ================================================================
console.log("\n=== 9. Otorisasi ===");
const anonSet = await asUser("anon", anon, `select public.admin_save_category(
  jsonb_build_object('name_id','Pajah','bundle_tiers','[]'::jsonb));`);
check("anon tidak bisa ubah paket jenis", !anonSet.ok, anonSet.error ?? "");

// ================================================================
console.log("\n=== 10. Kembalikan ke nilai siap-jualan ===");
await client.query(`delete from public.orders;`);
await client.query(`alter sequence public.order_code_seq restart with 1;`);
await client.query(
  `update public.categories
   set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
   where is_active;`
);
await client.query(`
  update public.store_settings set total_stock = 20, max_per_order = 20 where id = 1;`);

const { rows: finalRows } = await client.query(`
  select c.slug, c.bundle_tiers,
         (select count(*) from public.flavors f where f.category_id = c.id)::int as rasa
  from public.categories c order by c.id;`);
for (const r of finalRows) {
  console.log(`  ${r.slug}: ${r.rasa} rasa, ${r.bundle_tiers.length} paket`);
}

await client.end();
t.finish();
