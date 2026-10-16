// Dump definisi RPC yang menyentuh bundle, LANGSUNG dari DB produksi (READ-ONLY).
// Tulis ke .shots/rpc-<nama>-<n>.sql supaya bisa dibaca tanpa scroll konsol.
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

const outDir = path.resolve(process.cwd(), ".shots");
fs.mkdirSync(outDir, { recursive: true });

const targets = [
  "admin_save_bundle",
  "admin_list_bundles",
  "admin_delete_bundle",
  "create_order",
  "public_menu",
  "menu_public",
];

const q = await c.query(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosrc
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = any($1)
  order by p.proname, p.oid
`, [targets]);

const byName = new Map();
for (const r of q.rows) {
  if (!byName.has(r.proname)) byName.set(r.proname, []);
  byName.get(r.proname).push(r);
}

for (const name of targets) {
  const list = byName.get(name) ?? [];
  if (list.length === 0) {
    console.log("  --- " + name + ": TIDAK ADA ---");
    continue;
  }
  console.log("=== " + name + " (" + list.length + " overload) ===");
  for (const [i, r] of list.entries()) {
    const file = path.join(outDir, `rpc-${name}-${i}.sql`);
    const header =
      `-- ${name}(${r.args})\n-- baris: ${r.prosrc.split("\n").length}\n`;
    fs.writeFileSync(file, header + r.prosrc + "\n", "utf8");
    console.log(
      "    " + path.basename(file) +
        "  args=(" + r.args + ")" +
        "  baris=" + r.prosrc.split("\n").length +
        "  bytes=" + r.prosrc.length
    );
  }
}

// RPC lain yang namanya mengandung "bundle" supaya tidak ada yang terlewat.
const lain = await c.query(`
  select p.proname, pg_get_function_identity_arguments(p.oid) as args
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname ilike '%bundle%'
  order by p.proname
`);
console.log("");
console.log("=== Semua RPC bernama *bundle* di schema public ===");
for (const r of lain.rows) console.log("    " + r.proname + "(" + r.args + ")");

// Tabel yang menyebut "bundle".
const tbl = await c.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_name ilike '%bundle%'
  order by table_name
`);
console.log("");
console.log("=== Tabel *bundle* di schema public ===");
for (const r of tbl.rows) console.log("    " + r.table_name);

await c.end();