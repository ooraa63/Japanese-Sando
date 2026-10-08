/**
 * Cek apakah sebuah function punya pemanggil di dalam database (function lain
 * yang memanggilnya), sebelum di-drop.
 *   node scripts/check-fn-usage.js customer_upsert_own_profile
 *
 * Read-only.
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
  const name = process.argv[2];
  if (!name) {
    console.error("Pakai: node scripts/check-fn-usage.js <nama_fungsi>");
    process.exit(1);
  }
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const { rows: versions } = await c.query(
    `select p.oid, pg_get_function_identity_arguments(p.oid) as args, p.pronargs
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = $1
      order by p.pronargs`,
    [name]
  );

  console.log(`\nVersi "${name}" yang ada: ${versions.length}`);
  for (const v of versions) {
    console.log(`  oid=${v.oid}  (${v.args})  pronargs=${v.pronargs}`);
  }

  // Function lain yang memanggil nama ini di dalam body-nya.
  const { rows: callers } = await c.query(
    `select p.oid::regprocedure::text as pemanggil
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.oid <> all($1::oid[])
        and p.prosrc ilike '%' || $2 || '%'`,
    [versions.map((v) => v.oid), name]
  );

  console.log(`\nFunction lain yang menyebut "${name}" di body: ${callers.length}`);
  for (const r of callers) console.log(`  ${r.pemanggil}`);

  // Objek yang depender ke tiap versi (view, trigger, constraint, dll).
  for (const v of versions) {
    const { rows: deps } = await c.query(
      `select
         d.deptype,
         coalesce(c.relname, p.proname) as objek,
         coalesce(c.relkind::text, 'function') as tipe
       from pg_depend d
       left join pg_class c on c.oid = d.refobjid
       left join pg_proc p on p.oid = d.refobjid
       where d.refobjid = $1
         and d.refclassid in ('pg_class'::regclass, 'pg_proc'::regclass)
         and d.deptype not in ('i','a')`,
      [v.oid]
    );
    console.log(`\nDependensi untuk (${v.args}): ${deps.length}`);
    for (const r of deps) {
      console.log(`  [${r.deptype}] ${r.tipe} ${r.objek}`);
    }
  }

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});