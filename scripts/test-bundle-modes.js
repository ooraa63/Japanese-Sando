/**
 * Tes logika mode bundle (migration-54 + 55).
 *
 * SEMUA dijalankan di dalam transaksi yang di-ROLLBACK di akhir, jadi tidak ada
 * pesanan, stok, atau data bundle yang benar-benar berubah. Setiap assert
 * dibungkus SAVEPOINT supaya satu kegagalan tidak mematikan transaksi.
 *
 *   node scripts/test-bundle-modes.js
 */
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
}

let ok = 0;
let fail = 0;
function cek(label, lulus, info) {
  if (lulus) {
    ok++;
    console.log("  OK    " + label);
  } else {
    fail++;
    console.log("  GAGAL " + label + (info ? "\n         -> " + info : ""));
  }
}

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  let sp = 0;
  async function denganSavepoint(fn) {
    const name = "sp_" + ++sp;
    await c.query("savepoint " + name);
    try {
      const value = await fn();
      await c.query("release savepoint " + name);
      return { lewat: true, value };
    } catch (e) {
      await c.query("rollback to savepoint " + name);
      return { lewat: false, pesan: e.message };
    }
  }

  try {
    await c.query("begin");

    const { rows: setting } = await c.query(
      "select is_preorder_open from store_settings where id = 1"
    );
    if (!setting.length || !setting[0].is_preorder_open) {
      console.log("LEWATI: pre-order sedang tutup di setting.");
      await c.query("rollback");
      await c.end();
      return;
    }

    const { rows: flavors } = await c.query(
      "select id, name_id from flavors where is_active order by id limit 2"
    );
    if (flavors.length < 2) {
      console.log("LEWATI: butuh minimal 2 rasa aktif.");
      await c.query("rollback");
      await c.end();
      return;
    }
    const f1 = flavors[0];
    const f2 = flavors[1];

    const { rows: bRows } = await c.query("select id from bundles order by id limit 1");
    if (!bRows.length) {
      console.log("LEWATI: belum ada bundle untuk diuji.");
      await c.query("rollback");
      await c.end();
      return;
    }
    const bid = bRows[0].id;

    await c.query("update bundles set is_fixed = true, required_qty = 2 where id = $1", [bid]);
    await c.query("delete from bundle_flavors where bundle_id = $1", [bid]);
    await c.query("insert into bundle_flavors (bundle_id, flavor_id) values ($1,$2),($1,$3)", [
      bid,
      f1.id,
      f2.id,
    ]);

    // Sesudah migration-55 hanya ada SATU overload create_order, jadi named
    // parameter tidak lagi ambigu. Gaya pemanggilannya sengaja disamakan dengan
    // OrderFlow.tsx supaya yang diuji memang jalur yang dipakai aplikasi.
    const order = (slots) =>
      c.query(
        `select public.create_order(
           p_customer_name => $1, p_customer_email => $2, p_instagram => $3,
           p_phone => $4, p_payment_method => $5, p_delivery_method => $6,
           p_delivery_zone => $7, p_address => $8, p_address_note => $9,
           p_lat => $10, p_lng => $11, p_transfer_method => $12,
           p_payment_proof => $13, p_note => $14, p_language => $15,
           p_items => $16, p_bundles => $17,
           p_po_batch_id => $18, p_pickup_date => $19
         ) as r`,
        [
          "Tes Mode Bundle", "", "", "08123456789",
          "transfer", "pickup", "pickup",
          null, null, null, null, null, null, null,
          "id", "[]",
          JSON.stringify([{ bundle_id: bid, slots, note: "" }]),
          null, null,
        ]
      );

    console.log("Bundle uji #" + bid + " -> mode COMBO, isi: " + f1.name_id + " + " + f2.name_id);
    console.log("");

    let r = await denganSavepoint(() => order([{ flavor_id: f1.id }, { flavor_id: f2.id }]));
    cek("combo: slots sesuai isi paket diterima", r.lewat, r.lewat ? "" : r.pesan);

    r = await denganSavepoint(() => order([{ flavor_id: f1.id }, { flavor_id: f1.id }]));
    cek("combo: duplikat [x, x] ditolak", !r.lewat, r.lewat ? "ORDERNYA LOLOS" : r.pesan);

    const { rows: other } = await c.query(
      "select id from flavors where is_active and id <> $1 and id <> $2 order by id limit 1",
      [f1.id, f2.id]
    );
    if (other.length) {
      r = await denganSavepoint(() => order([{ flavor_id: f1.id }, { flavor_id: other[0].id }]));
      cek("combo: rasa di luar isi paket ditolak", !r.lewat, r.lewat ? "ORDERNYA LOLOS" : r.pesan);
    }

    r = await denganSavepoint(() => order([{ flavor_id: f1.id }]));
    cek("combo: jumlah slot kurang dari required_qty ditolak", !r.lewat, r.lewat ? "ORDERNYA LOLOS" : r.pesan);

    // Mode PILIH SENDIRI, daftar rasa dibatasi ke 2. Pembeli harus bisa
    // memilih salah satu saja (duplikat tetap boleh) tapi TIDAK boleh memakai
    // rasa ketiga yang di luar daftar. Inilah aturan yang tadinya tidak
    // dipaksa sama sekali di jalur produksi.
    await c.query("update bundles set is_fixed = false where id = $1", [bid]);
    r = await denganSavepoint(() => order([{ flavor_id: f1.id }, { flavor_id: f1.id }]));
    cek("pilih-sendiri: duplikat [x, x] tetap boleh", r.lewat, r.lewat ? "" : r.pesan);

    if (other.length) {
      r = await denganSavepoint(() => order([{ flavor_id: f1.id }, { flavor_id: other[0].id }]));
      cek("pilih-sendiri: rasa di luar daftar ditolak", !r.lewat, r.lewat ? "ORDERNYA LOLOS" : r.pesan);
    }

    // admin_save_bundle memanggil is_admin() yang membaca auth.uid() dari JWT
    // claim. Koneksi DB langsung tidak punya JWT, jadi set lokal di dalam
    // transaksi (parameter `true` = local, ikut hilang saat rollback).
    const { rows: admins } = await c.query(
      "select user_id from admins where is_active order by user_id limit 1"
    );
    if (admins.length) {
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: admins[0].user_id, role: "authenticated" }),
      ]);

      r = await denganSavepoint(() =>
        c.query("select public.admin_save_bundle($1::jsonb)", [
          JSON.stringify({
            id: bid,
            name_id: "Tes Simpan",
            price: 35000,
            required_qty: 5,
            is_fixed: true,
            flavor_ids: [f1.id, f2.id],
            sort_order: 99,
            is_active: true,
          }),
        ])
      );
      cek(
        "simpan: combo dengan jumlah rasa != jumlah slot ditolak",
        !r.lewat && /invalid_bundle_fixed/.test(r.pesan || ""),
        r.lewat ? "TOSIMPAN JADI TIDAK DITOLAK" : r.pesan
      );

      // Kontrol positif: jumlah rasa yang cocok harus tersimpan.
      r = await denganSavepoint(() =>
        c.query("select public.admin_save_bundle($1::jsonb)", [
          JSON.stringify({
            id: bid,
            name_id: "Tes Simpan",
            price: 35000,
            required_qty: 2,
            is_fixed: true,
            flavor_ids: [f1.id, f2.id],
            sort_order: 99,
            is_active: true,
          }),
        ])
      );
      cek("simpan: combo dengan jumlah rasa yang cocok diterima", r.lewat, r.lewat ? "" : r.pesan);
    } else {
      console.log("  (lewati 2 tes admin_save_bundle: tidak ada admin aktif)");
    }

    await c.query("rollback");
    console.log("");
    console.log("Semua dibatalkan (rollback). Data produksi tidak berubah.");
    console.log("Total: " + ok + " OK, " + fail + " GAGAL");
    if (fail > 0) process.exitCode = 1;
  } catch (e) {
    try {
      await c.query("rollback");
    } catch {}
    console.error("GAGAL: " + e.message);
    process.exit(1);
  } finally {
    await c.end();
  }
})().catch((e) => {
  console.error("GAGAL koneksi:", e.message);
  process.exit(1);
});