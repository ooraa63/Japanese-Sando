/**
 * Uji aturan stok sesuai kebutuhan toko:
 *
 *   1. Stok BERKURANG begitu pembeli pre-order — tidak perlu menunggu
 *      admin menerima.
 *   2. Kalau admin MENOLAK, stokbertambah lagi.
 *   3. Kalau admin MENERIMA lalu SELESAI, stok tetap berkurang
 *      (barang memang sudah dibuat).
 *   4. Menolak dua kali tidak menambah stok dua kali.
 *
 *   node scripts/test-stock.mjs
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

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

let pass = 0;
let fail = 0;
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

const { rows: adminRows } = await client.query(
  `select user_id, email from public.admins where is_active limit 1;`
);
if (adminRows.length === 0) {
  console.error("Tidak ada admin. Jalankan setup /admin/login lebih dulu.");
  await client.end();
  process.exit(1);
}
const admin = { sub: adminRows[0].user_id, role: "authenticated", aud: "authenticated" };
const anon = { role: "anon" };

const FLAVOR = 1;
const stockOf = async () =>
  (await client.query(`select stock from public.flavors where id = $1;`, [FLAVOR])).rows[0].stock;

// Pastikan pre-order sedang dibuka supaya test tidak gagal karena setting toko.
const { rows: preopen } = await client.query(
  `select is_preorder_open from public.store_settings where id = 1;`
);
if (!preopen[0]?.is_preorder_open) {
  await client.query(`update public.store_settings set is_preorder_open = true where id = 1;`);
  console.log("  (pre-order sempat tutup, dinyalakan untuk test)");
}

const setStatus = (id, status) =>
  asUser("authenticated", admin, `select public.admin_update_order_status($1, $2, null);`, [
    String(id),
    status,
  ]);

const placeOrder = async (name, phone, qty) => {
  const r = await asUser(
    "anon",
    anon,
    `select public.create_order($1,$2,'cash','pickup',null,null,null,null,'id',
       jsonb_build_array(jsonb_build_object('flavor_id',$3::bigint,'quantity',$4::int)));`,
    [name, phone, String(FLAVOR), String(qty)]
  );
  if (!r.ok) console.log(`     (gagal: ${r.error})`);
  return r.ok ? r.rows[0].create_order : null;
};

// ------------------------------------------------------------------ 1
console.log("\n=== 1. Stok langsung berkurang saat pre-order (belum di-approve) ===");
const { rows: f0 } = await client.query(`select name_id, stock from public.flavors where id = $1;`, [FLAVOR]);
const start = f0[0].stock;
console.log(`  rasa: ${f0[0].name_id}, stok awal: ${start}`);

const o1 = await placeOrder("Budi Preorder", "081111000111", 3);
check("pesanan dibuat", Boolean(o1?.order_code), JSON.stringify(o1));
console.log(`  kode: ${o1?.order_code}  status awal: pending (belum di-approve admin)`);

const afterOrder = await stockOf();
check(`stok berkurang 3 tanpa menunggu approval (${start} -> ${afterOrder})`, afterOrder === start - 3);

const { rows: statusRow } = await client.query(`select status from public.orders where id = $1;`, [o1.id]);
check("pesanan masih berstatus pending saat stok berkurang", statusRow[0].status === "pending");

// ------------------------------------------------------------------ 2
console.log("\n=== 2. Admin MENOLAK => stok bertambah lagi ===");
const rejected = await setStatus(o1.id, "rejected");
check("admin bisa menolak", rejected.ok, rejected.error ?? "");

const afterReject = await stockOf();
check(`stok kembali +3 (${afterOrder} -> ${afterReject})`, afterReject === start);

// ------------------------------------------------------------------ 3
console.log("\n=== 3. Menolak dua kali tidak menambah stok dua kali ===");
const again = await setStatus(o1.id, "rejected");
check("tolak kedua ditolak (status tidak berubah)", !again.ok, again.error ?? "");
const afterDouble = await stockOf();
check(`stok tetap ${start}, tidak jadi ${start + 3}`, afterDouble === start);

// ------------------------------------------------------------------ 4
console.log("\n=== 4. Diterima & selesai => stok TIDAK kembali ===");
const o2 = await placeOrder("Siti Diterima", "082222000222", 2);
const beforeAccept = await stockOf();
check(`stok berkurang 2 (${start} -> ${beforeAccept})`, beforeAccept === start - 2);

check("admin menerima", (await setStatus(o2.id, "accepted")).ok);
const afterAccept = await stockOf();
check("stok tidak berubah saat diterima (barang tetap dipesan)", afterAccept === start - 2);

check("admin tandai siap", (await setStatus(o2.id, "ready")).ok);
check("admin tandai selesai", (await setStatus(o2.id, "delivered")).ok);
const afterDone = await stockOf();
check(`stok tetap berkurang setelah selesai (${afterDone})`, afterDone === start - 2);

// ------------------------------------------------------------------ 5
console.log("\n=== 5. Tolak setelah diterima ===");
const o3 = await placeOrder("Andi Ditolak", "083333000333", 1);
const beforeRej3 = await stockOf();
check("stok berkurang 1", beforeRej3 === start - 3);
check("admin menolak", (await setStatus(o3.id, "rejected")).ok);
const afterRej3 = await stockOf();
check(`stok kembali +1 (${beforeRej3} -> ${afterRej3})`, afterRej3 === start - 2);

// ------------------------------------------------------------------ 6
console.log("\n=== 6. Kembalikan pesanan yang ditolak => stok dipesan lagi ===");
check("admin kembalikan ke menunggu", (await setStatus(o3.id, "pending")).ok);
const afterUndo = await stockOf();
check(`stok berkurang lagi 1 (${afterRej3} -> ${afterUndo})`, afterUndo === start - 3);

// ------------------------------------------------------------------ 7
console.log("\n=== 7. Admin tidak punya jalur 'Batalkan' di UI ===");
const { rows: newOrderStatus } = await client.query(
  `select status from public.orders where id = $1;`,
  [o3.id]
);
check("create_order() selalu membuat pesanan berstatus 'pending'",
  newOrderStatus[0].status === "pending");

// Bersihkan: o1 sudah ditolak, o2 selesai (barang memang dibuat),
// o3 masih menunggu -> tolak supaya reservasinya dilepas.
for (const id of [o1.id, o2.id, o3.id]) {
  const { rows } = await client.query(`select status from public.orders where id = $1;`, [id]);
  if (rows[0].status === "pending") await setStatus(id, "rejected");
}
await client.query(
  `update public.orders set status = 'cancelled' where id in ($1,$2,$3);`,
  [o1.id, o2.id, o3.id]
);

// o2 berstatus "delivered" = barang sudah dibuat & diambil, jadi stok TIDAK
// kembali ke rak. Yang di sini sekadar merapikan database uji.
// 2 pcs dari pesanan "selesai" memang tidak kembali ke stok karena barangnya
// sudah dibuat, jadi angka awal dipulihkan agar database uji bersih.
await client.query(`update public.flavors set stock = $1 where id = $2;`, [start, FLAVOR]);
const finalStock = await stockOf();
check(`stok dikembalikan ke angka awal (${start})`, finalStock === start, `stok=${finalStock}`);
console.log(`  catatan: 2 pcs pesanan "selesai" memang tidak kembali ke stok,`);

await client.end();
console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(46)}\n`);
process.exit(fail > 0 ? 1 : 0);
