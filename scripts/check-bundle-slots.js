/**
 * Cek batas jumlah rasa per bundle (read-only).
 *
 * `bundles.required_qty` = berapa rasa yang WAJIB dipilih pembeli.
 * `bundle_flavors`         = daftar rasa yang dikunci penjual (opsional).
 *
 *   node scripts/check-bundle-slots.js
 */
const { Client } = require("pg");

function loadEnv() {
  const fs = require("fs");
  const path = require("path");
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

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows } = await c.query(`
    select b.id, b.name_id, b.required_qty, b.is_active, b.price, b.is_fixed,
           coalesce(
             (select array_agg(bf.flavor_id order by bf.flavor_id)
                from bundle_flavors bf where bf.bundle_id = b.id),
             '{}'
           ) as locked_flavors
    from bundles b
    order by b.sort_order nulls last, b.id
  `);

  if (!rows.length) console.log("Tidak ada bundle sama sekali.");

  for (const b of rows) {
    const locked = b.locked_flavors || [];
    console.log(`#${b.id} ${b.name_id}${b.is_active ? "" : "  (NONAKTIF)"}`);
    console.log(`   Mode            : ${b.is_fixed ? "COMBO (isi terkunci)" : "pilih sendiri"}`);
    console.log(`   WAJIB pilih     : ${b.required_qty} rasa`);
    console.log(
      `   Rasa di daftar  : ${
        locked.length ? locked.join(", ") : "tidak ada -> semua rasa bebas"
      }`
    );
    if (b.is_fixed && locked.length !== b.required_qty) {
      console.log("   ⚠ tidak konsisten: isi terkunci harus sama dengan WAJIB pilih");
    }
    console.log("");
  }

  await c.end();
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});