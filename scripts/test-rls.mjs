/**
 * Uji logika otorisasi admin & RLS di level database dengan menyimulasikan
 * sesi PostgREST (JWT claims), tanpa perlu login lewat GoTrue.
 *
 *   node scripts/test-rls.mjs
 */
import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  OK   ${name}`); }
  else { fail++; console.log(`  GAGAL ${name} ${extra}`); }
}

/**
 * Jalankan query sebagai role Postgres tertentu dengan JWT Claims seperti
 * PostgREST. secara default di-rollback; set persist=true untuk menyimpan.
 */
async function asUser(role, claims, sql, params = [], persist = false) {
  if (!["anon", "authenticated"].includes(role)) throw new Error("role tidak diizinkan");
  await client.query("begin");
  try {
    await client.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify(claims), claims.sub ?? ""]
    );
    // `set local role` (bukan set_config) supaya RLS benar-benar dievaluasi
    // untuk role tersebut.
    await client.query(`set local role ${role}`);
    const res = await client.query(sql, params);
    if (persist) await client.query("commit");
    else await client.query("rollback");
    return { ok: true, rows: res.rows, count: res.rowCount };
  } catch (e) {
    await client.query("rollback");
    return { ok: false, error: e.message, code: e.code };
  }
}

/** Koneksi terpisah â€” dipakai untuk uji konkurensi sungguhan. */
async function asUserOn(conn, role, claims, sql, params = []) {
  await conn.query("begin");
  try {
    await conn.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true)`,
      [JSON.stringify(claims), claims.sub ?? ""]
    );
    await conn.query(`set local role ${role}`);
    const res = await conn.query(sql, params);
    await conn.query("commit");
    return { ok: true, rows: res.rows, count: res.rowCount };
  } catch (e) {
    await conn.query("rollback");
    return { ok: false, error: e.message };
  }
}


// ---------------------------------------------------------------- anon
console.log("\n=== 1. Perilaku anon (pembeli, tanpa login) ===");
const A = { role: "anon" };

const anonOrders = await asUser("anon", A, `select count(*)::int as n from public.orders;`);
check("anon tidak bisa membaca tabel pesanan", anonOrders.ok && anonOrders.rows[0].n === 0,
  JSON.stringify(anonOrders).slice(0, 200));

const anonFlavors = await asUser("anon", A, `select count(*)::int as n from public.flavors where is_active;`);
check("anon boleh membaca daftar rasa", anonFlavors.ok && anonFlavors.rows[0].n >= 5,
  JSON.stringify(anonFlavors).slice(0, 160));

const anonSettings = await asUser("anon", A, `select count(*)::int as n from public.store_settings;`);
check("anon boleh membaca pengaturan", anonSettings.ok && anonSettings.rows[0].n === 1);

// RLS menyaring baris, bukan melempar error -> yang diperiksa adalah jumlah baris
// yang benar-benar terpengaruh.
const anonWrite = await asUser(
  "anon",
  A,
  `update public.store_settings set store_name = 'Dibobol' where id = 1 returning store_name;`
);
check("anon TIDAK boleh mengubah pengaturan (0 baris terpengaruh)",
  anonWrite.ok && anonWrite.count === 0,
  `count=${anonWrite.count} err=${anonWrite.error ?? "-"}`);

const { rows: nameCheck } = await client.query(
  `select store_name from public.store_settings where id = 1;`
);
check("nama toko tetap utuh", nameCheck[0].store_name !== "Dibobol", nameCheck[0].store_name);

const anonStatus = await asUser("anon", A, `select public.admin_dashboard_stats();`);
check("anon tidak bisa memanggil statistik admin", !anonStatus.ok, anonStatus.error ?? "");

const anonDelete = await asUser("anon", A, `delete from public.flavors;`);
check("anon TIDAK boleh menghapus produk", anonDelete.ok && anonDelete.count === 0,
  `count=${anonDelete.count} err=${anonDelete.error ?? "-"}`);

const isAdminAnon = await asUser("anon", A, `select public.is_admin();`);
check("is_admin() = false untuk anon", isAdminAnon.ok && isAdminAnon.rows[0].is_admin === false);

// ---------------------------------------------------------------- admin
console.log("\n=== 2. Perilaku admin ===");
const { rows: adminRows } = await client.query(
  `select user_id, email from public.admins where is_active limit 1;`
);
if (adminRows.length === 0) {
  console.log("  Tidak ada admin. Jalankan scripts/_mkadmin.mjs lebih dulu.");
  await client.end();
  process.exit(1);
}
const adminId = adminRows[0].user_id;
console.log(`  admin: ${adminRows[0].email}`);
const adminClaims = { sub: adminId, role: "authenticated", aud: "authenticated" };

const isAdmin = await asUser("authenticated", adminClaims, `select public.is_admin();`);
check("is_admin() = true untuk admin", isAdmin.ok && isAdmin.rows[0].is_admin === true);

