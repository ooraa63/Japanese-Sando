// Cek apakah UI "paket per batch" (item 7 Steven) benar-benar punya data di
// produksi. READ-ONLY: semua yang mengubah JWT claim dibungkus begin/rollback.
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

const batches = await c.query(
  "select id, pickup_date, is_active from public.po_batches order by id desc limit 5"
);
console.log("=== 5 batch terakhir ===");
for (const b of batches.rows) {
  console.log(`  #${b.id} (${b.pickup_date}) aktif=${b.is_active}`);
}

const link = await c.query(
  "select batch_id, count(*)::int as n from public.po_batch_bundles group by 1 order by 1"
);
console.log("");
console.log("=== po_batch_bundles ===");
if (link.rows.length === 0) console.log("  (kosong - semua batch pakai mode 'semua bundle aktif')");
for (const l of link.rows) console.log(`  batch ${l.batch_id}: ${l.n} paket`);

const admin = await c.query(`
  select u.id, u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.is_admin = true
  limit 1
`);
const sub = admin.rows[0]?.id;
console.log("");
console.log("admin ditemukan: " + (sub ?? "(tidak ada)"));

if (sub) {
  const target = batches.rows[0]?.id;
  await c.query("begin");
  await c.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
  await c.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub, role: "authenticated" }),
  ]);
  const detail = await c.query("select public.admin_list_po_batch_detail($1) as d", [target]);
  const d = detail.rows[0].d ?? {};
  console.log("");
  console.log(`=== admin_list_po_batch_detail(batch ${target}) ===`);
  console.log("  kunci: " + JSON.stringify(Object.keys(d)));
  console.log("  jumlah bundles: " + (Array.isArray(d.bundles) ? d.bundles.length : "?"));
  if (Array.isArray(d.bundles) && d.bundles.length > 0) {
    for (const b of d.bundles) {
      console.log(
        `    bundle ${b.bundle_id} dipakai=${b.dipakai} harga_batch=${JSON.stringify(b.harga_batch)} ` +
          `${b.nama ?? ""}`
      );
    }
  }
  await c.query("rollback");
}

await c.end();