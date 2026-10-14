// Verifikasi guard no_active_batch SUDAH AKTIF di produksi.
//
// Beda penting dari test-migration-56.mjs: skrip ini tidak rollback —
// memang untuk mengonfirmasi migrasi yang sudah benar-benar terpasang.
// Dua pemeriksaan read-only: definisi fungsi, dan percobaan order tanpa
// batch yang harus ditolak SEBELUM menyimpan apa pun.
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

let ok = 0;
let fail = 0;
const t = (name, pass, extra = "") => {
  if (pass) ok++;
  else fail++;
  console.log((pass ? "OK   " : "GAGAL") + "  " + name + (extra ? "  -> " + extra : ""));
};

const before = await c.query(`select count(*)::int as n from orders`);
const stockBefore = await c.query(`select coalesce(sum(stock),0)::int as n from categories`);
console.log("order sebelum :", before.rows[0].n, "| total stok:", stockBefore.rows[0].n);

const def = await c.query(`select prosrc from pg_proc where oid = $1::regprocedure`, [REG]);
t("guard no_active_batch terpasang", /raise exception 'no_active_batch'/.test(def.rows[0].prosrc));
t("perintah v_batch := null hilang", !/^\s*v_batch := null;\s*$/m.test(def.rows[0].prosrc));
t("validasi batch lama masih ada", /batch_not_found/.test(def.rows[0].prosrc) && /batch_closed/.test(def.rows[0].prosrc));
t("potong stok po_batch_stock masih ada", /update public\.po_batch_stock/.test(def.rows[0].prosrc));

const acl = await c.query(`select proacl::text from pg_proc where oid = $1::regprocedure`, [REG]);
t("anon masih boleh panggil create_order", /anon=X/.test(acl.rows[0].proacl ?? ""));

// Order tanpa batch harus ditolak, dan tidak boleh menyimpan apa pun.
let msg = null;
try {
  await c.query(
    `select public.create_order(
       p_customer_name   => 'Uji Produksi Batch Kosong',
       p_phone           => '081234567890',
       p_payment_method  => 'transfer',
       p_delivery_method => 'pickup',
       p_delivery_zone   => 'pickup',
       p_items           => '[{"flavor_id": 1, "quantity": 1}]'::jsonb,
       p_po_batch_id     => NULL,
       p_pickup_date     => NULL
     )`
  );
} catch (e) {
  msg = e.message;
}
t("order tanpa batch ditolak", msg !== null, msg ?? "TIDAK DITOLAK - MASALAH!");
t("pesan = no_active_batch", msg === "no_active_batch", msg ?? "-");

const after = await c.query(`select count(*)::int as n from orders`);
const stockAfter = await c.query(`select coalesce(sum(stock),0)::int as n from categories`);
t("tidak ada order tersimpan", after.rows[0].n === before.rows[0].n, `${before.rows[0].n} -> ${after.rows[0].n}`);
t("stok tidak berubah", stockAfter.rows[0].n === stockBefore.rows[0].n, `${stockBefore.rows[0].n} -> ${stockAfter.rows[0].n}`);

console.log(`\n=== ${ok} OK, ${fail} GAGAL ===`);
await c.end();
process.exit(fail === 0 ? 0 : 1);