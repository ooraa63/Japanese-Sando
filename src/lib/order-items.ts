/**
 * Baris item pesanan untuk tampilan pembeli.
 *
 * LATAR BELAKANG (Steven 17-10-2026, gambar 2):
 * kolom `order_items.flavor_name` untuk item paket sengaja diberi sufiks
 * internal supaya dua slot dengan rasa yang sama tidak tertukar, misalnya
 * `Cookies & Cream (Sando 2 #1)`. Sufiks itu alat pembukuan, bukan kalimat
 * untuk pembaca: di halaman lacak pesanan ia tampil apa adanya sehingga
 * pembeli sempat mengira "(Sando 2 #1)" bagian dari nama rasa.
 *
 * Modul ini jadi SATU tempat yang tahu bentuk sufiks itu. Semua tampilan
 * pembeli (halaman lacak, ringkasan invoice, invoice untuk diunduh/cetak)
 * wajib lewat sini, bukan menebak sendiri di tiap komponen.
 */

import type { InvoiceBundleEntry, InvoiceFlatItem } from "./types";

/** `Cookies & Cream (Sando 2 #1)` -> nama `Cookies & Cream`, paket `Sando 2`. */
const SUFISK_SLOT = /^(.*?)\s*\(\s*(.+?)\s+#\s*(\d+)\s*\)$/;

export interface NamaItemTerbaca {
  /** Nama yang layak dibaca pembeli — sufiks internal sudah dibuang. */
  name: string;
  /** Nama paket kalau baris ini berasal dari paket, kalau tidak `null`. */
  bundleName: string | null;
  /** Nomor slot (1-based) kalau berasal dari paket, kalau tidak `null`. */
  slot: number | null;
}

/** Pecah `flavor_name` jadi nama tampilan + info paketnya. */
export function bacaNamaItem(raw: string | null | undefined): NamaItemTerbaca {
  const teks = (raw ?? "").trim();
  const cocok = SUFISK_SLOT.exec(teks);
  if (!cocok) return { name: teks, bundleName: null, slot: null };
  const slot = Number(cocok[3]);
  return {
    name: cocok[1].trim(),
    bundleName: cocok[2].trim(),
    slot: Number.isFinite(slot) ? slot : null,
  };
}

/** Nama apa adanya tanpa sufiks internal. */
export function namaTanpaSufiks(raw: string | null | undefined): string {
  return bacaNamaItem(raw).name;
}

/** Satu baris item pesanan yang sudah dibersihkan. */
export interface BarisPesanan {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  /** Nama paket kalau baris ini dari paket, kalau tidak `null`. */
  bundleName: string | null;
  /** Nomor slot kalau dari paket, kalau tidak `null`. */
  slot: number | null;
}

/** Satu paket yang utuh, lengkap dengan baris slot dan harganya. */
export interface PaketPesanan {
  bundleId: number | null;
  bundleName: string;
  rows: BarisPesanan[];
  /**
   * Harga paket. `null` kalau tidak bisa dihitung karena sumber datanya
   * snapshot lokal (yang tidak menyimpan harga per slot) — pemanggil harus
   * menyembunyikan harga kalau nilainya `null`, bukan menulis `Rp 0`.
   */
  total: number | null;
  note?: string | null;
}

export interface PesananTerbelah {
  /** Baris rasa biasa (yang dibeli satuan, bukan dari paket). */
  biasa: BarisPesanan[];
  paket: PaketPesanan[];
}

/** Ubah `flat_items` dari RPC jadi baris bersih. */
export function barisPesanan(flat: InvoiceFlatItem[]): BarisPesanan[] {
  return (flat ?? []).map((it) => {
    const nama = bacaNamaItem(it.flavor_name);
    return {
      name: nama.name,
      quantity: Number(it.quantity ?? 0),
      unit_price: Number(it.unit_price ?? 0),
      line_total: Number(it.line_total ?? 0),
      bundleName: nama.bundleName,
      slot: nama.slot,
    };
  });
}

function kunciNama(nama: string): string {
  return nama.trim().toLowerCase();
}

/**
 * Pecah isi pesanan jadi "rasa biasa" dan "paket".
 *
 * `bundles` (dari RPC publik atau snapshot lokal) dipakai sebagai sumber
 * nama paket supaya namanya ikut bahasa tampilan. Baris yang dikenali lewat
 * sufiks dicocokkan ke paket itu lewat nama; sisa baris ber-sufiks yang tidak
 * cocok dikumpulkan sendiri memakai nama dari sufiks, supaya tidak pernah ada
 * harga yang hilang.
 *
 * Kalau `bundles` kosong tapi baris ber-sufiks ada (mis. RPC versi lama),
 * paket tetap dibuat dari sufiks.
 */
export function pecahPesanan(
  flat: InvoiceFlatItem[],
  bundles: InvoiceBundleEntry[] | null | undefined,
): PesananTerbelah {
  const semua = barisPesanan(flat ?? []);
  const biasa: BarisPesanan[] = [];
  const paketRows = new Map<string, BarisPesanan[]>();

  for (const baris of semua) {
    if (!baris.bundleName) {
      biasa.push(baris);
      continue;
    }
    const k = kunciNama(baris.bundleName);
    const daftar = paketRows.get(k) ?? [];
    daftar.push(baris);
    paketRows.set(k, daftar);
  }

  const paket: PaketPesanan[] = [];
  const terpakai = new Set<string>();
  /** `bundle_id` yang sudah dipakai — migration-63 memperbaiki `track_by_code`
   * yang dulu mengembalikan satu objek per slot, jadi paket dua slot muncul dua
   * kali. Penjaga ini memastikan data lama / cache lama tetap aman. */
  const idTerpakai = new Set<number>();

  for (const bg of bundles ?? []) {
    if (idTerpakai.has(bg.bundle_id)) continue;
    idTerpakai.add(bg.bundle_id);
    const k = kunciNama(bg.bundle_name ?? "");
    const rows = paketRows.get(k);
    if (rows) terpakai.add(k);
    paket.push({
      bundleId: bg.bundle_id,
      bundleName: bg.bundle_name,
      // Snapshot lokal (sesaat setelah pesanan dibuat) tidak menyimpan harga
      // per slot. Baris-nya tetap dibangun dari daftar slot supaya paketnya
      // tidak hilang, tapi `total` = null supaya pemanggil menyembunyikan harga
      // alih-alih menulis "Rp 0".
      rows: rows
        ? [...rows].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0))
        : (bg.slots ?? []).map((s) => ({
            name: namaTanpaSufiks(s.flavor_name),
            quantity: 1,
            unit_price: 0,
            line_total: 0,
            bundleName: bg.bundle_name,
            slot: s.slot ?? null,
          })),
      total: rows ? rows.reduce((s2, r) => s2 + r.line_total, 0) : null,
      note: bg.note ?? null,
    });
  }

  // Paket yang namanya tidak ada di `bundles`, atau `bundles` kosong sama
  // sekali: tetap tampil sebagai paket supaya tidak ada harga yang hilang.
  for (const [k, rows] of paketRows) {
    if (terpakai.has(k)) continue;
    const nama = rows.find((r) => r.bundleName)?.bundleName ?? "";
    paket.push({
      bundleId: null,
      bundleName: nama,
      rows: [...rows].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0)),
      total: rows.reduce((s, r) => s + r.line_total, 0),
      note: null,
    });
  }

  return { biasa, paket };
}

/**
 * Baris rasa biasa saja, TANPA baris paket.
 *
 * Dipakai kalau pemanggil sudah menampilkan paket lewat `PaketPesanan`, supaya
 * isi paket tidak tampil dua kali.
 */
export function barisBiasaSaja(flat: InvoiceFlatItem[]): BarisPesanan[] {
  return barisPesanan(flat ?? []).filter((r) => !r.bundleName);
}