// Generate supabase/migration-56.sql dari definisi LIVE create_order.
//
// Read-only terhadap database. Yang ditulis hanya file lokal.
//
// Kenapa generate dan bukan ketik manual: body create_order versi 20-arg
// ~19.6 KB. Menyalin manual berisiko satu karakter salah. Diambil langsung
// dari pg_proc.prosrc, satu blok validasi disisipkan, lalu SELURUH file
// dibandingkan baris-per-baris untuk membuktikan tidak ada perubahan lain
// di luar blok itu.
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

for (const line of fs.readFileSync(path.resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SIGNATURE =
  "create_order(text,text,text,text,text,text,text,text,text,double precision," +
  "double precision,text,text,text,text,jsonb,jsonb,uuid,bigint,date)";

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const { rows } = await c.query(
  `select p.prosrc, pg_get_function_identity_arguments(p.oid) as ident
     from pg_proc p
    where p.oid = $1::regprocedure`,
  [SIGNATURE]
);

if (rows.length !== 1) {
  console.error("GAGAL: overload 20-arg tidak ditemukan/unik. Ditemukan:", rows.length);
  process.exit(1);
}

const live = rows[0].prosrc;

// Anchor: cabang "tidak ada batch" pada validasi batch.
const ANCHOR = "  else\n    v_batch := null;\n  end if;";

const occurrences = live.split(ANCHOR).length - 1;
if (occurrences !== 1) {
  console.error("GAGAL: anchor ditemukan", occurrences, "kali (harus tepat 1).");
  console.error("Bagian sekitar 'v_batch := null' di source live:");
  const i = live.indexOf("v_batch := null");
  console.error(live.slice(i - 400, i + 200));
  process.exit(1);
}

const REPLACEMENT = [
  "  else",
  "    -- Migration-56: tidak ada batch PO yang dipilih = pesanan DITOLAK.",
  "    --",
  "    -- Sebelumnya cabang ini diam-diam menjadi jalan pemesanan tanpa batch:",
  "    -- `v_batch` jadi null, lalu potongan stok jatuh ke `categories.stock`",
  "    -- jalur stok global jadul. Akibatnya ketika admin tidak punya batch yang",
  "    -- dibuka, pembeli tetap melihat sisa stok global (mis. 20 pcs) di",
  "    -- halaman /order dan pesanan tetap berhasil masuk.",
  "    --",
  "    -- Setiap pesanan sekarang WAJIB punya batch yang valid. Batch sendiri",
  "    -- sudah divalidasi di cabang `if` atas (batch_not_found / batch_closed /",
  "    -- batch_pickup_mismatch), jadi di titik ini tidak ada lagi yang perlu",
  "    -- diperiksa — cukup tolak.",
  "    raise exception 'no_active_batch' using errcode = '22023';",
  "  end if;",
].join("\n");

const patched = live.replace(ANCHOR, REPLACEMENT);

// Bukti perubahan hanya di blok itu.
//
// Yang diharapkan: PURE INSERTION, dengan SATU pengecualian — baris
// `v_batch := null;` memang harus HILANG, karena itulah fallback yang
// membuat pesanan tanpa batch lolos. Jadi daftar baris yang hilang harus
// persis satu baris itu, tidak boleh ada yang lain.
const before = live.split("\n");
const after = patched.split("\n");

// Baris yang hilang = yang tidak ada lagi di `after`.
const afterCounts = new Map();
for (const l of after) afterCounts.set(l, (afterCounts.get(l) ?? 0) + 1);
const beforeCounts = new Map();
for (const l of before) beforeCounts.set(l, (beforeCounts.get(l) ?? 0) + 1);
const removed = [];
for (const [l, n] of beforeCounts) {
  const diff = n - (afterCounts.get(l) ?? 0);
  for (let k = 0; k < diff; k++) removed.push(l);
}

// Baris yang berubah isinya = ada di `before` maupun `after` tapi jumlahnya
// berbeda. Pure insertion = 0.
let changedInPlace = 0;
for (const [l, n] of beforeCounts) {
  if (afterCounts.has(l) && afterCounts.get(l) !== n) changedInPlace++;
}

const ALLOWED_REMOVAL = ["    v_batch := null;"];
const removedOk =
  removed.length === ALLOWED_REMOVAL.length &&
  removed.every((l) => ALLOWED_REMOVAL.includes(l));

console.log("baris live                    :", before.length);
console.log("baris hasil                   :", after.length, `(selisih +${after.length - before.length})`);
console.log("baris live yang dihapus       :", removed.length, JSON.stringify(removed));
console.log("  -> sesuai harapan            :", removedOk);
console.log("baris yang berubah isinya     :", changedInPlace, "(pure insertion = 0)");
console.log("baris baru yang disisipkan    :", after.length - before.length);

if (!removedOk || changedInPlace !== 0) {
  console.error("\nGAGAL: perubahan di luar blok yang dimaksud.");
  process.exit(1);
}
console.log("\nOK: hanya blok validasi batch yang berubah.");

const HEADER = `-- =============================================================================
--  MIGRASI 56 --
--  Tidak ada batch PO = tidak ada pesanan
-- =============================================================================
--
--  Steven 14-10-2026 (dilaporkan dari produksi):
--
--    "tidak ada batch po sama sekali tapi kenapa di web pembeli ada stock 20
--     dan mereka bisa po padahl admin tidak ada buka batch po"
--
--  Verified ke database produksi (22-10-2026):
--
--    po_batches                  -> 0 baris
--    public_po_pickup_dates()    -> {"ada_batch": false, "tanggal": []}
--    categories                  -> Sando Sandwich, stock_enabled=true, stock=20
--
--  Penyebabnya BUKAN satu hal, tapi dua lapis yang saling menguatkan:
--
--    1. Sisi pembeli (src/components/customer/OrderFlow.tsx)
--       \`hasPo = poDates.length > 0\` bernilai false saat tidak ada batch, dan
--       langkah "pilih tanggal" dihilangkan. Komponen lalu memakai mode lama:
--       \`stockByCategory\` jatuh ke \`categories.stock\`. Angka 20 itu dari sana.
--
--    2. Sisi server (create_order)
--       Cabang \`else v_batch := null;\` membuat pesanan tanpa batch tetap
--       valid, dan potongan stok-nya jatuh ke \`categories.stock\`. Jadi
--       meskipun langkah 1 diperbaiki, order tanpa batch tetap sah.
--
--  File ini menutup lapis 2 — sisi server, yang harus benar-benar menolak.
--  Lapis 1 (panel "belum ada batch" di /order) dikerjakan terpisah di
--  frontend.
--
--  CATATAN PENTING soal \`categories.stock_enabled\`:
--  Mematikannya TIDAK akan menutup toko. Di create_order polanya
--      if v_category.stock_enabled and v_cat_pcs > v_category.stock then
--        raise exception 'insufficient_stock';
--  jadi \`stock_enabled = false\` artinya TANPA BATAS STOK — order lolos tanpa
--  cek. Setelah guard ini aktif, angka sisa di \`categories.stock\` tidak lagi
--  dipakai pemesanan sama sekali, jadi nilainya boleh dibiarkan (dipegang di
--  sini sebagai jejak audit) tanpa risiko bocor.
--
--  Definisi fungsi di bawah diambil UTUH dari definisi LIVE, bukan diketik
--  ulang, supaya tidak mungkin menyimpang dari versi yang benar-benar jalan.
--  Satu-satunya perubahan adalah cabang \`else\` pada validasi batch.
--
--  CATATAN: nomor 55 sudah dipakai migration "Bundle dua mode: Combo vs Beli
--  pilih rasa sendiri" (menjatuhkan overload 18 parameter). Jangan menabrak
--  nomor itu.
-- =============================================================================

`;

const OUT = "supabase/migration-56.sql";

// Deklarasi parameter ditulis EKSPLISIT (bukan dihitung dari string) supaya
// tanda kurungnya tidak mungkin salah dan file hasilnya enak dibaca. Urut dan
// tipe ini sama persis dengan definisi live yang dibaca script ini.
const PARAMS = `    p_customer_name text DEFAULT ''::text,
    p_customer_email text DEFAULT ''::text,
    p_instagram text DEFAULT ''::text,
    p_phone text DEFAULT ''::text,
    p_payment_method text DEFAULT 'transfer'::text,
    p_delivery_method text DEFAULT 'pickup'::text,
    p_delivery_zone text DEFAULT 'pickup'::text,
    p_address text DEFAULT NULL::text,
    p_address_note text DEFAULT NULL::text,
    p_lat double precision DEFAULT NULL::double precision,
    p_lng double precision DEFAULT NULL::double precision,
    p_transfer_method text DEFAULT NULL::text,
    p_payment_proof text DEFAULT NULL::text,
    p_note text DEFAULT NULL::text,
    p_language text DEFAULT 'id'::text,
    p_items jsonb DEFAULT '[]'::jsonb,
    p_bundles jsonb DEFAULT '[]'::jsonb,
    p_user_id uuid DEFAULT NULL::uuid,
    p_po_batch_id bigint DEFAULT NULL::bigint,
    p_pickup_date date DEFAULT NULL::date`;

// Tipe saja, untuk grant/comment on function.
const ARGTYPES =
  "text,text,text,text,text,text,text,text,text,double precision," +
  "double precision,text,text,text,text,jsonb,jsonb,uuid,bigint,date";

// Sanity check: signature yang dipakai harus cocok dengan yang dibaca dari DB.
const liveArgTypes = rows[0].ident
  .split(", ")
  .map((a) => a.split(" ").slice(1).join(" "))
  .join(",");
if (liveArgTypes.replace(/\s+/g, " ") !== ARGTYPES.replace(/\s+/g, " ")) {
  console.error("GAGAL: signature di script tidak cocok dengan definisi live.");
  console.error("  script:", ARGTYPES);
  console.error("  live  :", liveArgTypes);
  process.exit(1);
}

fs.writeFileSync(
  path.resolve(process.cwd(), OUT),
  HEADER +
    "CREATE OR REPLACE FUNCTION public.create_order(\n" +
    PARAMS +
    "\n)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public'\nAS $function$\n" +
    patched +
    "\n$function$;\n\n" +
    "-- Grant wajib diulang SETELAH create or replace (lihat gotchas #24: drop\n" +
    "-- menghapus ACL, dan supaya peran baru ikut dapat hak akses).\n" +
    "grant execute on function public.create_order(" +
    ARGTYPES +
    ") to anon, authenticated, service_role;\n\n" +
    "comment on function public.create_order(" +
    ARGTYPES +
    ") is\n" +
    "  'Migration-56: p_po_batch_id tidak boleh NULL. Tidak ada batch PO yang\n" +
    "  dipilih = pesanan ditolak (no_active_batch). Jalur pemesanan tanpa batch\n" +
    "  memakai categories.stock sudah dihapus.';\n",
  "utf8"
);

console.log("\nDITULIS:", OUT, fs.statSync(path.resolve(process.cwd(), OUT)).size, "bytes");

await c.end();