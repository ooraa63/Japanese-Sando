/**
 * Uji harga paket PER PRODUK (bukan global).
 *   node scripts/test-flavor-bundles.mjs
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
await client.query(`
  update public.store_settings set
    is_preorder_open = true, stock_enabled = true, total_stock = 100,
    max_per_order = 50, delivery_fee = 0, min_order = 1
  where id = 1;`);

// Paket default: 2 = 35.000, 4 = 65.000 (harga sando 18.000)
await client.query(`
  update public.flavors
  set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
  where price = 18000;`);

const { rows: flavors } = await client.query(`
  select id, name_id, price, bundle_tiers from public.flavors
  where is_active and price = 18000 order by id limit 2;`);

const sando = flavors[0];
const other = flavors[1];
console.log(`\n  produk uji: ${sando.name_id} (Rp${sando.price}) & ${other.name_id}`);
console.log(`  paket: ${JSON.stringify(sando.bundle_tiers)}`);

// ---------------------------------------------------------------- 1
console.log("\n=== 1. Paket milik produk sendiri ===");
console.log("  Harga satuan Rp18.000 | paket 2 = 35.000 | paket 4 = 65.000\n");

const orderOne = async (label, items) => {
  const r = await asUser("anon", anon,
    `select public.create_order($1,$2,'cash','pickup',null,null,null,null,'id',
       $3::jsonb);`,
    [label, `0812${String(Math.floor(Math.random() * 90000) + 10000)}`, JSON.stringify(items)]);
  return r.ok ? r.rows[0].create_order : { error: r.error };
};

const cases = [
  { n: 1, expect: 18000, label: "1 pcs  -> satuan" },
  { n: 2, expect: 35000, label: "2 pcs  -> paket 2" },
  { n: 3, expect: 53000, label: "3 pcs  -> paket 2 + 1 biasa" },
  { n: 4, expect: 65000, label: "4 pcs  -> paket 4" },
  { n: 5, expect: 83000, label: "5 pcs  -> paket 4 + 1 biasa" },
  { n: 6, expect: 100000, label: "6 pcs  -> paket 4 + paket 2" },
  { n: 8, expect: 130000, label: "8 pcs  -> paket 4 x2" },
];

for (const c of cases) {
  const o = await orderOne(`Paket ${c.n}`, [
    { flavor_id: sando.id, quantity: c.n },
  ]);
  const ok = o.total_price === c.expect;
  check(
    `${c.label.padEnd(32)} = Rp${String(c.expect).padStart(6)}`,
    ok,
    ok ? "" : `dapat Rp${o.total_price} (${o.error ?? ""})`
  );
}

// ---------------------------------------------------------------- 2
console.log("\n=== 2. Dua produk berbeda, paket terpisah ===");
const mixed1 = await orderOne("Campur 1-1", [
  { flavor_id: sando.id, quantity: 1 },
  { flavor_id: other.id, quantity: 1 },
]);
check("1 sando + 1 produk lain = 2 x satuan (Rp36.000)",
  mixed1.total_price === 36000, `dapat Rp${mixed1.total_price}`);

const mixed2 = await orderOne("Campur 2-1", [
  { flavor_id: sando.id, quantity: 2 },
  { flavor_id: other.id, quantity: 1 },
]);
check("2 sando (paket) + 1 produk lain = Rp35.000 + Rp18.000 = Rp53.000",
  mixed2.total_price === 53000, `dapat Rp${mixed2.total_price}`);

const mixed3 = await orderOne("Campur 2-2", [
  { flavor_id: sando.id, quantity: 2 },
  { flavor_id: other.id, quantity: 2 },
]);
check("2 sando + 2 produk lain = 2 paket terpisah = Rp70.000",
  mixed3.total_price === 70000, `dapat Rp${mixed3.total_price}`);

// ---------------------------------------------------------------- 3
console.log("\n=== 3. Produk tanpa paket ===");
await client.query(`update public.flavors set bundle_tiers = '[]'::jsonb where id = $1;`, [other.id]);
const noBundle = await orderOne("TanpaPaket", [{ flavor_id: other.id, quantity: 2 }]);
check("produk tanpa paket: 2 pcs = Rp36.000 (satuan)",
  noBundle.total_price === 36000, `dapat Rp${noBundle.total_price}`);
await client.query(`
  update public.flavors
  set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
  where id = $1;`, [other.id]);

// ---------------------------------------------------------------- 4
console.log("\n=== 4. Paket yang tidak menguntungkan diabaikan ===");
await client.query(`
  update public.flavors set bundle_tiers = '[{"qty":3,"price":60000}]'::jsonb
  where id = $1;`, [sando.id]);
const notWorth = await orderOne("TidakUntung", [{ flavor_id: sando.id, quantity: 3 }]);
check("paket 3 pcs = Rp60.000 (normalnya Rp54.000) diabaikan",
  notWorth.total_price === 54000, `dapat Rp${notWorth.total_price}`);

await client.query(`
  update public.flavors
  set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb
  where id = $1;`, [sando.id]);

// ---------------------------------------------------------------- 5
console.log("\n=== 5. Paket disimpan lewat admin_save_flavor ===");
const saved = await asUser("authenticated", admin, `select public.admin_save_flavor(
  jsonb_build_object(
    'id', $1::bigint, 'name_id', $2::text, 'price', 18000,
    'bundle_tiers', '[{"qty":2,"price":33000},{"qty":10,"price":160000}]'::jsonb
  ));`, [String(sando.id), sando.name_id]);
check("paket bisa disimpan dari halaman Menu", saved.ok, saved.error ?? "");

const { rows: after } = await client.query(
  `select bundle_tiers from public.flavors where id = $1;`, [sando.id]);
check("daftar paket tersimpan dengan benar",
  after[0].bundle_tiers.length === 2 && after[0].bundle_tiers[1].qty === 10,
  JSON.stringify(after[0].bundle_tiers));

const p10 = await orderOne("Paket10", [{ flavor_id: sando.id, quantity: 10 }]);
check("10 pcs pakai paket 10 = Rp160.000", p10.total_price === 160000, `dapat Rp${p10.total_price}`);

// Pulihkan
await client.query(`
  update public.flavors
  set bundle_tiers = '[{"qty":2,"price":35000},{"qty":4,"price":65000}]'::jsonb;`);

// ---------------------------------------------------------------- 6
console.log("\n=== 6. Menu publik membawa paket ===");
const menu = await asUser("anon", anon, `select public.public_menu();`);
const cat = menu.rows[0].public_menu[0];
const fl = cat?.flavors?.[0];
check("public_menu menyertakan bundle_tiers per rasa",
  Array.isArray(fl?.bundle_tiers) && fl.bundle_tiers.length === 2,
  JSON.stringify(fl?.bundle_tiers));

// ---------------------------------------------------------------- 7
console.log("\n=== 7. Otorisasi ===");
const anonSet = await asUser("anon", anon, `select public.admin_save_flavor(
  jsonb_build_object('name_id','Pajah','price',1000,'bundle_tiers','[]'::jsonb));`);
check("anon tidak bisa ubah paket", !anonSet.ok, anonSet.error ?? "");
const anonListUsers = await asUser("anon", anon, `select public.admin_list_users();`);
check("anon tidak bisa daftar akun admin", !anonListUsers.ok, anonListUsers.error ?? "");

// ---------------------------------------------------------------- 8
console.log("\n=== 8. Daftar akun admin ===");
const listUsers = await asUser("authenticated", admin, `select public.admin_list_users();`);
const users = listUsers.rows[0]?.admin_list_users ?? [];
check("daftar akun terbaca", Array.isArray(users) && users.length >= 1, JSON.stringify(users));
if (users[0]) {
  console.log(`  contoh: ${users[0].email} (${users[0].role}) aktif=${users[0].is_active}`);
}
const selfRevoke = await asUser("authenticated", admin,
  `select public.admin_revoke_user($1);`, [users[0]?.user_id ?? ""]);
check("admin terakhir tidak bisa dicabut aksesnya", !selfRevoke.ok, selfRevoke.error ?? "");

// Bersihkan
await client.query(`delete from public.orders;`);
await client.query(`alter sequence public.order_code_seq restart with 1;`);
await client.query(`
  update public.store_settings set
    total_stock = 20, max_per_order = 20, delivery_fee = 0, is_preorder_open = true
  where id = 1;`);

await client.end();
console.log(`\n${"=".repeat(52)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(52)}\n`);
process.exit(fail > 0 ? 1 : 0);
