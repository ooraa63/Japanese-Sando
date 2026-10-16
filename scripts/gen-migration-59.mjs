// =============================================================================
//  gen-migration-59.mjs
//  Bentuk bagian "@@GEN@@" dari supabase/migration-59.sql.
//
//  Empat fungsi yang diganti (`admin_save_bundle`, `admin_list_bundles`,
//  `public_menu`, `create_order`) masing-masing beratus baris. Menyalin ulang
//  secara manual dari body live ke file migration adalah tempat salah ketik
//  paling mungkin terjadi, jadi file ini membacanya langsung dari `pg_proc`
//  lalu menempelkan hasil tempurannya dengan pemeriksaan yang menggagalkan.
//
//  Setiap penggantian WAJIB cocok tepat sekali. Kalau body live sudah berubah
//  (mis. ada migration yang griev), script ini berhenti dengan pesan, bukan
//  diam-diam menghasilkan migration yang tidak sesuai.
//
//  Jalankan:  node scripts/gen-migration-59.mjs
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

const MIGRASI = path.resolve(process.cwd(), "supabase/migration-59.sql");
const GEN = /^-- @@GEN@@$/m;
// Awal bagian yang di-generate. Dipakai supaya file bisa di-generate ulang.
const BAGIAN_GEN = /^-- ={10,} 3\. BANTUAN$/m;

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

/** Body + identitas fungsi, langsung dari database. */
async function ambil(nama) {
  const r = await c.query(
    `select p.proname,
            p.prosrc,
            pg_get_function_arguments(p.oid) as args,
            pg_get_function_identity_arguments(p.oid) as id_args,
            pg_get_function_result(p.oid)     as hasil,
            p.prosecdef,
            case p.provolatile when 'v' then 'volatile'
                                when 's' then 'stable'
                                else 'immutable' end as volatil,
            l.lanname
       from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       join pg_language l on l.oid = p.prolang
      where ns.nspname = 'public' and p.proname = $1
      order by p.oid
      limit 1`,
    [nama],
  );
  if (r.rows.length === 0) throw new Error("Fungsi tidak ada di DB: " + nama);
  return r.rows[0];
}

/**
 * Tempur-potongan. Setiap entri harus cocok PADA SEKALI di body; kalau tidak,
 * migration tidak boleh dibuat diam-diam.
 *
 * PENTING: `ganti` SELALU dipasang sebagai fungsi, bukan string. Dalam
 * `String.replace`, string pengganti memperlakukan `$` sebagai pola
 * (`$&`, `$'`, `` $` ``, `$1`). SQL punya regex anchoring seperti
 * `'^[0-9]+$'`, dan `$'` berarti "sisanya setelah kecocokan" - sekali punya
 * pola itu, sisa body lama ikut tersisip ke dalam migration.
 */
function tempur(body, nama, potongan) {
  let hasil = body;
  for (const [cari, ganti, alasan] of potongan) {
    const n = hasil.split(cari).length - 1;
    if (n !== 1) {
      throw new Error(
        "Tempuran untuk " + nama + " cocok " + n + " kali, harus tepat 1.\n" +
          "  Pencari : " + JSON.stringify(cari.slice(0, 110)) + "\n" +
          "  Alasan  : " + alasan
      );
    }
    hasil = hasil.replace(cari, () => ganti);
  }
  return hasil;
}

/**
 * Tempur satu baris pola, dicocokkan dengan regex. Dipakai kalau teks
 * aslinya berisi karakter yang tidak aman disalin ulang (tanda baca,
 * garis em-dash, dan sejenisnya) sehingga menyalinnya manual justru
 * berisiko salah. Pencocokan harus PADA SEKALI.
 */
function tempurRegex(body, nama, re, ganti, alasan) {
  const n = (body.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).length;
  if (n !== 1) {
    throw new Error(
      "Tempuran regex untuk " + nama + " cocok " + n + " kali, harus tepat 1.\n" +
        "  Pola    : " + re.source + "\n" +
        "  Alasan  : " + alasan
    );
  }
  return body.replace(re, ganti);
}

/**
 * Bungkus body jadi `create or replace function` yang lengkap.
 *
 * Header pakai `pg_get_function_arguments` (DENGAN nilai default), bukan
 * `pg_get_function_identity_arguments`. `create_order` punya banyak parameter
 * ber-default; kalau default-nya hilang, PostgreSQL menolak dengan
 * "cannot remove parameter defaults from existing function".
 *
 * Grant tetap pakai identity arguments, karena di situ yang dibutuhkan hanya
 * nama + tipenya.
 */
