/**
 * Uji harga paket: setiap N pcs jadi satu paket harga tetap.
 *   1 pcs -> 18.000
 *   2 pcs -> 35.000
 *   3 pcs -> 53.000
 *   4 pcs -> 70.000
 *   5 pcs -> 88.000
 *
 *   node scripts/test-bundle.mjs
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

async function asUser(role, claims, sql, params = [], persist = true) {
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

const { rows: admins } = await client.query(`select user_id from public.admins where is_active limit 1;`);
if (!admins.length) { console.error("Tidak ada admin."); await client.end(); process.exit(1); }
const admin = { sub: admins[0].user_id, role: "authenticated", aud: "authenticated" };
const anon = { role: "anon" };

await client.query(`delete from public.orders;`);
await client.query(`update public.store_settings set
  is_preorder_open = true, stock_enabled = true, total_stock = 100,
  max_per_order = 50, delivery_fee = 0,
  bundle_enabled = true, bundle_size = 2, bundle_price = 35000 where id = 1;`);

const orderQty = async (name, phone, items) => {
  const r = await asUser("anon", anon,
    `select public.create_order($1,$2,'cash','pickup',null,null,null,null,'id',$3::jsonb);`,
    [name, phone, JSON.stringify(items.map(([fid, q]) => ({ flavor_id: fid, quantity: q })))]);
  return r.ok ? r.rows[0].create_order : { error: r.error };
};

// ---------------------------------------------------------------- 1
console.log("\n=== 1. Harga paket sesuai aturan ===");
console.log("  Aturan: 2 pcs = Rp35.000, satuan Rp18.000\n");

const cases = [
  { items: [[1, 1]], expect: 18000, label: "1 pcs" },
  { items: [[1, 2]], expect: 35000, label: "2 pcs (1 paket)" },
  { items: [[1, 3]], expect: 53000, label: "3 pcs (1 paket + 1 biasa)" },
  { items: [[1, 4]], expect: 70000, label: "4 pcs (2 paket)" },
  { items: [[1, 5]], expect: 88000, label: "5 pcs (2 paket + 1)" },
  { items: [[1, 6]], expect: 105000, label: "6 pcs (3 paket)" },
  { items: [[1, 7]], expect: 123000, label: "7 pcs (3 paket + 1)" },
];

for (const c of cases) {
  const o = await orderQty(`Paket ${c.label}`, `0811000${String(c.items[0][1]).padStart(4, "0")}`, c.items);
  const ok = o.total_price === c.expect;
  check(
    `${c.label.padEnd(28)} = Rp${String(c.expect).padStart(6)}`,
    ok,
    ok ? "" : `dapat Rp${o.total_price} (${o.error ?? ""})`
  );
  if (ok) {
    console.log(`         breakdown: ${o.bundle_count} paket × 35.000 + ${o.leftover_count} biasa`);
  }
}

// ---------------------------------------------------------------- 2
console.log("\n=== 2. Paket bisa campur rasa ===");
const mixed = await orderQty("Campur", "0811009999", [[1, 1], [3, 1]]);
check("1 Cookies + 1 Choco (2 pcs beda rasa) = Rp35.000",
  mixed.total_price === 35000, `dapat Rp${mixed.total_price}`);

const mixed3 = await orderQty("Campur3", "0811009998", [[1, 1], [3, 1], [2, 1]]);
check("3 pcs campur = Rp53.000", mixed3.total_price === 53000, `dapat Rp${mixed3.total_price}`);

// ---------------------------------------------------------------- 3
console.log("\n=== 3. Harga satuan tidak dikendalikan browser ===");
// Cobain kirim harga palsu — server harus pakai harga sendiri
const fake = await asUser("anon", anon,
  `select public.create_order('Palsu','0811008888','cash','pickup',null,null,null,null,'id',
     jsonb_build_array(
       jsonb_build_object('flavor_id',1,'quantity',2,'unit_price',1,'price',1,'line_total',2)
     ));`);
check("harga palsu diabaikan (tetap Rp35.000)",
  fake.ok && fake.rows[0].create_order.total_price === 35000,
  JSON.stringify(fake.rows[0]?.create_order?.total_price ?? fake.error));

// ---------------------------------------------------------------- 4
console.log("\n=== 4. Paket dimatikan ===");
await client.query(`update public.store_settings set bundle_enabled = false where id=1;`);
const noBundle = await orderQty("TanpaPaket", "0811007777", [[1, 2]]);
check("2 pcs tanpa paket = Rp36.000", noBundle.total_price === 36000, `dapat Rp${noBundle.total_price}`);
const noBundle3 = await orderQty("TanpaPaket3", "0811007776", [[1, 3]]);
check("3 pcs tanpa paket = Rp54.000", noBundle3.total_price === 54000, `dapat Rp${noBundle3.total_price}`);
await client.query(`update public.store_settings set bundle_enabled = true where id=1;`);

// ---------------------------------------------------------------- 5
console.log("\n=== 5. Harga paket tidak lebih mahal dari satuan ===");
await client.query(`update public.store_settings set bundle_price = 40000 where id=1;`);
const tooExpensive = await orderQty("Mahal", "0811006666", [[1, 2]]);
check("paket Rp40.000 (lebih mahal) diabaikan -> Rp36.000",
  tooExpensive.total_price === 36000, `dapat Rp${tooExpensive.total_price}`);
await client.query(`update public.store_settings set bundle_price = 35000 where id=1;`);

// ---------------------------------------------------------------- 6
console.log("\n=== 6. Ukuran paket lain (3 = 1 paket) ===");
await client.query(`update public.store_settings set bundle_size = 3, bundle_price = 50000 where id=1;`);
const size3a = await orderQty("Size3a", "0811005555", [[1, 3]]);
check("3 pcs dengan paket-3 = Rp50.000", size3a.total_price === 50000, `dapat Rp${size3a.total_price}`);
const size3b = await orderQty("Size3b", "0811005554", [[1, 6]]);
check("6 pcs dengan paket-3 = 2 paket = Rp100.000", size3b.total_price === 100000, `dapat Rp${size3b.total_price}`);
await client.query(`update public.store_settings set bundle_size = 2, bundle_price = 35000 where id=1;`);

// ---------------------------------------------------------------- 7
console.log("\n=== 7. Fungsi calc_bundle_price (dipakai frontend) ===");
for (const n of [1, 2, 3, 4, 5]) {
  const r = await asUser("authenticated", admin, `select public.calc_bundle_price($1);`, [String(n)]);
  const b = r.rows[0].calc_bundle_price;
  const expected = { 1: 18000, 2: 35000, 3: 53000, 4: 70000, 5: 88000 }[n];
  check(`calc_bundle_price(${n}) = Rp${expected}`,
    b.total === expected, `dapat Rp${b.total}`);
}

// ---------------------------------------------------------------- 8
console.log("\n=== 8. Batch sudah dihapus ===");
const { rows: batchCols } = await client.query(`
  select count(*)::int as n from information_schema.columns
  where table_schema='public' and table_name='orders' and column_name='batch_id';`);
check("kolom batch_id tidak ada lagi", batchCols[0].n === 0, `n=${batchCols[0].n}`);

const { rows: batchTbl } = await client.query(`
  select count(*)::int as n from information_schema.tables
  where table_schema='public' and table_name='batches';`);
check("tabel batches tidak ada lagi", batchTbl[0].n === 0, `n=${batchTbl[0].n}`);

// Bersihkan
await client.query(`delete from public.orders;`);
await client.query(`alter sequence public.order_code_seq restart with 1;`);
await client.query(`update public.store_settings set total_stock = 20, delivery_fee = 0,
  bundle_enabled = true, bundle_size = 2, bundle_price = 35000,
  max_per_order = 20, is_preorder_open = true where id=1;`);

await client.end();
console.log(`\n${"=".repeat(50)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
