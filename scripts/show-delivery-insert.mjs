// Ambil potongan body create_order yang billiong dengan delivery_method /
// delivery_zone (READ-ONLY, tidak mengubah apa pun).
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(`
  select p.prosrc
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname = 'create_order' and n.nspname = 'public'
  order by p.pronargs desc
  limit 1
`);

const src = r.rows[0].prosrc;
const baris = src.split(/\r?\n/);

// Tampilkan blok mana pun yang menyebut delivery_method / delivery_zone.
const mau = [];
for (let i = 0; i < baris.length; i++) {
  if (/delivery_method|delivery_zone/i.test(baris[i])) {
    const dari = Math.max(0, i - 2);
    const sampai = Math.min(baris.length - 1, i + 2);
    mau.push([dari, sampai]);
  }
}

// Gabungkan rentang yang bersinggungan.
const gabung = [];
for (const [a, b] of mau) {
  const terakhir = gabung[gabung.length - 1];
  if (terakhir && a <= terakhir[1] + 1) terakhir[1] = Math.max(terakhir[1], b);
  else gabung.push([a, b]);
}

for (const [a, b] of gabung) {
  console.log("--- baris " + (a + 1) + "-" + (b + 1) + " ---");
  for (let i = a; i <= b; i++) {
    console.log(String(i + 1).padStart(4, " ") + "| " + baris[i]);
  }
  console.log("");
}

await c.end();