function bungkus(f, body) {
  const header = f.args;
  const identitas = f.id_args;
  return [
    "create or replace function public." + f.proname + "(" + header + ")",
    "returns " + f.hasil,
    "language " + f.lanname,
    f.prosecdef ? "security definer" : "security invoker",
    "set search_path = public",
    "as $fn$",
    body.replace(/\s+$/, ""),
    "$fn$;",
    "",
    "grant execute on function public." + f.proname + "(" + identitas + ")",
    "  to postgres, authenticated, service_role;",
    "",
  ].join("\n");
}

const bagian = [];
bagian.push("-- ============================================================ 3. BANTUAN");
bagian.push(
  [
    "-- Satu helper untuk membaca pilihan sebuah paket sebagai JSON.",
    "-- Dipakai `public_menu()` (pembeli) dan `admin_list_bundles()` (admin),",
    "-- supaya bentuk JSON-nya hanya punya satu definisi di database.",
    "--",
    "-- Hanya membaca `bundle_slots` dan `bundle_slot_flavors`, yang keduanya",
    "-- sudah boleh dibaca publik, jadi tidak menambah permukaan akses baru.",
    "",
  ].join("\n")
);

// ---------------------------------------------------------------- helper
bagian.push(
  [
    "create or replace function public.bundle_slot_groups(p_bundle_id bigint)",
    "returns jsonb",
    "language sql",
    "stable",
    "security definer",
    "set search_path = public",
    "as $fn$",
    "  select coalesce((",
    "    select jsonb_agg(",
    "      jsonb_build_object(",
    "        'index', s.slot_index,",
    "        'label_id', s.label_id,",
    "        'label_en', s.label_en,",
    "        'flavor_ids', coalesce((",
    "          select jsonb_agg(bsf.flavor_id order by bsf.flavor_id)",
    "            from public.bundle_slot_flavors bsf",
    "           where bsf.bundle_slot_id = s.id",
    "        ), '[]'::jsonb)",
    "      ) order by s.slot_index",
    "    )",
    "    from public.bundle_slots s",
    "   where s.bundle_id = p_bundle_id",
    "  ), '[]'::jsonb);",
    "$fn$;",
    "",
    "grant execute on function public.bundle_slot_groups(bigint)",
    "  to postgres, authenticated, service_role;",
    "",
  ].join("\n")
);

// ---------------------------------------------------------------- fitur
bagian.push(
  [
    "-- Penanda kapabilitas untuk sisi admin.",
    "--",
    "-- Tanpa ini, editor paket akan menampilkan mode \"pilihan\" bahkan kalau",
    "-- migration ini belum terpasang: `admin_save_bundle` versi lama diam-diam",
    "-- MENGABAIKAN kunci `slots` yang tidak dikenal, jadi admin akan melihat",
    "-- paket tersimpan tanpa pilihan apa pun dan tidak akan pernah sadar.",
    "-- Panggil dari server, bukan dari browser.",
    "",
  ].join("\n")
);

bagian.push(
  [
    "create or replace function public.bundle_features()",
    "returns jsonb",
    "language sql",
    "stable",
    "security definer",
    "set search_path = public",
    "as $fn$",
    "  select jsonb_build_object(",
    "    'choices', true,",
    "    'max_choices', 10",
    "  );",
    "$fn$;",
    "",
    "grant execute on function public.bundle_features()",
    "  to postgres, authenticated, service_role;",
    "",
  ].join("\n")
);

// ---------------------------------------------------------------- admin_list_bundles
bagian.push("-- ============================================================ 4. DAFTAR UNTUK ADMIN");
bagian.push("");
{
  const f = await ambil("admin_list_bundles");
  const body = tempur(
    f.prosrc,
    "admin_list_bundles",
    [
      [
        "        'is_fixed', b.is_fixed,\n        'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)\n                                from public.bundle_flavors bf where bf.bundle_id = b.id),\n                               '[]'::jsonb)",
        "        'is_fixed', b.is_fixed,\n        'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)\n                                from public.bundle_flavors bf where bf.bundle_id = b.id),\n                               '[]'::jsonb),\n        'slots', public.bundle_slot_groups(b.id)",
        "kirim daftar pilihan setiap paket ke editor admin",
      ],
    ]
  );
  bagian.push(bungkus(f, body));
}

