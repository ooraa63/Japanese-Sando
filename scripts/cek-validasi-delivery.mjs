// Cetak blok validasi delivery di create_order yang terpasang (READ-ONLY).
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const r = await c.query(`
  select p.prosrc
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_order'
  order by p.oid
`);
const src = r.rows[0].prosrc;
const lines = src.split("\n");
const tampilkan = lines
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /delivery_zone|delivery_method|invalid_delivery|delivery_zones|raise exception/i.test(l));
console.log("=== baris yang menyebut delivery di create_order ===");
for (const [i, l] of tampilkan) {
  console.log(String(i).padStart(4) + " | " + l);
}

console.log("");
console.log("=== konteks: 12 baris sebelum blok pertama ===");
const pertama = tampilkan[0][0];
for (let i = Math.max(0, pertama - 14); i < pertama + 6; i++) {
  console.log(String(i + 1).padStart(4) + " | " + lines[i]);
}

console.log("");
console.log("=== signature create_order terpasang ===");
const s = await c.query(`
  select pg_get_function_identity_arguments(p.oid) as a, p.proname
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname='public' and p.proname='create_order'
`);
for (const row of s.rows) console.log(row.proname + "(" + row.a + ")");

await c.end();