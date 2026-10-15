// Read-only: memastikan tidak ada sisa data uji dari skrip test-migration-58
// (termasuk dari run yang crash di tengah BEGIN sebelum selesai ROLLBACK).
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const q = async (label, sql) => {
  const r = await c.query(sql);
  console.log(label.padEnd(28) + ": " + r.rows[0].n);
};

await q("order uji RK-UJI-*", "select count(*)::int n from public.orders where order_code like 'RK-UJI-%'");
await q("ulasan uji", "select count(*)::int n from public.order_reviews where comment like 'Ulasan % bintang'");
await q("total order_reviews", "select count(*)::int n from public.order_reviews");
await q("total orders", "select count(*)::int n from public.orders");
await q("bucket review-photos", "select count(*)::int n from storage.buckets where id = 'review-photos'");
await q("tabel order_review_photos", "select count(*)::int n from information_schema.tables where table_schema = 'public' and table_name = 'order_review_photos'");
await q("policy review_photos*", "select count(*)::int n from pg_policies where schemaname = 'storage' and policyname like 'review_photos%'");
await q("sesi idle in transaction", "select count(*)::int n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state = 'idle in transaction'");
await q("overload submit_review 4", "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'submit_review' and p.pronargs = 4");
await q("overload list_reviews 3", "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace where ns.nspname = 'public' and p.proname = 'list_reviews' and p.pronargs = 3");

await c.end();