const adminOrders = await asUser("authenticated", adminClaims, `select count(*)::int as n from public.orders;`);
check("admin boleh membaca pesanan", adminOrders.ok && adminOrders.rows[0].n > 0,
  `n=${adminOrders.rows?.[0]?.n}`);

const stats = await asUser("authenticated", adminClaims, `select public.admin_dashboard_stats();`);
check("statistik dashboard berhasil", stats.ok && stats.rows[0].admin_dashboard_stats,
  JSON.stringify(stats).slice(0, 220));
if (stats.ok) {
  const s = stats.rows[0].admin_dashboard_stats;
  console.log(`  -> pending=${s.pending_orders} accepted=${s.accepted_orders} total=${s.total_orders}`);
  console.log(`  -> pendapatan hari ini=${s.revenue_today} bulan ini=${s.revenue_month}`);
  console.log(`  -> rasa aktif=${s.flavor_count} stok menipis=${s.low_stock.length} terlaris=${s.sales_by_flavor.length}`);
}

const list = await asUser("authenticated", adminClaims, `select public.admin_list_orders(null, null, 10, 0);`);
check("daftar pesanan berhasil diambil", list.ok && Array.isArray(list.rows[0].admin_list_orders?.orders),
  JSON.stringify(list).slice(0, 200));
if (list.ok) {
  const o = list.rows[0].admin_list_orders.orders?.[0];
  if (o) console.log(`  -> contoh: ${o.order_code} ${o.customer_name} ${o.status} items=${o.items?.length}`);
}

const saveSettings = await asUser(
  "authenticated",
  adminClaims,
  `select public.admin_save_settings(jsonb_build_object('store_name','Japanese Sando','min_order',1));`
);
check("admin boleh menyimpan pengaturan", saveSettings.ok, JSON.stringify(saveSettings).slice(0, 200));

// ------------------------------------------------------- non-admin
console.log("\n=== 3. User login tapi bukan admin ===");
const strangerId = crypto.randomUUID();
const strangerClaims = { sub: strangerId, role: "authenticated", aud: "authenticated" };

const strangerIsAdmin = await asUser("authenticated", strangerClaims, `select public.is_admin();`);
check("is_admin() = false untuk non-admin", strangerIsAdmin.ok && strangerIsAdmin.rows[0].is_admin === false);

const strangerOrders = await asUser("authenticated", strangerClaims, `select count(*)::int as n from public.orders;`);
check("non-admin tidak bisa membaca pesanan", strangerOrders.ok && strangerOrders.rows[0].n === 0,
  JSON.stringify(strangerOrders).slice(0, 160));

const strangerStats = await asUser("authenticated", strangerClaims, `select public.admin_dashboard_stats();`);
check("non-admin tidak bisa memanggil statistik", !strangerStats.ok, strangerStats.error ?? "");

const strangerFlavor = await asUser(
  "authenticated",
  strangerClaims,
  `insert into public.flavors (slug, name_id, name_en, price) values ('jejak-test','Jejak','Trace',1000) returning id;`
);
// Untuk INSERT, RLS melempar error alih-alih menyaring baris.
check("non-admin tidak bisa menambah produk",
  !strangerFlavor.ok || strangerFlavor.count === 0,
  `count=${strangerFlavor.count} err=${strangerFlavor.error ?? "-"}`);
if (strangerFlavor.ok && strangerFlavor.count > 0) {
  await client.query(`delete from public.flavors where slug = 'jejak-test';`);
}

// ------------------------------------------- alur status pesanan
console.log("\n=== 4. Alur status pesanan & gerakan stok ===");

const setStatus = (id, status, note = null) =>
  asUser("authenticated", adminClaims, `select public.admin_update_order_status($1, $2, $3);`, [
    String(id),
    status,
    note,
  ], true);

const stockOf = async (flavorId) => {
  const r = await client.query(`select stock from public.flavors where id = $1;`, [flavorId]);
  return r.rows[0].stock;
};

const before = await stockOf(3);
const created = await asUser(
  "anon",
  { role: "anon" },
  `select public.create_order(
     'Dewi Lestari', '081299887766', 'cash', 'pickup', null, null, null, 'catatan uji', 'id',
     jsonb_build_array(jsonb_build_object('flavor_id', 3, 'quantity', 3))
   );`,
  [],
  true
);
const newOrder = created.ok ? created.rows[0].create_order : null;
check("pesanan baru dibuat oleh anon", Boolean(newOrder?.order_code),
  JSON.stringify(created).slice(0, 200));
console.log(`  kode: ${newOrder?.order_code}  total: ${newOrder?.total_price}`);

const afterCreate = await stockOf(3);
check(`stok berkurang 3 (${before} -> ${afterCreate})`, afterCreate === before - 3);

