/**
 * Lihat isi kolom bebas untuk beberapa rasa (read-only).
 *   node scripts/check-flavor-text.js
 *
 * Dipakai buat memastikan field seperti `desc_id` benar-benar terisi di
 * database — kalau kosong,_inf UI yang salah, bukan datanya.
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
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
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
    select id, name_id, name_en,
           coalesce(length(trim(desc_id)), 0) as panjang_desc_id,
           coalesce(length(trim(desc_en)), 0) as panjang_desc_en,
           left(coalesce(desc_id, ''), 90) as contoh_desc_id
      from public.flavors
     order by sort_order, id
  `);

  console.log("\n=== Isi deskripsi rasa ===");
  console.table(rows);

  const kosong = rows.filter((r) => r.panjang_desc_id === 0 || r.panjang_desc_en === 0);
  console.log(`\nRasa dengan deskripsi kosong: ${kosong.length} dari ${rows.length}`);
  for (const k of kosong) {
    console.log(`  - #${k.id} ${k.name_id} (desc_id=${k.panjang_desc_id}, desc_en=${k.panjang_desc_en})`);
  }

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});