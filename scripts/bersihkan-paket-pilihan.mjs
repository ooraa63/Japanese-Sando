// =============================================================================
//  Hapus data uji paket pilihan dari produksi.
//
//  Membatalkan semua yang dibuat `scripts/siapkan-data-uji-paket-pilihan.mjs`:
//  menutup batch tes dan menonaktifkan paket uji.
//
//  Paket tidak dihapus fisik kalau sudah pernah dipakai pesanan (sama seperti
//  `admin_delete_bundle`) — jadi kalau Steven sempat checkout, paketnya hanya
//  disembunyikan, dan itu memang yang benar supaya rincian pesanan tetap utuh.
// =============================================================================
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

const batch = (await c.query(
  "select id from public.po_batches where label = 'Tes paket pilihan' limit 1"
)).rows[0];
const paket = (await c.query(
  "select id from public.bundles where name_id = 'Uji Pilihan' limit 1"
)).rows[0];

if (!batch && !paket) {
  console.log("Tidak ada data uji paket pilihan untuk dibersihkan.");
  await c.end();
  process.exit(0);
}

if (batch) {
  // Nonaktifkan, jangan hapus: riwayat pesanan (kalau ada) tetap punya
  // referensi batch yang bisa dibaca admin.
  await c.query("update public.po_batches set is_active = false where id = $1", [batch.id]);
  console.log("Batch tes ditutup: id " + batch.id);
}

if (paket) {
  const dipakai = (
    await c.query("select count(*)::int as n from public.bundle_items where bundle_id = $1", [
      paket.id,
    ])
  ).rows[0].n;
  await c.query("update public.bundles set is_active = false where id = $1", [paket.id]);
  console.log(
    "Paket uji disembunyikan: id " + paket.id +
      (dipakai > 0 ? " (dipakai " + dipakai + " pesanan, jadi tidak dihapus fisik)" : "")
  );
}

const sisa = (await c.query(
  `select
     (select count(*)::int from public.bundles where is_active and name_id = 'Uji Pilihan') as paket_aktif,
     (select count(*)::int from public.po_batches where is_active and label = 'Tes paket pilihan') as batch_aktif`
)).rows[0];
console.log("");
console.log("Sisa setelah dibersihkan: paket aktif=" + sisa.paket_aktif + ", batch aktif=" + sisa.batch_aktif);

await c.end();