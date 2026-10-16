// Bukti bahwa jalur pembeli tetap memakai mode LAMA saat migration-59 belum
// terpasang: `public_menu()` tidak mengirim `slots`, jadi `bundle.slots` jadi
// undefined dan modal memakai pemilih rasa rata seperti sebelumnya.
// READ-ONLY, tidak mengubah apa pun.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs
  .readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8")
  .split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

let ok = 0;
let gagal = 0;
const cek = (nama, lulus, extra = "") => {
  if (lulus) ok++;
  else gagal++;
  console.log((lulus ? "OK   " : "GAGAL") + "  " + nama + (extra ? "  -> " + extra : ""));
};

const menu = (await c.query("select public.public_menu() as d")).rows[0].d;
const semua = [
  ...(menu.bundles ?? []),
  ...(menu.categories ?? []).flatMap((x) => x.bundles ?? []),
];
// Bundle berdiri sendiri muncul dua kali di public_menu: sekali di daftar atas
// dan sekali di daftar tiap kategori. Dipakai unik supaya jumlahnya masuk akal.
const unik = [...new Map(semua.map((b) => [b.id, b])).values()];

cek("public_menu() jalan", Array.isArray(menu.categories));
cek("bundle yang dikirim tidak punya kunci `slots`",
  semua.length > 0 && semua.every((b) => !("slots" in b)),
  JSON.stringify(semua.map((b) => b.id + ":" + Object.keys(b).length + "kunci")));
cek("tidak ada RPC bundle_features (artinya UI admin menyembunyikan mode pilihan)",
  (await c.query(
    `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public' and p.proname = 'bundle_features'`
  )).rows[0].n === 0);
cek("tabel bundle_slots belum ada",
  (await c.query(
    `select count(*)::int as n from information_schema.tables
      where table_schema = 'public' and table_name = 'bundle_slots'`
  )).rows[0].n === 0);
cek("paket yang ada tetap mode biasa (bukan terkunci, bukan pilihan)",
  unik.length === 1 && unik[0].is_fixed === false && unik[0].required_qty === 2,
  JSON.stringify(unik.map((b) => ({ id: b.id, is_fixed: b.is_fixed, qty: b.required_qty }))));

console.log("");
console.log(ok + " OK, " + gagal + " GAGAL");
await c.end();
process.exit(gagal === 0 ? 0 : 1);