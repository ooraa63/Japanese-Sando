/**
 * Beralih sementara bundle uji ke mode COMBO untuk verifikasi tampilan.
 * Dipakai hanya selama tes browser; selalu mengembalikan ke mode asal.
 *
 *   node scripts/set-bundle-mode.js <bundleId> <fixed|choose>
 *   node scripts/set-bundle-mode.js 1 fixed 2 7 9
 *        -> mode combo, isi paket = flavor id 2, 7, 9 (harus 3 rasa)
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

(async () => {
  loadEnv();
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const id = Number(process.argv[2]);
  const mode = process.argv[3] || "choose";
  const flavorIds = process.argv.slice(4).map(Number).filter((n) => Number.isFinite(n));

  if (!Number.isFinite(id)) {
    console.error("Pemakaian: node scripts/set-bundle-mode.js <bundleId> <fixed|choose> [flavorId...]");
    process.exit(1);
  }

  if (mode === "fixed") {
    await c.query("update bundles set is_fixed = true where id = $1", [id]);
    await c.query("delete from bundle_flavors where bundle_id = $1", [id]);
    if (flavorIds.length) {
      await c.query(
        "insert into bundle_flavors (bundle_id, flavor_id) select $1, unnest($2::bigint[])",
        [id, flavorIds]
      );
    }
    await c.query("update bundles set required_qty = $2 where id = $1", [id, flavorIds.length]);
  } else {
    await c.query("update bundles set is_fixed = false where id = $1", [id]);
    if (flavorIds.length === 0) {
      await c.query("delete from bundle_flavors where bundle_id = $1", [id]);
    } else {
      await c.query("delete from bundle_flavors where bundle_id = $1", [id]);
      await c.query(
        "insert into bundle_flavors (bundle_id, flavor_id) select $1, unnest($2::bigint[])",
        [id, flavorIds]
      );
    }
  }

  const { rows } = await c.query(`
    select b.id, b.name_id, b.is_fixed, b.required_qty,
           coalesce((select array_agg(bf.flavor_id order by bf.flavor_id)
                       from bundle_flavors bf where bf.bundle_id = b.id), '{}') as f
    from bundles b where b.id = $1
  `, [id]);

  console.log("bundle #" + id + " -> mode " + (rows[0].is_fixed ? "COMBO" : "pilih-sendiri")
    + ", required_qty=" + rows[0].required_qty + ", isi=[" + rows[0].f.join(", ") + "]");

  await c.end();
})().catch((e) => {
  console.error("GAGAL:", e.message);
  process.exit(1);
});