// ---------------------------------------------------------------- public_menu
bagian.push("-- ============================================================ 5. MENU PUBLIK");
bagian.push("");
{
  const f = await ambil("public_menu");
  const sTarget =
    "        'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)\n                                from public.bundle_flavors bf where bf.bundle_id = b.id),\n                               '[]'::jsonb)";
  const sGanti =
    "        'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)\n                                from public.bundle_flavors bf where bf.bundle_id = b.id),\n                               '[]'::jsonb),\n        'slots', public.bundle_slot_groups(b.id)";
  // Dua cabang punya indent berbeda, jadi dua potongan terpisah. Keduanya
  // harus cocok tepat satu kali.
  const body = tempur(f.prosrc, "public_menu", [
    [
      "            'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)\n                                    from public.bundle_flavors bf where bf.bundle_id = b.id),\n                                   '[]'::jsonb)",
      "            'flavor_ids', coalesce((select jsonb_agg(bf.flavor_id order by bf.flavor_id)\n                                    from public.bundle_flavors bf where bf.bundle_id = b.id),\n                                   '[]'::jsonb),\n            'slots', public.bundle_slot_groups(b.id)",
      "cabang per-kategori ikut membawa daftar pilihan",
    ],
    [
      sTarget,
      sGanti,
      "cabang bundle berdiri sendiri ikut membawa daftar pilihan",
    ],
  ]);
  bagian.push(bungkus(f, body));
}

// ---------------------------------------------------------------- admin_save_bundle
bagian.push("-- ============================================================ 6. SIMPAN PAKET");
bagian.push("");
{
  const f = await ambil("admin_save_bundle");

  // 6a. Deklarasi variabel baru.
  const dek = tempur(
    f.prosrc,
    "admin_save_bundle:deklarasi",
    [
      [
        "  v_is_fixed  boolean;\n  v_flavor_cnt integer;\nbegin",
        "  v_is_fixed  boolean;\n  v_flavor_cnt integer;\n" +
          "  -- migration-59: daftar pilihan per paket.\n" +
          "  v_slots      jsonb;\n" +
          "  v_slot_cnt   integer;\n" +
          "  v_bad        integer;\n" +
          "begin",
        "butuh jsonb payload + penghitung jumlah pilihan",
      ],
      [
        "  v_is_fixed := coalesce((p_payload ->> 'is_fixed')::boolean, false);",
        "  v_is_fixed := coalesce((p_payload ->> 'is_fixed')::boolean, false);\n" +
          "  -- migration-59: `slots` ada = mode PILIHAN. `slots` tidak ada = paket\n" +
          "  -- ini tidak memakai mode baru, jadi baris `bundle_slots`-nya tidak\n" +
          "  -- boleh disentuh. `slots: []` = kembalikan ke mode biasa.\n" +
          "  v_slots := p_payload -> 'slots';",
        "ambil payload slots sebelum validasi biasa",
      ],
    ]
  );

  // 6b. Blok baru, disisipkan setelah blok `flavor_ids`.
  const blok = tempur(
    dek,
    "admin_save_bundle:blok-slots",
    [
      [
        "  -- (migration-54) Mode terkunci: daftar rasa adalah ISI paket, jadi",
        [
          "  -- (migration-59) Mode PILIHAN: tiap pilihan punya daftar rasa sendiri.",
          "  -- Dijalankan kalau payload mengirim kunci `slots`.",
          "  --",
          "  -- Validasi dilakukan TERLEBIH DAHULU, sebelum baris lama dihapus, supaya",
          "  -- paket yang gagal disimpan tidak ikut kehilangan konfigasinya.",
          "  if jsonb_typeof(v_slots) = 'array' then",
          "    if jsonb_array_length(v_slots) > 10 then",
          "      raise exception 'invalid_bundle_slots' using errcode = '22023';",
          "    end if;",
          "",
          "    -- Tiap pilihan wajib punya minimal satu rasa. Pilihan kosong berarti",
          "    -- pembeli tidak bisa menyelesaikan paketnya sendiri.",
          "    select count(*) into v_bad",
          "    from jsonb_array_elements(v_slots) e(item)",
          "    where jsonb_typeof(e.item) is distinct from 'object'",
          "       or jsonb_typeof(e.item -> 'flavor_ids') is distinct from 'array'",
          "       or jsonb_array_length(e.item -> 'flavor_ids') = 0;",
          "    if v_bad > 0 then",
          "      raise exception 'invalid_bundle_slots' using errcode = '22023';",
          "    end if;",
          "",
          "    -- Id rasa harus benar-benar ada. Daftar yang diam-diam dropping id",
          "    -- salah akan membuat admin mengira rasa itu sudah masuk padahal",
          "    -- pembeli tidak pernah bisa memilihnya.",
          "    select count(*) into v_bad",
          "    from jsonb_array_elements(v_slots) e(item)",
          "    cross join lateral jsonb_array_elements_text(",
          "      case when jsonb_typeof(e.item -> 'flavor_ids') = 'array'",
          "           then e.item -> 'flavor_ids' else '[]'::jsonb end",
          "    ) f(value)",
          "    where btrim(f.value) !~ '^[0-9]+$'",
          "       or not exists (select 1 from public.flavors fl where fl.id::text = btrim(f.value));",
          "    if v_bad > 0 then",
          "      raise exception 'invalid_bundle_slots' using errcode = '22023';",
          "    end if;",
          "",
          "    select count(*) into v_slot_cnt from jsonb_array_elements(v_slots);",
          "",
          "    -- Ganti seluruh pilihan lama. `slot_index` diambil dari posisi",
          "    -- array, jadi tidak pernah bentrok dan selalu 1..N tanpa lubang.",
          "    delete from public.bundle_slot_flavors bsf",
          "     where bsf.bundle_slot_id in (select id from public.bundle_slots where bundle_id = v_id);",
          "    delete from public.bundle_slots where bundle_id = v_id;",
          "",
          "    insert into public.bundle_slots (bundle_id, slot_index, label_id, label_en)",
          "    select v_id,",
          "           s.ord::int,",
          "           coalesce(nullif(btrim(coalesce(s.item ->> 'label_id', '')), ''), 'Pilihan ' || s.ord::text),",
          "           coalesce(nullif(btrim(coalesce(s.item ->> 'label_en', '')), ''), 'Choice ' || s.ord::text)",
          "    from jsonb_array_elements(v_slots) with ordinality as s(item, ord);",
          "",
          "    insert into public.bundle_slot_flavors (bundle_slot_id, flavor_id)",
          "    select bs.id, fl.id",
          "    from jsonb_array_elements(v_slots) with ordinality as s(item, ord)",
          "    join public.bundle_slots bs",
          "      on bs.bundle_id = v_id and bs.slot_index = s.ord::int",
          "    cross join lateral jsonb_array_elements_text(s.item -> 'flavor_ids') f(value)",
          "    join public.flavors fl on fl.id::text = btrim(f.value)",
          "    on conflict do nothing;",
          "",
          "    -- Dua hal yang harus selalu jalan bareng:",
          "    --   required_qty = jumlah pilihan (dibaca create_order untuk",
          "    --   mengecek panjang `slots` dan membagi harga paket),",
          "    --   is_fixed = false, karena paket yang punya pilihan berubah dan",
          "    --   paket terkunci jelas bukan hal yang sama.",
          "    -- Dipaksa, bukan ditolak, supaya paket yang tersimpan selalu bisa",
          "    -- dibeli. UI admin tidak pernah mengirim keduanya sekaligus.",
          "    update public.bundles",
          "       set required_qty = v_slot_cnt,",
          "           is_fixed = false",
          "     where id = v_id;",
          "    v_qty := v_slot_cnt;",
          "  end if;",
          "",
          "  -- (migration-54) Mode terkunci: daftar rasa adalah ISI paket, jadi",
        ].join("\n"),
        "sisipkan blok mode pilihan tepat sebelum pemeriksaan mode terkunci",
      ],
    ]
  );

  bagian.push(bungkus(f, blok));
}

