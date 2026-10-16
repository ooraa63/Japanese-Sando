"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Gift,
  Sparkles,
  Check,
  AlertTriangle,
  Plus,
  Minus,
  Heart,
  MessageSquare,
  PackageX,
} from "lucide-react";
import type { Bundle, BundleChoiceSlot, Category, Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import type { CartBundleEntry } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { formatIDR } from "@/lib/utils";
import { remainingStockByCategory } from "@/lib/cart-stock";
import { PriceTag } from "./PriceTag";

/** Gradient fallback per flavor (sama dengan FlavorCard). */
const GRADIENTS = [
  "from-[#3a2415] to-[#6b4423]",
  "from-[#f6e3c0] to-[#c98a3f]",
  "from-[#5f7a3a] to-[#9cbf6a]",
  "from-[#8c5a2b] to-[#d9a15b]",
  "from-[#f7d7dc] to-[#e06b7f]",
];
function gradientFor(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

/**
 * Modal untuk memilih isi bundle. Layout: kartu sandwich-style
 * (gambar + nama + harga + +/- stepper) seperti OrderCategoryModal +
 * FlavorCard. Klik + untuk menambah slot, - untuk mengurangi. Catatan
 * bundle di bawah (1 note per bundle, berlaku untuk semua slot).
 *
 * Backend create_order menerima array `{bundle_id, slots: [{flavor_id} * N],
 * note}` dengan N = bundle.required_qty. Backend cek stok; validasi klien
 * hanya untuk memilih flavor yang allowed.
 *
 * (migration-59) Kalau `bundle.slots` tidak kosong, paket memakai MODE
 * PILIHAN: tiap pilihan punya daftar rasa sendiri dan pembeli mengambil TEPAT
 * SATU rasa per pilihan. Bentuk payload ke server tetap sama -- yang berubah
 * hanya apa yang boleh diisi di setiap slot. Status picked disimpan terpisah
 * dari `slots` supaya pilihan kedua boleh diisi sebelum yang pertama.
 */
export function OrderBundleModal({
  bundle,
  categories,
  open,
  onClose,
  soldCounts: soldCountsProp = {},
  editingEntry = null,
  stockOverride = null,
}: {
  bundle: Bundle | null;
  categories: Category[];
  open: boolean;
  onClose: () => void;
  soldCounts?: Record<number, number>;
  /**
   * Entry keranjang yang sedang diubah (permintaan Steven, 11-10-2026).
   *
   * Kalau diisi, modal dibuka dalam mode "ubah": slot terisi dari entry itu
   * dan tombol konfirmasi menulis ulang entry yang sama — bukan menambah
   * bundle kedua. Tanpa prop ini, perilaku lama (tambah baru) berlaku.
   */
  editingEntry?: CartBundleEntry | null;
  /** Sisa stok per kategori dari batch PO yang dipilih (lihat `po.ts`). */
  stockOverride?: Map<number, number> | null;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const toast = useToast();

  // Daftar slot rasa (Array<flavorId>). Boleh ada flavor yang sama
  // muncul beberapa kali — yaitu cara user pesan bundle "2x Cookies".
  // Reset otomatis oleh React karena parent (MenuBrowser) memberikan
  // `key` ke modal ini.
  const [slots, setSlots] = useState<Array<number>>([]);
  const [note, setNote] = useState<string>("");

  // (migration-59) Mode PILIHAN: `picks[i]` = rasa yang dipilih untuk
  // pilihan ke-i, `null` kalau belum. Dipisah dari `slots` karena di mode ini
  // urutan pengisian bebas — pembeli boleh mengisi pilihan 2 duluan, jadi
  // panjang array tidak bisa dipakai sebagai penanda "sudah terisi".
  const [picks, setPicks] = useState<Array<number | null>>([]);

  // Mode ubah: isi slot dari bundle yang sudah di keranjang supaya pembeli
  // melihat rasa yang sekarang terpakai dan tinggal menukarnya.
  // Dipakai SEKALI saat modal dibuka lewat `seededFor` (lihat di bawah)
  // supaya perubahan `editingEntry` tidak menimpa isian yang sedang dikerjakan.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !bundle) {
      seededFor.current = null;
      return;
    }
    const seedKey = editingEntry ? `${bundle.id}:${editingEntry.id}` : `${bundle.id}:new`;
    if (seededFor.current === seedKey) return;
    seededFor.current = seedKey;
    // `slots` di keranjang bertipe `(number | null)[]` (slot kosong masih
    // mungkin tersisa kalau produk dihapus). Slot null tidak bisa dipakai
    // sebagai pilihan, jadi dibuang saat diisi di sini.
    setSlots(
      bundle.is_fixed
        ? // (migration-54) Mode combo: isinya sudah ditentukan penjual, jadi
          // slot langsung terisi dari `flavor_ids` dan pembeli tidak memilih.
          // `flavor_ids` diurutkan supaya urutan tampilan stabil.
          [...(bundle.flavor_ids ?? [])].sort((a, b) => a - b)
        : editingEntry
          ? editingEntry.slots.filter((x): x is number => x !== null)
          : []
    );
    setNote(editingEntry?.note ?? "");
    // (migration-59) Mode PILIHAN: isi `picks` per pilihan supaya pembeli
    // melihat rasa yang sekarang terpakai dan tinggal menukarnya.
    const pilihanAwal: Array<number | null> = ((bundle.slots ?? []) as BundleChoiceSlot[])
      .map((s) => {
        const terisi = editingEntry?.slots[s.index - 1];
        return terisi != null && s.flavor_ids.includes(terisi) ? terisi : null;
      });
    setPicks(pilihanAwal);
  }, [open, bundle, editingEntry]);

  /**
   * (migration-59) Daftar pilihan paket. Non-kosong = mode PILIHAN.
   *
   * Mode ini menggantikan whitelist rata: satu paket, beberapa kelompok rasa,
   * pembeli mengambil satu rasa dari tiap kelompok.
   */
  const choices: BundleChoiceSlot[] = useMemo(
    () => (bundle?.slots ?? []) as BundleChoiceSlot[],
    [bundle]
  );
  const isChoice = choices.length > 0;

  /** Semua rasa aktif + nama kategorinya, sebagai sumber lookup. */
  const allFlavors: Array<Flavor & { categoryName: string }> = useMemo(() => {
    const list: Array<Flavor & { categoryName: string }> = [];
    for (const c of categories) {
      for (const f of c.flavors ?? []) {
        list.push({ ...f, categoryName: lang === "en" ? c.name_en : c.name_id });
      }
    }
    return list;
  }, [categories, lang]);

  /**
   * Rasa yang boleh dipilih — daftar ini ditentukan PENJUAL, bukan tebakan.
   *
   * Aturan (migration-45):
   *   1. Kalau penjual memilih rasa untuk bundle ini (`flavor_ids` tidak
   *      kosong), HANYA rasa itu yang tampil, dari kategori mana pun.
   *   2. Kalau daftar kosong, semua rasa aktif boleh dipakai — tidak ada lagi
   *      kuncian ke kategori "Sando Sandwich".
   *
   * (migration-59) Di mode PILIHAN whitelist rata tidak dipakai: yang berlaku
   * daftar per pilihan, jadi semua rasa harus ada di sini supaya tiap grid
   * pilihan bisa mencarinya.
   */
  const allowedFlavors: Array<Flavor & { categoryName: string }> = useMemo(() => {
    if (!bundle) return [];
    if (isChoice) return allFlavors;
    const picked = bundle.flavor_ids ?? [];
    const pickedSet = picked.length > 0 ? new Set(picked) : null;
    if (!pickedSet) return allFlavors;
    return allFlavors.filter((f) => pickedSet.has(f.id));
  }, [bundle, allFlavors, isChoice]);

  /**
   * Sisa stok per kategori, sudah dikurangi isian keranjang.
   *
   * Perhitungannya dipakai bersama dengan kartu rasa di halaman /order lewat
   * `remainingStockByCategory()`, supaya angka "Tersedia N" di modal dan di
   * kartu biasa selalu sama. Slot bundle yang sedang dipilih di modal ini
   * diteruskan sebagai `extraSlots`.
   *
   * PENTING saat mode ubah (`editingEntry`): entry yang sedang diubah harus
   * DIKECUALIKAN dari `cart.bundles`. Kalau tidak, slot lamanya ikut
   * mengurangi stok DAN `slots` baru juga mengurangi lagi — hasilnya stok
   * terlihat berkurang dobel dan pembeli bisa dikira "habis" padahal tidak.
   */
  /**
   * Slot yang SEDANG terisi, dipakai menghitung stok. Di mode PILIHAN
   * sumbernya `picks`, di mode lain `slots`.
   */
  const activePicks: number[] = useMemo(
    () => (isChoice ? picks.filter((x): x is number => x !== null) : slots),
    [isChoice, picks, slots]
  );

  const remainingByCategory = useMemo(() => {
    const otherBundles = editingEntry
      ? (cart.bundles ?? []).filter((b) => b.id !== editingEntry.id)
      : (cart.bundles ?? []);
    return remainingStockByCategory(
      categories,
      cart.quantities,
      otherBundles,
      activePicks,
      stockOverride
    );
  }, [
    categories,
    cart.quantities,
    cart.bundles,
    activePicks,
    editingEntry,
    stockOverride,
  ]);

  // (migration-54) Mode COMBO: isi paket sudah ditentukan penjual sepenuhnya.
  // Pembeli tidak memilih apa-apa — slot otomatis terisi dari `flavor_ids`,
  // dan yang ditampilkan hanya chip readonly.
  const isFixed = Boolean(bundle?.is_fixed);
  // Rasa yang benar-benar terisi di mode combo (dipakai untuk chip & label).
  // DIATAS guard `if (!bundle) return null` karena useMemo adalah hook —
  // memanggilnya setelah early return bikin urutan hook berubah antar render.
  const fixedContents = useMemo(
    () =>
      slots
        .map((id) => allowedFlavors.find((f) => f.id === id))
        .filter((f): f is Flavor & { categoryName: string } => Boolean(f)),
    [slots, allowedFlavors]
  );

  if (!bundle) return null;

  const name = lang === "en" ? bundle.name_en : bundle.name_id;
  const desc = lang === "en" ? bundle.desc_en : bundle.desc_id;
  const requiredQty = bundle.required_qty;
  // (migration-59) Di mode PILIHAN, "terisi" berarti setiap pilihan punya satu
  // rasa — bukan sekadar banyaknya rasa yang diklik.
  const filledCount = isChoice
    ? picks.filter((x) => x !== null).length
    : slots.length;
  const allFilled = filledCount === requiredQty;
  /** Slot yang dikirim ke server, urut sesuai nomor pilihannya. */
  const slotsForOrder: number[] = isChoice
    ? choices.map((s) => picks[s.index - 1]).filter((x): x is number => x !== null)
    : slots;
  // Penjual yang menentukan isi bundle: kalau `flavor_ids` terisi, pembeli
  // hanya boleh memilih rasa dari daftar itu. Kalau kosong, semua rasa bebas.
  const isCurated = (bundle.flavor_ids ?? []).length > 0;

  function addOne(flavorId: number) {
    const catId = allowedFlavors.find((f) => f.id === flavorId)?.category_id;
    const left =
      catId != null ? (remainingByCategory.get(catId) ?? null) : null;
    // Hormati sisa stok kategori: jangan sampai slot baru membuat total
    // melebihi yang tersedia (backend tetap memvalidasi, tapi lebih baik
    // dicegah di sini supaya langkah tambah di UI).
    //
    // `left` di atas SUDAH memotong slot yang sedang dipilih, jadi cukup
    // cek <= 0. Tidak ada batasan per rasa — satu rasa boleh dipilih
    // berulang selama stok kategori masih cukup.
    if (left !== null && left <= 0) {
      const flavor = allowedFlavors.find((f) => f.id === flavorId);
      toast.warning(
        flavor ? (lang === "en" ? flavor.name_en : flavor.name_id) : "",
        t.order.menu.stockLeft.replace("{n}", String(left))
      );
      return;
    }
    setSlots((prev) => {
      if (prev.length >= requiredQty) return prev;
      return [...prev, flavorId];
    });
  }
  function removeOne(flavorId: number) {
    setSlots((prev) => {
      // Hapus instance terakhir dari flavor tsb (mulai dari belakang)
      // supaya kalau ada 2x Cookies & Cream, klik - kurangi 1 dulu.
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i] === flavorId) {
          const next = prev.slice();
          next.splice(i, 1);
          return next;
        }
      }
      return prev;
    });
  }
  function countOf(flavorId: number): number {
    return slots.reduce((s, id) => (id === flavorId ? s + 1 : s), 0);
  }

  /**
   * (migration-59) Pilih satu rasa untuk pilihan ke-`i`. Mengganti, bukan
   * menambah: satu pilihan hanya boleh berisi satu rasa.
   */
  function pickForChoice(i: number, flavorId: number) {
    const rasa = allFlavors.find((f) => f.id === flavorId);
    const catId = rasa?.category_id;
    const left = catId != null ? (remainingByCategory.get(catId) ?? null) : null;
    // Kalau slot ini sudah terisi, rasa lamanya sudah ikut dipotong dari
    // `left` di atas. Jadi yang dicek hanya kasus "slot kosong tapi stok habis".
    const sudahTerisi = picks[i] !== null && picks[i] !== undefined;
    if (!sudahTerisi && left !== null && left <= 0) {
      toast.warning(
        rasa ? (lang === "en" ? rasa.name_en : rasa.name_id) : "",
        t.order.menu.stockLeft.replace("{n}", String(left))
      );
      return;
    }
    setPicks((prev) => {
      const next = prev.slice();
      while (next.length < choices.length) next.push(null);
      next[i] = flavorId;
      return next;
    });
  }

  /** Nama tampilan satu pilihan; pakai `label_en` kalau bahasa Inggris. */
  function labelOfChoice(c: BundleChoiceSlot): string {
    const raw = lang === "en" ? c.label_en : c.label_id;
    return raw && raw.trim() !== "" ? raw : t.menu.bundleChoiceLabelDefault.replace("{n}", String(c.index));
  }

  function addBundleToCart() {
    if (!bundle) return;
    if (!allFilled) {
      toast.warning(
        name,
        isChoice
          ? t.menu.bundleChoiceNeed
          : t.menu.bundleEmpty.replace("{n}", String(requiredQty))
      );
      return;
    }
    // Mode ubah: tulis ulang entry yang sama supaya bundle tidak jadi dobel.
    if (editingEntry) {
      cart.updateBundle(editingEntry.id, slotsForOrder, note || undefined);
    } else {
      cart.addBundle(bundle, slotsForOrder, note || undefined);
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={name}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-cocoa-700">
            <Gift className="size-4 text-matcha-600" />
            <span className="tabular">
              {filledCount}/{requiredQty} {t.common.qty.toLowerCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={addBundleToCart}
            disabled={!allFilled}
            className="btn-matcha disabled:opacity-50"
          >
            <Check className="size-4" />
            {editingEntry ? t.menu.bundleSaveChange : t.common.confirm}
          </button>
        </div>
      }
    >
      {/* Hero */}
      <div className="-mt-2 mb-4 flex gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-honey-300 to-berry-500 sm:size-20">
          {bundle.image_url ? (
            <Image
              src={bundle.image_url}
              alt={name}
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Gift className="size-7 text-white/70" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wide text-berry-600 uppercase">
            {t.menu.bundleLabel}
          </p>
          <p className="font-display text-base font-bold text-cocoa-900">{name}</p>
          {desc ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] text-cocoa-500">{desc}</p>
          ) : null}
          <p className="mt-1.5 text-[12px] font-bold text-matcha-700">
            <Sparkles className="mr-1 inline size-3" />
            {isChoice
              ? t.menu.bundleChoiceTitle.replace("{n}", String(requiredQty))
              : isFixed
                ? t.menu.bundleFixedContents
                : t.menu.bundlePickFlavors
                    .replace("{n}", String(requiredQty))
                    .replace("{name}", "")}
          </p>
          <div className="mt-1.5">
            <PriceTag
              price={bundle.price}
              comparePrice={bundle.compare_price}
              lang={lang}
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* Catatan scope */}
      {isChoice ? (
        // (migration-59) Mode PILIHAN: tiap pilihan punya daftar sendiri, jadi
        // catatan "rasa di paket ini sudah ditentukan" tidak lagi tepat.
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-matcha-50 px-3 py-2 text-[12px] text-matcha-700">
          <Sparkles className="mt-px size-3.5 shrink-0" />
          <span>{t.menu.bundleChoiceHint}</span>
        </div>
      ) : isFixed ? (
        // (migration-54) Mode combo: isi paket sudah ditentukan penjual, jadi
        // tidak ada yang perlu dipilih di sini.
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-honey-50 px-3 py-2 text-[12px] font-semibold text-cocoa-700">
          <Check className="size-3.5 shrink-0 text-honey-600" />
          <span>{t.menu.bundleFixedNotice}</span>
        </div>
      ) : isCurated ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-cocoa-50 px-3 py-2 text-[12px] text-cocoa-600">
          <AlertTriangle className="size-3.5 shrink-0 text-cocoa-400" />
          <span>{t.menu.bundleCuratedPick}</span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-matcha-50 px-3 py-2 text-[12px] text-matcha-700">
          <Sparkles className="size-3.5 shrink-0" />
          <span>{t.menu.bundleAnyCategory}</span>
        </div>
      )}

      {/* (migration-54) Mode combo: daftar isi paket sebagai chip readonly.
          Slot sudah terisi otomatis, jadi pembeli tinggal konfirmasi. */}
      {isFixed ? (
        fixedContents.length === 0 ? (
          <p className="rounded-2xl bg-cocoa-50 p-8 text-center text-sm text-cocoa-500">
            {t.menu.bundleFixedUnavailable}
          </p>
        ) : (
          <ul className="space-y-2">
            {fixedContents.map((f, idx) => (
              <li
                key={`${f.id}-${idx}`}
                className="flex items-center gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 px-4 py-3"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[12px] font-bold text-cream-50 tabular">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-cocoa-900">
                    {lang === "en" ? f.name_en : f.name_id}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {/* (migration-59) Mode PILIHAN: satu blok per pilihan, masing-masing dengan
          daftar rasa sendiri. Mengklik kartu = memilih (mengganti) rasa
          pilihan itu, bukan menambah. */}
      {isChoice ? (
        <div className="space-y-4">
          {choices.map((c) => {
            const terisi = picks[c.index - 1] ?? null;
            const rasaTerisi = terisi == null ? null : allFlavors.find((f) => f.id === terisi);
            const daftar = allFlavors.filter((f) => c.flavor_ids.includes(f.id));
            return (
              <section
                key={c.index}
                data-bundle-choice={c.index}
                aria-label={labelOfChoice(c)}
                className={`rounded-2xl border-2 bg-white p-3 transition ${
                  rasaTerisi ? "border-matcha-500" : "border-cocoa-200"
                }`}
              >
                <header className="mb-2.5 flex items-center gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[11px] font-bold text-cream-50 tabular">
                    {c.index}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-cocoa-900">
                    {labelOfChoice(c)}
                  </span>
                  {rasaTerisi ? (
                    <span className="max-w-[9rem] truncate rounded-full bg-matcha-500/15 px-2.5 py-1 text-[11px] font-bold text-matcha-700">
                      {lang === "en" ? rasaTerisi.name_en : rasaTerisi.name_id}
                    </span>
                  ) : (
                    <span className="rounded-full bg-cocoa-100 px-2.5 py-1 text-[11px] font-semibold text-cocoa-500">
                      {t.menu.bundleChoicePending}
                    </span>
                  )}
                </header>

                {daftar.length === 0 ? (
                  <p className="rounded-xl bg-cocoa-50 p-4 text-center text-[12px] text-cocoa-500">
                    {t.menu.bundleChoiceEmpty}
                  </p>
                ) : (
                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {daftar.map((f) => {
                      const dipilih = terisi === f.id;
                      const catId = f.category_id;
                      const left =
                        catId != null ? (remainingByCategory.get(catId) ?? null) : null;
                      const habis = left !== null && left <= 0 && !dipilih;
                      return (
                        <li key={f.id}>
                          <button
                            type="button"
                            aria-pressed={dipilih}
                            disabled={habis}
                            onClick={() => pickForChoice(c.index - 1, f.id)}
                            className={`relative flex w-full flex-col overflow-hidden rounded-xl border-2 text-left transition ${
                              dipilih
                                ? "border-matcha-500 shadow-md"
                                : habis
                                  ? "cursor-not-allowed border-cocoa-100 opacity-50"
                                  : "border-cocoa-200 hover:border-cocoa-300"
                            }`}
                          >
                            <div
                              className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradientFor(f.slug)}`}
                            >
                              {f.image_url ? (
                                <Image
                                  src={f.image_url}
                                  alt={lang === "en" ? f.name_en : f.name_id}
                                  fill
                                  sizes="(max-width: 640px) 45vw, 20vw"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="grid h-full place-items-center">
                                  <span className="font-display text-2xl font-bold text-white/80">
                                    {(lang === "en" ? f.name_en : f.name_id).charAt(0)}
                                  </span>
                                </div>
                              )}
                              {dipilih ? (
                                <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-matcha-500 text-white shadow">
                                  <Check className="size-3.5" />
                                </span>
                              ) : null}
                            </div>
                            <span className="block px-2 py-2">
                              <span className="block truncate text-[12px] font-bold text-cocoa-900">
                                {lang === "en" ? f.name_en : f.name_id}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-cocoa-400 tabular">
                                {habis
                                  ? t.menu.soldOut
                                  : left !== null && left <= 5
                                    ? t.menu.lowStock.replace("{n}", String(left))
                                    : formatIDR(f.price, lang)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {/* Slot yang sudah dipilih (chip kecil). Di mode combo chip versi yang lebih
          informatif sudah tampil di atas, jadi ini dilewati. */}
      {!isFixed && !isChoice && slots.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {slots.map((flavorId, idx) => {
            const f = allowedFlavors.find((x) => x.id === flavorId);
            if (!f) return null;
            return (
              <span
                key={`${idx}-${flavorId}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-matcha-500/15 px-2.5 py-1 text-[12px] font-bold text-matcha-700"
              >
                <span className="tabular">#{idx + 1}</span>
                <span className="max-w-[10rem] truncate">
                  {lang === "en" ? f.name_en : f.name_id}
                </span>
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Grid flavor cards (gaya Sando Sandwich picker). Mode combo tidak punya
          picker sama sekali — pembelinya tidak memilih apa-apa. Mode pilihan
          juga punya gridenya sendiri di atas. */}
      {isFixed || isChoice ? null : allowedFlavors.length === 0 ? (
        <p className="rounded-2xl bg-cocoa-50 p-8 text-center text-sm text-cocoa-500">
          {t.menu.empty}
        </p>
      ) : (
        <div className="density-flavor-grid grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {allowedFlavors.map((f) => {
            const picked = countOf(f.id);
            // Sisa slot bundle (= requiredQty - yang sudah terisi) DAN sisa
            // stok kategori rasa ini. Pakai yang lebih kecil supaya tombol "+"
            // mati kalau memang tidak ada stok yang tersisa.
            const catId = f.category_id;
            const stockLeft =
              catId != null ? (remainingByCategory.get(catId) ?? null) : null;
            const slotBudget = requiredQty - filledCount;
            const remaining =
              stockLeft === null
                ? slotBudget
                : Math.min(slotBudget, stockLeft);
            return (
              <article
                key={f.id}
                className={`relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-white text-left transition ${
                  picked > 0
                    ? "border-matcha-500 shadow-md"
                    : "border-cocoa-200 hover:border-cocoa-300"
                }`}
              >
                <div
                  className={`relative aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradientFor(f.slug)}`}
                >
                  {f.image_url ? (
                    <Image
                      src={f.image_url}
                      alt={lang === "en" ? f.name_en : f.name_id}
                      fill
                      sizes="(max-width: 640px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center">
                      <span className="font-display text-3xl font-bold text-white/80">
                        {(lang === "en" ? f.name_en : f.name_id).charAt(0)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3.5">
                  <p className="truncate font-display text-base leading-tight font-bold text-cocoa-900">
                    {lang === "en" ? f.name_en : f.name_id}
                  </p>
                  {!isCurated ? (
                    <p className="mt-0.5 truncate text-[11px] text-cocoa-400">
                      {f.categoryName}
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-[11px] text-cocoa-400 tabular">
                      {formatIDR(f.price, lang)}
                    </p>
                  )}
                  {/* Sisa stok kategori SEBENARNYA — sebelumnya di-hardcode "Selalu tersedia"
                      padahal create_order sudah mengurangi categories.stock satu
                      pcs per slot bundle. */}
                  {(() => {
                    const catId = f.category_id;
                    const left =
                      catId != null
                        ? (remainingByCategory.get(catId) ?? null)
                        : null;
                    if (left === 0) {
                      return (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-berry-500">
                          <PackageX className="size-3" />
                          {t.menu.soldOut}
                        </p>
                      );
                    }
                    if (left !== null) {
                      return (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-matcha-700">
                          <Sparkles className="size-3" />
                          {left <= 5
                            ? t.menu.lowStock.replace("{n}", String(left))
                            : t.menu.inStock.replace("{n}", String(left))}
                        </p>
                      );
                    }
                    return (
                      <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-cocoa-400">
                        <Sparkles className="size-3" />
                        {t.menu.unlimited}
                      </p>
                    );
                  })()}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-cocoa-500">
                    <span className="tabular">
                      <span className="font-bold text-cocoa-800">
                        {soldCountsProp[f.id] ?? 0}
                      </span>{" "}
                      {t.common.sold.toLowerCase()}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="size-3 text-rose-500" />
                      <span className="tabular">0</span>
                    </span>
                  </div>
                  {/* +/- stepper (gaya FlavorCard) */}
                  <div
                    className="mt-3 inline-flex w-full items-stretch overflow-hidden rounded-xl border-2 border-matcha-500 shadow-sm"
                    role="group"
                    aria-label={name}
                  >
                    <button
                      type="button"
                      onClick={() => removeOne(f.id)}
                      disabled={picked <= 0}
                      aria-label={`-1 ${name}`}
                      className="grid w-12 shrink-0 place-items-center text-matcha-600 transition hover:bg-matcha-50 active:scale-95 disabled:text-cocoa-300 disabled:hover:bg-transparent"
                    >
                      <Minus className="size-4" />
                    </button>
                    <div className="flex flex-1 items-center justify-center font-display text-base font-extrabold text-cocoa-900 tabular">
                      {picked}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (remaining <= 0) {
                          // Semua slot sudah terisi. Ini batas JUMLAH SLOT
                          // paket, sama sekali bukan batas per rasa.
                          toast.warning(name, t.menu.bundleSlotsFull);
                          return;
                        }
                        addOne(f.id);
                      }}
                      disabled={remaining <= 0}
                      aria-label={`+1 ${name}`}
                      className="grid w-12 shrink-0 place-items-center bg-matcha-500 text-white transition hover:bg-matcha-600 active:scale-95 disabled:bg-cocoa-300"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Catatan bundle (1 note per bundle, berlaku untuk semua slot) */}
      <div className="mt-5">
        <label htmlFor="bundle-note" className="label">
          <MessageSquare className="mr-1 inline size-3.5" />
          {t.menu.bundleNoteLabel}
        </label>
        <input
          id="bundle-note"
          type="text"
          maxLength={120}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t.menu.notePlaceholder}
          className="input"
        />
        <p className="mt-1.5 text-xs text-cocoa-400">{t.menu.bundleNoteHint}</p>
      </div>
    </Modal>
  );
}