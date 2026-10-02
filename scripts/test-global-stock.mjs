/**
 * Uji aturan stok GLOBAL (bukan per rasa) + batch pre-order.
 *
 *   node scripts/test-global-stock.mjs
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

const { rows: admins } = await client.query(`select user_id, email from public.admins where is_active limit 1;`);
if (!admins.length) { console.error("Tidak ada admin."); await client.end(); process.exit(1); }
const admin = { sub: admins[0].user_id, role: "authenticated", aud: "authenticated" };
const anon = { role: "anon" };

// Bersihkan & siapkan
await client.query(`delete from public.orders;`);
await client.query(`delete from public.batches where label <> 'Arsip';`);
await client.query(`update public.store_settings set is_preorder_open = true, stock_enabled = true, total_stock = 10, delivery_fee = 5000 where id = 1;`);

const totalStock = async () =>
  (await client.query(`select total_stock, stock_enabled from public.store_settings where id=1;`)).rows[0];

const order = async (name, phone, delivery, address, items) => {
  const r = await asUser("anon", anon,
    `select public.create_order($1,$2,'cash',$3,$4,null,null,$5,'id',
       $6::jsonb);`,
    [name, phone, delivery, address, `test ${name}`,
     JSON.stringify(items.map(i => ({ flavor_id: i[0], quantity: i[1] })))]);
  return r.ok ? r.rows[0].create_order : { error: r.error };
};
const setStatus = (id, st) =>
  asUser("authenticated", admin, `select public.admin_update_order_status($1,$2,null);`, [String(id), st]);

// ---------------------------------------------------------------- 1
console.log("\n=== 1. Stok GLOBAL: satu angka untuk semua rasa ===");
console.log("  stok awal: 10 (berlaku untuk SEMUA rasa)");

const a = await order("Andi", "081111000001", "pickup", null, [[1, 2]]);
check("pesanan 2 pcs Cookies & Cream dibuat", Boolean(a.order_code), JSON.stringify(a));
console.log(`  sisa stok setelah order: ${(await totalStock()).total_stock}`);
check("stok berkurang 2 (10 -> 8)", (await totalStock()).total_stock === 8);

const b = await order("Budi", "081111000002", "pickup", null, [[3, 1]]);
check("pesanan 1 pcs Choco Matcha (rasa lain) dibuat", Boolean(b.order_code));
console.log(`  sisa stok setelah order: ${(await totalStock()).total_stock}`);
check("stok juga berkurang untuk rasa lain (8 -> 7)", (await totalStock()).total_stock === 7);

// ---------------------------------------------------------------- 2
console.log("\n=== 2. Stok tidak boleh minus ===");
// Maks per rasa dinaikkan supaya batas global yang diuji, bukan batas per rasa.
await client.query(`update public.store_settings set max_per_order = 50 where id=1;`);
const tooMuch = await order("Candra", "081111000003", "pickup", null, [[1, 9]]);
check("order melebihi stok ditolak", !tooMuch.order_code && /insufficient_stock/.test(tooMuch.error ?? ""),
  tooMuch.error ?? "");
check("stok tetap 7 setelah order ditolak", (await totalStock()).total_stock === 7);
await client.query(`update public.store_settings set max_per_order = 20 where id=1;`);

// ---------------------------------------------------------------- 3
console.log("\n=== 3. Tolak => stok kembali ===");
check("tolak pesanan Budi", (await setStatus(b.id, "rejected")).ok);
check("stok kembali +1 (7 -> 8)", (await totalStock()).total_stock === 8);
check("tolak dua kali tidak menambah dua kali",
  !(await setStatus(b.id, "rejected")).ok);
check("stok tetap 8", (await totalStock()).total_stock === 8);

// ---------------------------------------------------------------- 4
console.log("\n=== 4. Diterima & selesai => stok tidak kembali ===");
check("terima pesanan Andi", (await setStatus(a.id, "accepted")).ok);
check("siap", (await setStatus(a.id, "ready")).ok);
check("selesai", (await setStatus(a.id, "delivered")).ok);
check("stok tetap 8 (barang sudah dibuat)", (await totalStock()).total_stock === 8);

// ---------------------------------------------------------------- 5
console.log("\n=== 5. Batch otomatis ===");
const batches = await asUser("authenticated", admin, `select public.admin_list_batches();`);
const open = batches.rows[0].admin_list_batches.find((x) => x.is_open);
check("ada batch terbuka", Boolean(open), JSON.stringify(batches.rows[0]?.admin_list_batches?.slice(0,2)));
console.log(`  batch: ${open?.label} | ${open?.order_count} pesanan | ${open?.item_count} pcs | ${open?.revenue} revenue`);

const { rows: withBatch } = await client.query(
  `select o.order_code, o.batch_id, bt.label from public.orders o
   left join public.batches bt on bt.id = o.batch_id order by o.id;`);
check("pesanan punya batch", withBatch.every((x) => x.label !== null),
  JSON.stringify(withBatch));

const summary = await asUser("authenticated", admin, `select public.admin_batch_summary($1);`, [String(open.id)]);
const s = summary.rows[0].admin_batch_summary;
console.log(`  ringkasan batch: ${s.total_orders} pesanan, ${s.total_items} pcs, ${s.revenue} revenue`);
console.log(`  per rasa: ${JSON.stringify(s.by_flavor)}`);
console.log(`  ambil/diantar: ${JSON.stringify(s.by_delivery)}`);
check("daftar produksi per rasa ada", s.by_flavor.length > 0, JSON.stringify(s));
check("total item batch benar (2 + 1 = 3)", s.total_items === 3, `total_items=${s.total_items}`);
check("semua pesanan ambil di tempat", s.by_delivery.pickup === 2, JSON.stringify(s.by_delivery));

// ---------------------------------------------------------------- 6
console.log("\n=== 6. Tutup batch ===");
check("batch bisa ditutup", (await asUser("authenticated", admin,
  `select public.admin_close_batch($1);`, [String(open.id)])).ok);
const afterClose = await asUser("authenticated", admin, `select public.admin_list_batches();`);
const newOpen = afterClose.rows[0].admin_list_batches.find((x) => x.is_open);
check("batch baru otomatis dibuat setelah ditutup", Boolean(newOpen) && newOpen.id !== open.id,
  JSON.stringify(afterClose.rows[0].admin_list_batches.map(x => ({ l: x.label, o: x.is_open }))));

const c = await order("Dewi", "081111000004", "pickup", null, [[2, 1]]);
const { rows: batchOfC } = await client.query(
  `select bt.label from public.orders o join public.batches bt on bt.id=o.batch_id where o.id=$1;`, [c.id]);
check("pesanan baru masuk ke batch baru", batchOfC[0]?.label === newOpen?.label,
  `${batchOfC[0]?.label} vs ${newOpen?.label}`);

// ---------------------------------------------------------------- 7
console.log("\n=== 7. Kirim (delivery) ===");
await client.query(`update public.store_settings set total_stock = 20 where id=1;`);
const noAddr = await order("Eko", "081111000005", "delivery", null, [[1, 1]]);
check("delivery tanpa alamat ditolak", !noAddr.order_code && /address_required/.test(noAddr.error ?? ""),
  noAddr.error ?? "");
const withAddr = await order("Eko", "081111000005", "delivery", "Jl. Merdeka No. 1, Jakarta", [[1, 1]]);
check("delivery dengan alamat berhasil", Boolean(withAddr.order_code), JSON.stringify(withAddr));
check("ongkir ditambahkan (delivery_fee 5000)", withAddr.total_price === 18000 + 5000,
  `total=${withAddr.total_price}`);

// ---------------------------------------------------------------- 8
console.log("\n=== 8. Stok dimatikan = tak terbatas ===");
await client.query(`update public.store_settings set stock_enabled = false, total_stock = 0, max_per_order = 50 where id=1;`);
const unlimited = await order("Fajar", "081111000006", "pickup", null, [[1, 30]]);
check("order 30 pcs berhasil saat stok mati", Boolean(unlimited.order_code), JSON.stringify(unlimited));
check("stok tidak jadi minus", (await totalStock()).total_stock === 0);
await client.query(`update public.store_settings set max_per_order = 20 where id=1;`);

// Bersihkan
await client.query(`update public.store_settings set stock_enabled = true, total_stock = 20, delivery_fee = 0, is_preorder_open = true where id=1;`);
await client.query(`delete from public.orders;`);
await client.query(`delete from public.batches where label <> 'Arsip';`);

await client.end();
console.log(`\n${"=".repeat(50)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(50)}\n`);
process.exit(fail > 0 ? 1 : 0);
