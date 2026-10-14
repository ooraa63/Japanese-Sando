// Uji migration-56 TANPA mengubah produksi.
//
// Cara: jalankan isi migration-56.sql di dalam transaksi, panggil
// create_order dengan p_po_batch_id NULL untuk membuktikan pesanan ditolak,
// lalu ROLLBACK. Karena rollback, definisi fungsi live tidak berubah sama
// sekali — diverifikasi ulang setelah rollback.
//
// PENTING: panggil create_order DI DALAM transaksi yang sudah di-rollback
// akan aman, tapi kalau skrip ini gagal di tengah, transaksi tetap di-rollback
// oleh blok catch.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const REG = "create_order(text,text,text,text,text,text,text,text,text,double precision,double precision,text,text,text,text,jsonb,jsonb,uuid,bigint,date)";

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const hasGuard = async (label) => {
  const { rows } = await c.query(
    `select prosrc from pg_proc where oid = $1::regprocedure`,
    [REG]
  );
  return { label, ada: /no_active_batch/.test(rows[0].prosrc) };
};

let ok = 0;
let fail = 0;
const t = (name, pass, extra = "") => {
  if (pass) ok++;
  else fail++;
  console.log((pass ? "OK   " : "GAGAL") + "  " + name + (extra ? "  -> " + extra : ""));
};

console.log("=== SEBELUM migration (harus: belum ada guard) ===");
const before = await hasGuard("sebelum");
t("live belum punya guard", !before.ada);

const ordersBefore = await c.query(`select count(*)::int as n from orders`);
const stockBefore = await c.query(`select coalesce(sum(stock),0)::int as n from categories`);
console.log("  order sebelum  :", ordersBefore.rows[0].n);
console.log("  total stok     :", stockBefore.rows[0].n);

let rolledBack = false;
try {
  await c.query("BEGIN");
  const sql = fs.readFileSync(path.resolve(process.cwd(), "supabase/migration-56.sql"), "utf8");
  await c.query(sql);
  console.log("\n=== migration-56 dijalankan di dalam transaksi ===");

  const during = await hasGuard("saat");
  t("guard aktif di dalam transaksi", during.ada);

  // Setiap panggilan yang DIHARAPKAN gagal harus dibungkus savepoint.
  // Tanpa itu, `raise exception` membuat seluruh transaksi jadi "aborted"
  // dan panggilan berikutnya tidak bisa jalan sama sekali.
  const expectRaise = async (label, sql) => {
    await c.query("SAVEPOINT sp_" + label);
    let msg = null;
    try {
      await c.query(sql);
    } catch (e) {
      msg = e.message;
    }
    await c.query("ROLLBACK TO SAVEPOINT sp_" + label);
    return msg;
  };

  // Pesanan TANPA batch harus ditolak.
  const rejected = await expectRaise(
    "no_batch",
    `select public.create_order(
       p_customer_name    => 'Uji Batch Kosong',
       p_phone            => '081234567890',
       p_payment_method   => 'transfer',
       p_delivery_method  => 'pickup',
       p_delivery_zone    => 'pickup',
       p_items            => '[{"flavor_id": 1, "quantity": 1}]'::jsonb,
       p_po_batch_id      => NULL,
       p_pickup_date      => NULL
     )`
  );
  t("create_order tanpa batch DITOLAK", rejected !== null, rejected ?? "tidak raise");
  t("pesan error = no_active_batch", rejected === "no_active_batch", rejected ?? "-");

  // Regresi: batch yang tidak ada harus tetap ditolak dengan pesan LAMA.
  const bogus = await expectRaise(
    "bogus",
    `select public.create_order(
       p_customer_name    => 'Uji Batch Palsu',
       p_phone            => '081234567890',
       p_payment_method   => 'transfer',
       p_delivery_method  => 'pickup',
       p_delivery_zone    => 'pickup',
       p_items            => '[{"flavor_id": 1, "quantity": 1}]'::jsonb,
       p_po_batch_id      => 999999,
       p_pickup_date      => NULL
     )`
  );
  t("batch yang tidak ada ditolak batch_not_found", bogus === "batch_not_found", bogus ?? "-");

  const ordersMid = await c.query(`select count(*)::int as n from orders`);
  t("tidak ada order yang tersimpan", ordersMid.rows[0].n === ordersBefore.rows[0].n,
    `sebelum ${ordersBefore.rows[0].n}, sekarang ${ordersMid.rows[0].n}`);
  const stockMid = await c.query(`select coalesce(sum(stock),0)::int as n from categories`);
  t("stok kategori tidak tersentuh", stockMid.rows[0].n === stockBefore.rows[0].n,
    `sebelum ${stockBefore.rows[0].n}, sekarang ${stockMid.rows[0].n}`);

  await c.query("ROLLBACK");
  rolledBack = true;
} catch (e) {
  console.error("\nERROR:", e.message);
  if (!rolledBack) await c.query("ROLLBACK").catch(() => {});
}

console.log("\n=== SETELAH rollback (harus: live tidak berubah) ===");
const after = await hasGuard("sesudah");
t("live KEMBALI tanpa guard", !after.ada);

const ordersAfter = await c.query(`select count(*)::int as n from orders`);
const stockAfter = await c.query(`select coalesce(sum(stock),0)::int as n from categories`);
t("jumlah order tidak berubah", ordersAfter.rows[0].n === ordersBefore.rows[0].n,
  `${ordersBefore.rows[0].n} -> ${ordersAfter.rows[0].n}`);
t("stok tidak berubah", stockAfter.rows[0].n === stockBefore.rows[0].n,
  `${stockBefore.rows[0].n} -> ${stockAfter.rows[0].n}`);

console.log(`\n=== ${ok} OK, ${fail} GAGAL ===`);
await c.end();
process.exit(fail === 0 ? 0 : 1);