// ---------------------------------------------------------------- create_order
bagian.push("-- ============================================================ 7. PEMESANAN");
bagian.push("");
{
  const f = await ambil("create_order");
  const body = tempur(f.prosrc, "create_order", [
    [
      [
        "      -- migration-54: slot bundle hanya boleh memakai rasa yang ada di",
        "      -- `bundle_flavors`. Daftar kosong = semua rasa boleh, jadi cek di-skip.",
        "      --",
        "      -- CATATAN: aturan ini sejak migration-45 hanya ada di overload 18",
        "      -- parameter, yang tidak pernah dipanggil aplikasi. Jalur produksi",
        "      -- (20 parameter) tidak memaksanya sama sekali.",
        "      if exists (select 1 from public.bundle_flavors where bundle_id = v_bundle_id)",
        "         and not exists (",
        "           select 1 from public.bundle_flavors",
        "            where bundle_id = v_bundle_id and flavor_id = v_slot_flavor_id",
        "         ) then",
        "        raise exception 'flavor_unavailable' using errcode = '22023';",
        "      end if;",
      ].join("\n"),
      [
        "      -- migration-59: paket dengan PILIHAN terpisah. Slot ke-`v_slot_idx`",
        "      -- hanya boleh memakai rasa dari daftar pilihan ke-`v_slot_idx`.",
        "      -- Warna rasa di slot lain tidak boleh dipakai di slot ini.",
        "      --",
        "      -- Kalau paket ini punya grup slot, whitelist rata `bundle_flavors`",
        "      -- DILEWATI sepenuhnya: yang berlaku cuma daftar per pilihan. Tanpa",
        "      -- elseif ini, paket yang sisa whitelist lamanya akan menolak rasa",
        "      -- dari pilihan kedua.",
        "      if exists (select 1 from public.bundle_slots where bundle_id = v_bundle_id) then",
        "        if (select count(*) from public.bundle_slots where bundle_id = v_bundle_id)",
        "           <> v_required_qty then",
        "          -- Jumlah pilihan tidak sama dengan jumlah slot yang diminta.",
        "          -- Paket ini tidak mungkin dibeli dengan benar.",
        "          raise exception 'flavor_unavailable' using errcode = '22023';",
        "        end if;",
        "        if not exists (",
        "          select 1",
        "          from public.bundle_slots s",
        "          join public.bundle_slot_flavors bsf on bsf.bundle_slot_id = s.id",
        "          where s.bundle_id = v_bundle_id",
        "            and s.slot_index = v_slot_idx",
        "            and bsf.flavor_id = v_slot_flavor_id",
        "        ) then",
        "          raise exception 'flavor_unavailable' using errcode = '22023';",
        "        end if;",
        "      elsif exists (select 1 from public.bundle_flavors where bundle_id = v_bundle_id) then",
        "        -- migration-54: slot bundle hanya boleh memakai rasa yang ada di",
        "        -- `bundle_flavors`. Daftar kosong = semua rasa boleh, jadi cek di-skip.",
        "        if not exists (",
        "           select 1 from public.bundle_flavors",
        "            where bundle_id = v_bundle_id and flavor_id = v_slot_flavor_id",
        "         ) then",
        "          raise exception 'flavor_unavailable' using errcode = '22023';",
        "        end if;",
        "      end if;",
      ].join("\n"),
      "daftar per pilihan menggantikan whitelist rata kalau paket ini punya pilihan",
    ],
    [
      [
        "    if v_bundle_rec.is_fixed then",
      ].join("\n"),
      [
        "    -- migration-59: paket yang punya daftar pilihan sudah diperiksa",
        "    -- keanggotaannya per slot di atas, termasuk duplikat antar slot yang",
        "    -- memang diizinkan. Mode terkunci tidak boleh ikut jalan untuk paket",
        "    -- seperti itu, jadi di-skip di sini.",
        "    if v_bundle_rec.is_fixed",
        "       and not exists (select 1 from public.bundle_slots where bundle_id = v_bundle_id) then",
      ].join("\n"),
      "mode terkunci dan mode pilihan tidak boleh berjalan bersamaan",
    ],
  ]);
  // Dua baris catatan lama tidak berlaku lagi sejak migration-59:
  // keanggotaan tiap slot sudah diperiksa di blok di atas, termasuk duplikat.
  // Teks aslinya memuat tanda baca yang sulit disalin ulang, jadi dibuang lewat
  // regex, bukan ditulis ulang manual.
  const rapikan = tempurRegex(
    body,
    "create_order:rapikan",
    /\. Cek keanggotaan di atas\n\s*-- sudah menolak rasa di luar daftar[^\n]*\n\s*-- \[strawberry, strawberry\][^\n]*\n/,
    ".\n",
    "hapus catatan lama yang sudah digantikan blok migration-59"
  );
  bagian.push(bungkus(f, rapikan));
}

// ---------------------------------------------------------------- tulis
//
// Idempoten: bagian hasil generate selalu dimulai dari header "3. BANTUAN",
// jadi setiap kali dijalankan, ekor file lama dibuang lebih dulu. Dengan begitu
// script ini boleh dijalankan berulang kali tanpa menumpuk hasil generate.
//
//
const statis = fs.readFileSync(MIGRASI, "utf8");
const geser = statis.search(BAGIAN_GEN);
const kepala =
  geser >= 0
    ? statis.slice(0, geser)
    : statis.replace(GEN, "");
if (kepala.trim() === "") {
  throw new Error("Bagian statis migration-59.sql hilang: " + MIGRASI);
}
const isi =
  kepala.replace(/\s+$/, "") +
  "\n\n" +
  bagian.join("\n").replace(/\s+$/, "") +
  "\n";
fs.writeFileSync(MIGRASI, isi, "utf8");

console.log("migration-59.sql ditulis ulang: " + isi.split("\n").length + " baris");
console.log("  helper + 4 RPC digenerate dari body live");
await c.end();