check("admin bisa menerima pesanan", (await setStatus(newOrder.id, "accepted", "Diterima")).ok);
check("admin bisa menandai siap", (await setStatus(newOrder.id, "ready")).ok);
check("admin bisa menandai selesai", (await setStatus(newOrder.id, "delivered")).ok);

const statsAfter = await asUser("authenticated", adminClaims, `select public.admin_dashboard_stats();`);
const s2 = statsAfter.rows[0].admin_dashboard_stats;
check("pendapatan terhitung setelah pesanan selesai",
  Number(s2.revenue_today) === Number(newOrder.total_price),
  `pendapatan=${s2.revenue_today} total_pesanan=${newOrder.total_price}`);
check("daftar terlaris terisi", s2.sales_by_flavor.length > 0, JSON.stringify(s2.sales_by_flavor));
console.log(`  terlaris: ${JSON.stringify(s2.sales_by_flavor)}`);

const created2 = await asUser(
  "anon",
  { role: "anon" },
  `select public.create_order(
     'Andi Wijaya', '081377665544', 'cash', 'pickup', null, null, null, null, 'id',
     jsonb_build_array(jsonb_build_object('flavor_id', 3, 'quantity', 4))
   );`,
  [],
  true
);
const o2 = created2.rows[0].create_order;
const beforeReject = await stockOf(3);

check("admin bisa menolak pesanan", (await setStatus(o2.id, "rejected")).ok);
const afterReject = await stockOf(3);
check(`stok kembali +4 setelah ditolak (${beforeReject} -> ${afterReject})`,
  afterReject === beforeReject + 4);

check("pesanan bisa dikembalikan ke menunggu", (await setStatus(o2.id, "pending")).ok);
const afterUndo = await stockOf(3);
check(`stok dipesan ulang (${afterReject} -> ${afterUndo})`, afterUndo === beforeReject);

const bogus = await setStatus(o2.id, "entah");
check("status tidak valid ditolak", !bogus.ok, bogus.error ?? "");
const ghost = await setStatus(99999999, "accepted");
check("pesanan tidak ada ditolak", !ghost.ok, ghost.error ?? "");

// Bersihkan: lepaskan semua reservasi stok lewat RPC yang sama seperti aplikasi.
await setStatus(o2.id, "rejected");   // sudah dilepas sebelumnya, tidak ada efek
const rejectedAgain = await setStatus(o2.id, "rejected");
check("menolak dua kali tidak mengembalikan stok dua kali", !rejectedAgain.ok,
  rejectedAgain.error ?? "");
await setStatus(newOrder.id, "cancelled");
const finalStock = await stockOf(3);
check(`semua reservasi dilepas, stok kembali (${before})`, finalStock === before, `stok=${finalStock}`);

// Tandai pesanan uji selesai supaya tidak mengotori dashboard
await client.query(`update public.orders set status = 'cancelled' where id in ($1, $2);`, [
  newOrder.id,
  o2.id,
]);

console.log("\n=== 5. Stok tidak boleh minus saat order bersamaan ===");
await client.query(`update public.flavors set stock = 1, stock_enabled = true where id = 4;`);

// Dua koneksi terpisah supaya benar-benar konkuren (satu koneksi pg
// hanya bisa menjalankan satu query pada satu waktu).
const connA = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const connB = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await connA.connect();
await connB.connect();

const orderSql = (name, phone) =>
  `select public.create_order('${name}','${phone}','cash','pickup',null,null,null,null,'id',
     jsonb_build_array(jsonb_build_object('flavor_id',4,'quantity',1)));`;

const [raceA, raceB] = await Promise.all([
  asUserOn(connA, "anon", { role: "anon" }, orderSql("Racing A", "081111111111")),
  asUserOn(connB, "anon", { role: "anon" }, orderSql("Racing B", "082222222222")),
]);
await connA.end();
await connB.end();

const succeeded = [raceA, raceB].filter((r) => r.ok).length;
check("hanya 1 dari 2 pesanan bersamaan yang berhasil (stok=1)", succeeded === 1, `berhasil=${succeeded}`);
const loser = [raceA, raceB].find((r) => !r.ok);
check("pesanan yang kalah ditolak dengan pesan stok habis",
  Boolean(loser?.error?.includes("insufficient_stock")), loser?.error ?? "-");

const stockNow = await client.query(`select stock from public.flavors where id = 4;`);
check("stok tidak menjadi minus", stockNow.rows[0].stock === 0, `stok=${stockNow.rows[0].stock}`);

await client.query(`update public.flavors set stock = 20 where id = 4;`);
await client.query(
  `update public.orders set status='cancelled' where customer_name in ('Racing A','Racing B');`
);

await client.end();
console.log(`\n${"=".repeat(46)}`);
console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
console.log(`${"=".repeat(46)}\n`);
process.exit(fail > 0 ? 1 : 0);
