/**
 * Helper bersama untuk skrip pengujian.
 * Menyediakan reset state supaya tiap test mulai dari kondisi bersih.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/** Isi process.env dari .env.local */
export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.resolve(process.cwd(), f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

/** URL koneksi database dari .env.local */
export function dbUrl() {
  loadEnv();
  return process.env.DATABASE_URL;
}

/** Pelacak hasil pemeriksaan. */
export function tracker() {
  let pass = 0;
  let fail = 0;
  return {
    check(name, ok, extra = "") {
      if (ok) {
        pass++;
        console.log(`  OK   ${name}`);
      } else {
        fail++;
        console.log(`  GAGAL ${name} ${extra}`);
      }
    },
    get pass() {
      return pass;
    },
    get fail() {
      return fail;
    },
    finish() {
      console.log(`\n${"=".repeat(52)}`);
      console.log(`  LULUS: ${pass}   GAGAL: ${fail}`);
      console.log(`${"=".repeat(52)}\n`);
      process.exit(fail > 0 ? 1 : 0);
    },
  };
}

/**
 * Kembalikan database ke kondisi bersih sebelum test:
 * hapus pesanan, set stok 100, matikan semua paket, buka pre-order.
 */
export async function resetAll(client, { bundles = [] } = {}) {
  await client.query(`delete from public.orders;`);
  await client.query(
    `update public.store_settings set
       is_preorder_open = true,
       stock_enabled   = true,
       total_stock     = 100,
       delivery_fee    = 0,
       min_order       = 1,
       max_per_order   = 50
     where id = 1;`
  );
  // Paket harga dimiliki jenis makanan (kategori).
  await client.query(`update public.categories set bundle_tiers = $1::jsonb;`, [
    JSON.stringify(bundles),
  ]);
}

/** Id flavor yang aktif — id bisa berubah karena ada test yang menambah/menghapus. */
export async function activeFlavorId(client, index = 0) {
  const { rows } = await client.query(
    `select id from public.flavors where is_active order by sort_order, id limit 1 offset $1;`,
    [String(index)]
  );
  return rows[0]?.id ?? 1;
}

/** Bikin runner untuk query dengan JWT claims + RLS seperti PostgREST. */
export function makeRunner(client) {
  return async function asUser(role, claims, sql, params = []) {
    await client.query("begin");
    try {
      await client.query(
        `select set_config('request.jwt.claims', $1, true),
                set_config('request.jwt.claim.sub', $2, true)`,
        [JSON.stringify(claims), claims.sub ?? ""]
      );
      await client.query(`set local role ${role}`);
      const res = await client.query(sql, params);
      await client.query("commit");
      return { ok: true, rows: res.rows, count: res.rowCount };
    } catch (e) {
      await client.query("rollback");
      return { ok: false, error: e.message, code: e.code };
    }
  };
}

/** Ambil admin aktif pertama. */
export async function adminClaims(client) {
  const { rows } = await client.query(
    `select user_id from public.admins where is_active limit 1;`
  );
  if (!rows.length) throw new Error("Tidak ada admin. Jalankan setup /admin/login lebih dulu.");
  return { sub: rows[0].user_id, role: "authenticated", aud: "authenticated" };
}
