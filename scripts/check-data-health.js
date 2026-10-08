/**
 * Ringkasan kesehatan data (read-only, tidak mengubah apa pun).
 *   node scripts/check-data-health.js
 *
 * Dipakai untuk smoke test: memastikan tabel inti berisi data yang wajar
 * supaya halaman publik & dashboard admin tidak render kosong.
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

  const q = async (label, sql) => {
    try {
      const { rows } = await c.query(sql);
      console.log(`${label.padEnd(28)} ${JSON.stringify(rows[0])}`);
    } catch (e) {
      // Satu query yang gagal (mis. kolom tidak ada) tidak boleh menghentikan
      // pemeriksaan sisanya.
      console.log(`${label.padEnd(28)} GAGAL: ${e.message}`);
    }
  };

  console.log("=== Data health (read-only) ===\n");
  await q("admin aktif", "select count(*) filter (where is_active)::int as aktif, count(*)::int as total from public.admins");
  await q("kategori", "select count(*)::int as n, sum(stock)::int as total_stok from public.categories");
  await q("flavor", "select count(*) filter (where is_active)::int as aktif, count(*)::int as total from public.flavors");
  await q("flavor tanpa gambar", "select count(*)::int as n from public.flavors where image_url is null or image_url = ''");
  await q("flavor tanpa harga", "select count(*)::int as n from public.flavors where price is null or price <= 0");
  await q("bundle aktif", "select count(*)::int as n from public.bundles where is_active");
  await q("bundle tanpa nama", "select count(*)::int as n from public.bundles where is_active and (name_id is null or name_id = '')");
  await q("bundle compare_price salah", "select count(*)::int as n from public.bundles where compare_price is not null and compare_price <= price");
  await q("order", "select count(*)::int as n from public.orders");
  await q("order tanpa kode", "select count(*)::int as n from public.orders where order_code is null or order_code = ''");
  await q("review", "select count(*)::int as n from public.order_reviews");
  await q("RPC admin_*", "select count(*)::int as n from pg_proc p join pg_namespace nn on nn.oid = p.pronamespace where nn.nspname = 'public' and p.proname like 'admin\\_%'");
  await q("customer_profiles", "select count(*)::int as n from public.customer_profiles");
  await q("customer tanpa phone", "select count(*)::int as n from public.customer_profiles where phone is null");
  await q("voucher aktif", "select count(*)::int as n from public.vouchers where is_active");

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});