/* eslint-disable */
/**
 * Uji ujung-ke-ujung migration-53 lewat REST API (butuh sesi admin, karena
 * admin_save_po_batch_flavors memanggil public.is_admin()).
 *
 * Semua data uji dibersihkan di akhir supaya database Steven utuh.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.resolve(process.cwd(), file);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  }
}
loadEnv();

const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!KEY || !BASE) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / PUBLISHABLE_KEY belum ada.");
  process.exit(1);
}

let pass = 0,
  fail = 0;
const check = (name, ok, extra = "") => {
  console.log(`  ${ok ? "OK   " : "GAGAL"} ${name}${extra ? " " + extra : ""}`);
  if (ok) pass++;
  else fail++;
};

async function rpc(name, args, token) {
  const res = await fetch(`${BASE}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: res.ok, status: res.status, body };
}

// --- Sesi admin -----------------------------------------------------------
if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.log("Set ADMIN_EMAIL + ADMIN_PASSWORD untuk menjalankan tes ini.");
  process.exit(1);
}
const login = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }),
});
const session = (await login.json()).access_token;
if (!session) {
  console.log("Gagal login admin. Cek ADMIN_EMAIL/ADMIN_PASSWORD.");
  process.exit(1);
}
console.log("Masuk sebagai admin: OK\n");

// --- Persiapan data uji ---------------------------------------------------
const list = await rpc("admin_list_po_batches", {}, session);
// RPC ini membungkus hasilnya: { batches: [...] }.
const raw = list.body;
const batches = Array.isArray(raw) ? raw : Array.isArray(raw?.batches) ? raw.batches : [];
if (batches.length === 0) {
  console.log("admin_list_po_batches tidak mengembalikan baris.");
  console.log("status:", list.status, "body:", JSON.stringify(raw).slice(0, 300));
  process.exit(0);
}
const batch = batches[0];
// public_po_batch_for_date memilih batch dengan SISA STOK TERKECIL dari yang
// tersedia (memang begitu sejak migration-49). Kalau cuma satu batch yang diset,
// RPC bisa saja memilih batch lain dan tesnya jadi salah sasaran. Jadi
// allowlist + stok sementara dipasang ke SEMUA batch aktif untuk tes ini.
const ujiBatches = batches.filter((b) => b.is_active === true);
const scope = ujiBatches.length > 0 ? ujiBatches : [batch];
const stokAwal = new Map(scope.map((b) => [b.id, b.stok?.[30]?.stock]));
console.log(
  "Batch uji:",
  JSON.stringify(scope.map((b) => ({ id: b.id, label: b.label })))
);

// Batch yang bisa diuji harus sedang aktif (create_order menolak kalau lewat).
const aktif = batch.is_active === true;

const detail0 = await rpc("admin_list_po_batch_detail", { p_batch_id: batch.id }, session);
const flavors = (detail0.body?.flavors ?? []).slice(0, 2);
check("detail batch mengirim key flavors", Array.isArray(detail0.body?.flavors));
check(
  "detail batch mengirim semua_rasa_aktif (true = belum diset)",
  detail0.body?.semua_rasa_aktif === true
);

if (flavors.length < 2) {
  console.log("Rasa aktif kurang dari 2 — tes penyaringan dilewati.");
} else {
  const [f1, f2] = flavors;
  console.log(`\nMengizinkan rasa ${f1.nama} (${f1.flavor_id}), menyembunyikan ${f2.nama} (${f2.flavor_id})\n`);

  // --- TES 1: simpan allowlist di SEMUA batch aktif -----------------------
  // Penting: public_po_batch_for_date memilih batch dengan sisa terkecil, jadi
  // semua batch aktif harus diset agar hasilnya bisa diprediksi.
  let semuaTersimpan = true;
  for (const b of scope) {
    const r = await rpc(
      "admin_save_po_batch_flavors",
      { p_batch_id: b.id, p_flavors: [{ flavor_id: f1.flavor_id, is_active: true }] },
      session
    );
    if (!r.ok) semuaTersimpan = false;
  }
  check("admin_save_po_batch_flavors berhasil", semuaTersimpan);

  const detail1 = await rpc("admin_list_po_batch_detail", { p_batch_id: batch.id }, session);
  check("semua_rasa_aktif jadi false setelah memilih 1 rasa", detail1.body?.semua_rasa_aktif === false);
  const dipakai = (detail1.body?.flavors ?? []).filter((f) => f.dipakai).map((f) => f.flavor_id);
  check(
    "hanya rasa yang dipilih yang ditandai dipakai",
    dipakai.length === 1 && dipakai[0] === f1.flavor_id,
    JSON.stringify(dipakai)
  );

  // --- TES 2: RPC publik mengirim allowlist -------------------------------
  // Batch harus punya sisa stok > 0 supaya `per_batch` tidak nol.
  for (const b of scope) {
    await rpc(
      "admin_save_po_batch_stock",
      // Bentuk p_stock: { "<categoryId>": { stock: N } } — bukan angka langsung.
      { p_batch_id: b.id, p_stock: { 30: { stock: 50 } } },
      session
    );
  }
  const cekStok = await rpc("admin_list_po_batch_detail", { p_batch_id: batch.id }, session);
  const stokTersimpan = (cekStok.body?.stok ?? []).find((s) => s.category_id === 30)?.sisa;
  check(
    "stok batch benar-benar tersimpan untuk tes",
    stokTersimpan === 50,
    `tersimpan=${stokTersimpan}`
  );

  const pub = await rpc("public_po_batch_for_date", { p_pickup_date: batch.pickup_date });
  const pubBatch = pub.body;
  if (pubBatch) {
    check(
      "RPC publik mengirim key flavors",
      Array.isArray(pubBatch.flavors),
      JSON.stringify(pubBatch.flavors)
    );
    check(
      "RPC publik hanya mengirim rasa yang diizinkan",
      Array.isArray(pubBatch.flavors) &&
        pubBatch.flavors.length === 1 &&
        Number(pubBatch.flavors[0]) === Number(f1.flavor_id),
      JSON.stringify(pubBatch.flavors)
    );
  } else {
    console.log("  GAGAL RPC publik. status:", pub.status, "body:", JSON.stringify(pubBatch).slice(0, 400));
  }

  // --- TES 3: create_order menolak rasa tersembunyi ----------------------
  if (aktif) {
    const base = {
      p_customer_name: "Uji Migration 53",
      p_phone: "081234567890",
      p_payment_method: "transfer",
      p_delivery_method: "pickup",
      p_delivery_zone: "pickup",
      p_po_batch_id: batch.id,
      p_pickup_date: batch.pickup_date,
    };
    const hidden = await rpc("create_order", {
      ...base,
      p_items: [{ flavor_id: f2.flavor_id, quantity: 1 }],
    });
    const allowed = await rpc("create_order", {
      ...base,
      p_items: [{ flavor_id: f1.flavor_id, quantity: 1 }],
    });

    const hiddenMsg = JSON.stringify(hidden.body ?? "");
    check(
      "create_order MENOLAK rasa tersembunyi",
      hidden.status >= 400 && hiddenMsg.includes("flavor_unavailable"),
      `status=${hidden.status} ${hiddenMsg.slice(0, 100)}`
    );

    if (allowed.ok) {
      const code = allowed.body?.order_code;
      check("create_order MENERIMA rasa yang diizinkan", Boolean(code), String(code));
      if (code) {
        await fetch(
          `${BASE}/rest/v1/orders?order_code=eq.${encodeURIComponent(code)}`,
          { method: "DELETE", headers: { apikey: KEY, Authorization: `Bearer ${session}` } }
        );
        console.log(`  (order uji ${code} dihapus)`);
      }
    } else {
      check(
        "create_order MENERIMA rasa yang diizinkan",
        false,
        `status=${allowed.status} ${JSON.stringify(allowed.body).slice(0, 120)}`
      );
    }
  } else {
    console.log("  (lewat: batch tidak aktif, create_order akan menolak dengan batch_closed)");
  }

  // --- BERSIHKAN ----------------------------------------------------------
  console.log("");
  let semuaBersih = true;
  for (const b of scope) {
    const r = await rpc("admin_save_po_batch_flavors", { p_batch_id: b.id, p_flavors: [] }, session);
    if (!r.ok) semuaBersih = false;
  }
  const detail2 = await rpc("admin_list_po_batch_detail", { p_batch_id: batch.id }, session);
  check(
    "allowlist uji dibersihkan di semua batch (semua_rasa_aktif kembali true)",
    semuaBersih && detail2.body?.semua_rasa_aktif === true
  );

  // Kembalikan stok batch ke nilai semula supaya angka di layar Steven tidak berubah.
  for (const b of scope) {
    const awal = stokAwal.get(b.id);
    if (typeof awal === "number") {
      await rpc(
        "admin_save_po_batch_stock",
        { p_batch_id: b.id, p_stock: { 30: { stock: awal } } },
        session
      );
      console.log(`(stok batch ${b.id} dikembalikan ke ${awal})`);
    }
  }
}

console.log(`\n=== RINGKASAN: ${pass} OK, ${fail} GAGAL ===`);
process.exit(fail === 0 ? 0 : 1);