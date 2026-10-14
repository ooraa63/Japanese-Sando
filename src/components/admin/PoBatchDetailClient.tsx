"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Check,
  ClipboardList,
  Eye,
  EyeOff,
  LayoutGrid,
  Loader2,
  Package,
  Save,
  Search,
  TrendingUp,
  Users,
} from "lucide-react";
import type { AdminCustomerRow, PoBatchDetail, PoBatchFlavorRow } from "@/app/admin/actions";
import {
  getMutasiAction,
  savePoBatchBundlesAction,
  savePoBatchFlavorsAction,
  savePoBatchStockAction,
  updateOrderStatusAction,
} from "@/app/admin/actions";
import type { Category, Order, OrderStatus, SalesSummary, SalesTransaction } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { formatIDR, formatPickupDate } from "@/lib/utils";
import {
  OrderCards,
  OrderDetailModal,
  OrderStatusChips,
  orderCounts,
} from "@/components/admin/shared/OrderCards";
import { CustomerTable } from "@/components/admin/shared/CustomerTable";
import {
  SalesSummaryCards,
  SalesTransactionsSection,
} from "@/components/admin/shared/SalesTransactions";

/**
 * Detail satu batch pre-order (Steven 14-10-2026).
 *
 * Navigasi di dalam halaman ini berupa baris tab penuh: Stok / Pesanan /
 * Pelanggan / Mutasi. Setiap tab sekarang memakai komponen tampilan yang
 * SAMA PERSIS dengan halamannya di sidebar utama, jadi Steven tidak lagi
 * dapat dua tampilan berbeda untuk data yang sama:
 *
 *   - Pesanan  -> `shared/OrderCards`   (dipakai /admin/orders)
 *   - Pelanggan-> `shared/CustomerTable` (dipakai /admin/customers)
 *   - Mutasi   -> `shared/SalesTransactions` (dipakai /admin/sales)
 *
 * Data dimuat sekali di server (lihat page.tsx) lalu dipindah lewat state.
 * Pindah tab tidak melakukan request baru, jadi terasa instan.
 *
 * Catatan honestly:
 * - `stok_awal` tidak disimpan di database, jadi diturunkan dari sisa +
 *   terjual. Sisa hanya pernah turun karena penjualan dan naik lagi saat
 *   pesanan dibatalkan, jadi angkanya selalu sama dengan yang Steven setting.
 * - Bundle tidak punya stok sendiri. Tiap slot paket tetap memakan 1 pcs dari
 *   stok kategori rasa-nya. Yang diatur per batch hanya bundle mana yang boleh
 *   dibeli dan harganya berapa.
 * - "Ringkasan batch" (5 angka di bawah tiap tab) DIHAPUS 14-10-2026 —
 *   Steven: "ringkasan batch dihapus di semua tempat aja". Angkanya sudah
 *   ada di tab Mutasi (pendapatan / pcs / pesanan) dan di tab Stok (terjual).
 */

type TabKey = "stok" | "pesanan" | "pelanggan" | "mutasi";

export interface PoDetailLabels {
  back: string;
  tabs: { stok: string; pesanan: string; pelanggan: string; mutasi: string };
  stok: {
    title: string;
    subtitle: string;
    colInitial: string;
    colSold: string;
    colInput: string;
    empty: string;
    initialHint: string;
    save: string;
    saving: string;
    saved: string;
    bundlesTitle: string;
    bundlesSubtitle: string;
    bundlesEmpty: string;
    bundlesAllHint: string;
    /** Steven 14-10-2026: harga tidak bisa diset di batch, selalu ikut utama. */
    bundlesPriceHint: string;
    /** Judul blok centang rasa per kategori. */
    rasaTitle: string;
    /** "{n} dipilih" ketika Steven sudah menyaring. */
    rasaCount: string;
    /** Kalau semua rasa tercentang = semua tampil. */
    rasaAllHint: string;
    rasaSelectAll: string;
    rasaClearAll: string;
    /** Label pill di tombol simpan yang mengambang. */
    unsavedHint: string;
    soldHere: string;
    soldOutHere: string;
    outsideBatch: string;
    hiddenFromBuyer: string;
    soldHereHint: string;
    soldOutHereHint: string;
    outsideBatchHint: string;
    hiddenFromBuyerHint: string;
  };
  pesanan: { title: string; subtitle: string; empty: string; failed: string };
  pelanggan: { title: string; subtitle: string; empty: string; failed: string };
  mutasi: { title: string; subtitle: string; empty: string; failed: string };
}

export function PoBatchDetailClient({
  initial,
  kategori,
  menu,
  orders,
  ordersFailed,
  mutasi,
  mutasiFailed,
  customers,
  customersFailed,
  labels,
}: {
  initial: PoBatchDetail;
  kategori: Array<{ id: number; name: string }>;
  menu: Category[];
  orders: Order[];
  ordersFailed: boolean;
  mutasi: {
    summary: SalesSummary;
    transactions: SalesTransaction[];
    total: number;
  } | null;
  mutasiFailed: boolean;
  customers: AdminCustomerRow[];
  customersFailed: boolean;
  labels: PoDetailLabels;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("stok");

  const { batch } = initial;
  const statusKey = {
    buka: "statusBuka",
    akan_dibuka: "statusAkan",
    selesai: "statusSelesai",
    nonaktif: "statusNonaktif",
  } as const;
  const statusBadge =
    batch.status === "buka"
      ? "bg-matcha-100 text-matcha-700"
      : batch.status === "akan_dibuka"
        ? "bg-honey-300/25 text-honey-500"
        : batch.status === "selesai"
          ? "bg-cocoa-100 text-cocoa-500"
          : "bg-berry-500/10 text-berry-600";

  const TABS = [
    { key: "stok" as const, label: labels.tabs.stok, icon: Boxes },
    { key: "pesanan" as const, label: labels.tabs.pesanan, icon: Package },
    { key: "pelanggan" as const, label: labels.tabs.pelanggan, icon: Users },
    { key: "mutasi" as const, label: labels.tabs.mutasi, icon: TrendingUp },
  ];

  return (
    <div className="space-y-3 pb-24">
      {/* Baris paling atas dibuat SEKECIL mungkin (14-10-2026, Steven: "tulisan
          atas diperkecil aja biar yang sub-menu bar ini semua bisa besar").

          Dari kartu header -> satu baris tanpa padding, font 12-13px, tinggi
          ~24px. Batch + tanggal ambil tetap kelihatan karena itu satu-satunya
          penanda batch mana yang sedang dibuka. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-tight">
        <Link
          href="/admin/po"
          className="inline-flex items-center gap-1 font-bold text-cocoa-500 transition hover:text-cocoa-900"
        >
          <ArrowLeft className="size-3.5" />
          {labels.back}
        </Link>
        <span className="text-cocoa-300">·</span>
        <h1 className="font-display text-[13px] font-extrabold text-cocoa-900">
          {batch.label}
        </h1>
        <span
          className={`rounded-full px-1.5 py-px text-[10px] font-bold ${statusBadge}`}
        >
          {t.admin.po[statusKey[batch.status]]}
        </span>
        <span className="text-cocoa-400">
          · {formatPickupDate(batch.pickup_date, lang)}
        </span>
      </div>

      {/* Sub-menu: BARIS PENUH melintang (bukan kolom 210px di kiri), tombolnya
          dibuat lebih tinggi supaya jadi fokus utama halaman ini. */}
      <nav
        aria-label={labels.tabs.stok}
        className="flex gap-1.5 overflow-x-auto rounded-2xl border border-cocoa-200 bg-cream-50 p-1.5"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-3 text-[15px] font-bold whitespace-nowrap transition ${
                active ? "bg-cocoa-900 text-cream-50" : "text-cocoa-600 hover:bg-white"
              }`}
            >
              <Icon className="size-[18px]" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-5">
        {tab === "stok" ? (
          <StockTab
            initial={initial}
            kategori={kategori}
            menu={menu}
            labels={labels}
            onSaved={() => router.refresh()}
          />
        ) : null}

        {tab === "pesanan" ? (
          <OrdersTab
            initialOrders={orders}
            failed={ordersFailed}
            labels={labels}
            onChanged={() => router.refresh()}
          />
        ) : null}

        {tab === "pelanggan" ? (
          <CustomersTab customers={customers} failed={customersFailed} labels={labels} />
        ) : null}

        {tab === "mutasi" ? (
          <MutasiTab
            batchId={batch.id}
            initialMutasi={mutasi}
            failed={mutasiFailed}
            labels={labels}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ==========================================================================
 * STOK — bisa diedit + pilih bundle + pratinjau menu pembeli
 * ========================================================================== */

function StockTab({
  initial,
  kategori,
  menu,
  labels,
  onSaved,
}: {
  initial: PoBatchDetail;
  kategori: Array<{ id: number; name: string }>;
  menu: Category[];
  labels: PoDetailLabels;
  onSaved: () => void;
}) {
  const { lang, t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [dirtyStock, setDirtyStock] = useState(false);
  const [dirtyBundles, setDirtyBundles] = useState(false);

  // Draft stok: mulai dari baris yang sudah ada, lalu tambahkan kategori
  // aktif yang belum punya baris. Kategori yang belum punya baris ditampilkan
  // dengan sisa 0 supaya Steven bisa mengisinya tanpa pindah halaman.
  const [stock, setStock] = useState<Record<number, number>>(() => {
    const draft: Record<number, number> = {};
    for (const row of initial.stok) draft[row.category_id] = row.sisa;
    for (const k of kategori) if (!(k.id in draft)) draft[k.id] = 0;
    return draft;
  });

  // Steven 14-10-2026: "untuk harga tetap ikutin yang utama jadi kita gabisa
  // set harga disini". Jadi draft ini hanya menyimpan DAFTAR paket yang dicentang
  // — tidak ada harga sama sekali di halaman batch.
  //
  // Sekalian menutup bug lama: `dipakai && harga_batch == null` dulu ditulis
  // sebagai `null` (= "tidak dicentang"), jadi paket yang dipakai di batch tapi
  // tanpa harga khusus tampil tidak tercentang padahal database bilang dipakai.
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(initial.bundles.filter((b) => b.dipakai).map((b) => b.bundle_id))
  );

  // Rasa yang ditampilkan di batch ini (migration-53).
  // `initial.semua_rasa_aktif` = Steven belum pernah memilih -> semua tampil.
  //
  // BUG yang diperbaiki 14-10-2026: kalau `rasaOn` cuma diisi dari baris
  // `dipakai`, sementara kotak centangnya membaca `semuaRasaAktif ? true : ...`,
  // maka semua kotak TERLIHAT tercentang dan diklik pun tidak ada efeknya
  // sampai Steven menyimpan. Sekarang draft lokal diisi PENUH saat
  // `semua_rasa_aktif` true, jadi centang/uncheck langsung terasa.
  const [rasaOn, setRasaOn] = useState<Set<number>>(
    () =>
      new Set(
        (initial.semua_rasa_aktif
          ? initial.flavors
          : initial.flavors.filter((f) => f.dipakai)
        ).map((f) => f.flavor_id)
      )
  );
  const [dirtyRasa, setDirtyRasa] = useState(false);

  // Pilih semua / kosongkan per kategori (dipakai tombol kecil di tiap kartu).
  function setSemuaRasaKategori(categoryId: number, on: boolean) {
    setDirtyRasa(true);
    setRasaOn((prev) => {
      const next = new Set(prev);
      for (const r of rasaByKategori.get(categoryId) ?? []) {
        if (on) next.add(r.flavor_id);
        else next.delete(r.flavor_id);
      }
      return next;
    });
  }

  function toggleRasa(id: number) {
    setDirtyRasa(true);
    setRasaOn((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const semuaBundleAktif = initial.semua_bundle_aktif;
  const terjualBy = useMemo(
    () => new Map(initial.stok.map((r) => [r.category_id, r.terjual])),
    [initial.stok]
  );
  // Kategori yang punya baris di `po_batch_stock` untuk batch ini. Ini yang
  // membedakan "diatur di batch" (pakai sisa batch) dari "pakai stok global".
  const inBatchIds = useMemo(
    () => new Set(initial.stok.map((r) => r.category_id)),
    [initial.stok]
  );

  // Rasa aktif per kategori, buat checkbox di tiap kartu. Sengaja TIDAK
  // di-memo: React Compiler menolak memo yang isinya ikut dibaca di dalam
  // callback `setRasaOn` (lihat `setSemuaRasaKategori` di bawah), dan daftar
  // rasa ini kecil saja sehingga dihitung ulang tiap render tidak mahal.
  const rasaByKategori = new Map<number, PoBatchFlavorRow[]>();
  for (const f of initial.flavors) {
    const key = f.category_id ?? -1;
    const list = rasaByKategori.get(key);
    if (list) list.push(f);
    else rasaByKategori.set(key, [f]);
  }

  function toggleBundle(id: number) {
    setDirtyBundles(true);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function simpan() {
    startTransition(async () => {
      if (dirtyStock) {
        const payload: Record<string, number> = {};
        for (const [id, value] of Object.entries(stock)) payload[id] = value;
        const res = await savePoBatchStockAction(initial.batch.id, payload);
        if (!res.ok) {
          toast.error(res.error ?? t.errors.generic);
          return;
        }
        setDirtyStock(false);
      }
      if (dirtyBundles) {
        const res = await savePoBatchBundlesAction(initial.batch.id, [...picked]);
        if (!res.ok) {
          toast.error(res.error ?? t.errors.generic);
          return;
        }
        setDirtyBundles(false);
      }
      if (dirtyRasa) {
        const res = await savePoBatchFlavorsAction(initial.batch.id, [...rasaOn]);
        if (!res.ok) {
          toast.error(res.error ?? t.errors.generic);
          return;
        }
        setDirtyRasa(false);
      }
      toast.success(labels.stok.saved);
      onSaved();
    });
  }

  const adaPerubahan = dirtyStock || dirtyBundles || dirtyRasa;

  return (
    /* Steven 14-10-2026 (pertama: "bundle jangan di samping sana", kedua:
       "jangan atas bawah, itu sampingnya kan masih kosong").

       Dua koreksi itu sebenarnya satu hal yang sama: jangan sampai ada ruang
       kosong. Versi kolom kanan terlalu sempit karena kartu menunya hanya
       menempati 1/3 lebar kolom (grid 3 kolom, padahal kategorinya cuma
       satu). Versi atas-bawah menyisakan setengah halaman kosong di kanan.

       Solusinya: Bundle di samping, tapi kartu menu memakai FLEX-GROW
       (bukan grid kolom tetap) sehingga 1 kategori melebar penuh, 2 membagi
       dua, 3 membagi tiga — selalu memenuhi lebar yang tersedia. */
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <section className="card p-5">
        <h2 className="text-lg font-extrabold text-cocoa-900">{labels.stok.title}</h2>
        <p className="mt-1 text-[13px] text-cocoa-500">{labels.stok.subtitle}</p>

        {/* ---------- Menu & Stok ----------
          Steven 14-10-2026 (EROR 2): "yg stok ... belum ada perubahan, lihat
          masih tidak ada seperti konssep yang menu & stock sebelumnya yang di
          Menu bar utama".

          Sekarang kartu-kartunya memakai `flex-1 basis-[19rem]` supaya ikut
          melebar: kalau kategorinya cuma satu, kartunya memenuhi seluruh
          lebar kolom dan tidak ada rongga di sebelahnya. */}
        <ul className="mt-4 flex flex-wrap gap-4">
          {menu.length === 0 ? (
            <li className="w-full px-1 py-6 text-sm text-cocoa-400">{labels.stok.empty}</li>
          ) : (
            menu.map((category) => (
              <MenuStockCard
                key={category.id}
                category={category}
                terjual={terjualBy.get(category.id) ?? 0}
                sisa={stock[category.id] ?? 0}
                inBatchIds={inBatchIds}
                labels={labels}
                // Rasa yang boleh ditampilkan di batch ini (migration-53).
                rasaRows={rasaByKategori.get(category.id) ?? []}
                rasaOn={rasaOn}
                onToggleRasa={toggleRasa}
                onSetSemuaRasa={(on) => setSemuaRasaKategori(category.id, on)}
                onSisa={(v) => {
                  setDirtyStock(true);
                  setStock((prev) => ({ ...prev, [category.id]: v }));
                }}
              />
            ))
          )}
        </ul>

        <p className="mt-2.5 text-[12px] text-cocoa-500">{labels.stok.initialHint}</p>
      </section>

      {/* ---------- Bundle (di samping kanan, ikut nempel) ---------- */}
      <aside className="card p-5 lg:sticky lg:top-24">
        <h3 className="text-base font-extrabold text-cocoa-900">{labels.stok.bundlesTitle}</h3>
        <p className="mt-1 text-[12px] text-cocoa-500">{labels.stok.bundlesSubtitle}</p>

        {initial.bundles.length === 0 ? (
          <p className="mt-4 text-sm text-cocoa-400">{labels.stok.bundlesEmpty}</p>
        ) : (
          <>
            {!semuaBundleAktif ? null : (
              <p className="mt-3 rounded-xl bg-honey-300/20 px-3.5 py-2.5 text-[12px] font-semibold text-honey-500">
                {labels.stok.bundlesAllHint}
              </p>
            )}
            <ul className="mt-4 space-y-2.5">
              {initial.bundles.map((b) => {
                const on = picked.has(b.bundle_id);
                return (
                  <li
                    key={b.bundle_id}
                    className={`rounded-2xl border-2 p-3 transition ${
                      on ? "border-cocoa-900 bg-cream-50" : "border-cocoa-200 bg-white"
                    }`}
                  >
                    <button
                        type="button"
                        onClick={() => toggleBundle(b.bundle_id)}
                        aria-pressed={on}
                        className="flex w-full items-center gap-2.5 text-left"
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-md border transition ${
                            on
                              ? "border-cocoa-900 bg-cocoa-900 text-cream-50"
                              : "border-cocoa-300"
                          }`}
                          aria-hidden
                        >
                          {on ? <Check className="size-4" /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-cocoa-900">
                            {b.nama}
                          </span>
                          <span className="block text-[12px] text-cocoa-500">
                            {b.required_qty} pcs · {formatIDR(b.harga_bawaan, lang)}
                          </span>
                        </span>
                      </button>

                      {/* Steven 14-10-2026: "untuk harga tetap ikutin yang
                          utama jadi kita gabisa set harga disini". Input harga
                          per batch DIHAPUS; harga selalu dari tabel `bundles`
                          dan diubah lewat menu utama saja. */}
                      {on ? (
                        <p className="mt-1.5 pl-8 text-[11px] text-cocoa-400">
                          {labels.stok.bundlesPriceHint}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
      </aside>

      {/* Steven 14-10-2026: "yang simpan stok & bundle jangan di ujung kanan
          bawah bgt susah lihat". Tombolnya jadi pill mengambang di TENGAH
          bawah layar dan nempel (sticky), jadi selalu kelihatan tanpa harus
          menggulir sampai paling bawah. */}
      {adaPerubahan ? (
        <div className="sticky bottom-3 z-10 mt-4 flex justify-center lg:col-span-2">
          <div className="flex items-center gap-3 rounded-full border border-cocoa-200 bg-white/95 py-2 pr-2 pl-4 shadow-lg backdrop-blur">
            <span className="text-[12px] font-bold text-cocoa-600">
              {labels.stok.unsavedHint}
            </span>
            <button
              type="button"
              onClick={simpan}
              disabled={pending}
              className="btn-primary !px-4 !py-2 !text-[13px]"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {pending ? labels.stok.saving : labels.stok.save}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ==========================================================================
 * PRATINJAU MENU — mana rasa yang dijual / disembunyikan di batch ini
 * ========================================================================== */

type MenuState = "sold" | "soldout" | "outside" | "hidden";

/**
 * Kartu Menu & Stok per kategori — satu kartu menggabungkan tiga hal sekaligus:
 *
 * 1. **Identitas menu** (gambar, nama, jumlah rasa) — sama seperti kartu
 *    kategori di `/admin/menu`, supaya Steven mengenali tempatnya.
 * 2. **Status visibility untuk batch ini.** Steven 14-10-2026: "kita gatau mana
 *    yang mau dihide/mana yang dijual pada batch itu". Aturannya DIBALIK dari
 *    `stockByCategory` di OrderFlow:
 *      - Kategori punya baris di batch -> stok pakai SISA batch (0 = habis)
 *      - Kategori tidak punya baris    -> pakai `stock_enabled` + `stock` global
 * 3. **Input stok batch** — jadi Steven set stok di tempat yang sama dengan
 *    kartu menunya, bukan di tabel terpisah.
 */
function MenuStockCard({
  category,
  terjual,
  sisa,
  inBatchIds,
  labels,
  rasaRows,
  rasaOn,
  onToggleRasa,
  onSetSemuaRasa,
  onSisa,
}: {
  category: Category;
  terjual: number;
  sisa: number;
  inBatchIds: Set<number>;
  labels: PoDetailLabels;
  rasaRows: PoBatchFlavorRow[];
  rasaOn: Set<number>;
  onToggleRasa: (flavorId: number) => void;
  onSetSemuaRasa: (on: boolean) => void;
  onSisa: (value: number) => void;
}) {
  const { lang, t } = useI18n();
  const flavors = (category.flavors ?? []).filter((f) => f.is_active);
  const name = lang === "en" ? category.name_en : category.name_id;

  // Berapa rasa yang tercentang di draft lokal kategori ini.
  const jumlahRasaOn = rasaRows.reduce(
    (n, r) => (rasaOn.has(r.flavor_id) ? n + 1 : n),
    0
  );
  const semuaTercentang = rasaRows.length > 0 && jumlahRasaOn === rasaRows.length;

  // Kategori "diatur di batch ini" kalau punya baris di `po_batch_stock`.
  const inBatch = inBatchIds.has(category.id);

  let state: MenuState;
  if (inBatch) {
    state = sisa > 0 ? "sold" : "soldout";
  } else if (category.stock_enabled && category.stock <= 0) {
    state = "hidden";
  } else {
    state = "outside";
  }

  const meta = {
    sold: {
      label: labels.stok.soldHere,
      hint: labels.stok.soldHereHint,
      tone: "bg-matcha-100 text-matcha-700",
      icon: Eye,
    },
    soldout: {
      label: labels.stok.soldOutHere,
      hint: labels.stok.soldOutHereHint,
      tone: "bg-honey-300/25 text-honey-500",
      icon: Eye,
    },
    outside: {
      label: labels.stok.outsideBatch,
      hint: labels.stok.outsideBatchHint,
      tone: "bg-cocoa-100 text-cocoa-700",
      icon: Eye,
    },
    hidden: {
      label: labels.stok.hiddenFromBuyer,
      hint: labels.stok.hiddenFromBuyerHint,
      tone: "bg-berry-500/10 text-berry-600",
      icon: EyeOff,
    },
  }[state];
  const Icon = meta.icon;

  const low = sisa > 0 && sisa <= 5;
  const stockTone =
    state === "hidden"
      ? "bg-berry-500/10 text-berry-600"
      : sisa <= 0
        ? "bg-berry-500/10 text-berry-600"
        : low
          ? "bg-honey-300/20 text-honey-500"
          : "bg-matcha-50 text-matcha-700";

  return (
    <li className="card flex flex-1 basis-[19rem] flex-col overflow-hidden">
      {/* Kepala: gambar + nama + jumlah rasa + badge status */}
      <div className="flex items-start gap-3.5 p-4">
        <span
          className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl ${
            category.image_url ? "bg-cocoa-100" : "bg-gradient-to-br from-cocoa-300 to-cocoa-500"
          }`}
        >
          {category.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={category.image_url}
              alt=""
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <LayoutGrid className="size-7 text-white/70" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-cocoa-900">{name}</p>
          <p className="mt-0.5 block text-xs text-cocoa-400">
            {flavors.length} {t.menu.flavors}
          </p>
          <span
            className={`mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${meta.tone}`}
          >
            <Icon className="size-3" />
            {meta.label}
          </span>
        </div>
      </div>

      {/* ---------- Rasa: centang yang mau dimunculin di batch ini ----------
          Steven 14-10-2026: "pastikan kita bisa set rasa itu rasa apa aja yang
          mau dimunculin pada batch po itu".

          Layer baru (migration-53) memakai semantik yang sama dengan bundle:
          belum ada yang dicentang = semua rasa tampil (mode lama). Begitu ada
          satu rasa dicentang, HANYA rasa itu yang dilihat pembeli. */}
      {rasaRows.length === 0 ? (
        <p className="px-4 pb-3 text-[13px] text-cocoa-400">—</p>
      ) : (
        <div className="px-4 pb-3.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
              {labels.stok.rasaTitle}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-cocoa-400">
                {semuaTercentang
                  ? labels.stok.rasaAllHint
                  : labels.stok.rasaCount.replace("{n}", String(jumlahRasaOn))}
              </span>
              <button
                type="button"
                onClick={() => onSetSemuaRasa(true)}
                className="text-[11px] font-bold text-cocoa-500 underline-offset-2 hover:underline"
              >
                {labels.stok.rasaSelectAll}
              </button>
              <button
                type="button"
                onClick={() => onSetSemuaRasa(false)}
                className="text-[11px] font-bold text-cocoa-500 underline-offset-2 hover:underline"
              >
                {labels.stok.rasaClearAll}
              </button>
            </div>
          </div>

          <ul className="flex flex-wrap gap-1.5">
            {rasaRows.map((r) => {
              // Baca draft lokal, BUKAN `semuaRasaAktif` — kalau baca yang
              // itu, uncheck tidak akan kelihatan sampai disimpan.
              const on = rasaOn.has(r.flavor_id);
              return (
                <li key={r.flavor_id}>
                  <label
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] transition ${
                      on
                        ? "border-matcha-600 bg-matcha-50 text-matcha-700"
                        : "border-cocoa-200 bg-cream-50 text-cocoa-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggleRasa(r.flavor_id)}
                      className="size-3.5 accent-matcha-600"
                    />
                    <span className={on ? "" : "line-through"}>{r.nama}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Kaki: input stok batch + angka stok awal / terjual */}
      <div className="mt-auto border-t border-cocoa-100 bg-cocoa-50/60 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
            {labels.stok.colInput}
          </span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${stockTone}`}>
            {sisa} {t.admin.dash.pcsLeft}
          </span>
        </div>

        <input
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={`${name} — ${labels.stok.colInput}`}
          value={sisa}
          onChange={(e) => onSisa(Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0))}
          className="input tabular mt-1.5 w-full text-right"
        />

        <p className="mt-1.5 text-[11px] text-cocoa-500">
          {meta.hint.replace("{n}", String(sisa))}
        </p>
        <p className="text-[11px] text-cocoa-400 tabular">
          {labels.stok.colInitial}: {sisa + terjual} · {labels.stok.colSold}: {terjual}
        </p>
      </div>
    </li>
  );
}

/* ==========================================================================
 * PESANAN — komponen yang sama dengan /admin/orders
 * ========================================================================== */

function OrdersTab({
  initialOrders,
  failed,
  labels,
  onChanged,
}: {
  initialOrders: Order[];
  failed: boolean;
  labels: PoDetailLabels;
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [orders, setOrders] = useState(initialOrders);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const counts = useMemo(() => orderCounts(orders), [orders]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const byStatus =
      filter === "all" ? orders : orders.filter((o) => o.status === filter);
    if (!needle) return byStatus;
    return byStatus.filter((o) =>
      [o.order_code, o.customer_name, o.phone]
        .filter((x): x is string => !!x)
        .some((x) => x.toLowerCase().includes(needle))
    );
  }, [orders, filter, search]);

  async function changeStatus(order: Order, next: OrderStatus) {
    setBusyId(order.id);
    const res = await updateOrderStatusAction(order.id, next);
    setBusyId(null);
    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    setSelected((prev) => (prev && prev.id === order.id ? { ...prev, status: next } : prev));
    toast.success(t.admin.orders.actionDone);
    onChanged();
  }

  if (failed) {
    return <TabNotice title={labels.pesanan.title} text={labels.pesanan.failed} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-cocoa-900">{labels.pesanan.title}</h2>
        <p className="mt-1 text-[13px] text-cocoa-500">{labels.pesanan.subtitle}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <OrderStatusChips counts={counts} value={filter} onChange={setFilter} />

        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
          <input
            className="input !py-2.5 pl-10"
            placeholder={t.admin.orders.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-14 text-center">
          <ClipboardList className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">
            {orders.length === 0 ? labels.pesanan.empty : t.admin.orders.empty}
          </p>
        </div>
      ) : (
        <OrderCards
          orders={filtered}
          busyId={busyId}
          onChangeStatus={changeStatus}
          onOpen={setSelected}
        />
      )}

      <OrderDetailModal
        order={selected}
        busyId={busyId}
        onChangeStatus={changeStatus}
        onClose={() => setSelected(null)}
        onSaved={(orderId, patch) => {
          setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
          setSelected((prev) => (prev && prev.id === orderId ? { ...prev, ...patch } : prev));
        }}
      />
    </div>
  );
}

/* ==========================================================================
 * PELANGGAN — komponen yang sama dengan /admin/customers
 * ========================================================================== */

function CustomersTab({
  customers,
  failed,
  labels,
}: {
  customers: AdminCustomerRow[];
  failed: boolean;
  labels: PoDetailLabels;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((c) =>
      [c.customer_name, c.phone, c.customer_email ?? "", c.instagram ?? ""].some((x) =>
        x.toLowerCase().includes(needle)
      )
    );
  }, [customers, search]);

  if (failed) {
    return <TabNotice title={labels.pelanggan.title} text={labels.pelanggan.failed} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-cocoa-900">{labels.pelanggan.title}</h2>
        <p className="mt-1 text-[13px] text-cocoa-500">{labels.pelanggan.subtitle}</p>
      </div>

      {customers.length === 0 ? (
        <div className="card p-14 text-center">
          <Users className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">{labels.pelanggan.empty}</p>
        </div>
      ) : (
        <>
          <div className="relative sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              className="input !py-2.5 pl-10"
              placeholder={t.admin.customers.search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
            />
          </div>

          <div className="flex items-center gap-2 text-sm text-cocoa-500">
            <Users className="size-4" />
            <span className="font-bold text-cocoa-700 tabular">{filtered.length}</span>
            {filtered.length !== customers.length ? (
              <span> / {customers.length}</span>
            ) : null}
          </div>

          <CustomerTable customers={filtered} />
        </>
      )}
    </div>
  );
}

/* ==========================================================================
 * MUTASI — komponen yang sama dengan /admin/sales, termasuk filternya
 * ========================================================================== */

function MutasiTab({
  batchId,
  initialMutasi,
  failed,
  labels,
}: {
  batchId: number;
  initialMutasi: {
    summary: SalesSummary;
    transactions: SalesTransaction[];
    total: number;
  } | null;
  failed: boolean;
  labels: PoDetailLabels;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [filters, setFilters] = useState({ fromDate: "", toDate: "", search: "" });
  const [data, setData] = useState(initialMutasi);
  const [pending, startTransition] = useTransition();

  // Muat ulang tiap filter berubah, tetap terikat ke batch ini.
  const filterKey = `${filters.fromDate}|${filters.toDate}|${filters.search}`;
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const res = await getMutasiAction({
        fromDate: filters.fromDate || null,
        toDate: filters.toDate || null,
        search: filters.search,
        limit: 100,
        offset: 0,
        poBatchId: batchId,
      });
      if (cancelled) return;
      if (res.ok && res.data) {
        setData({
          summary: res.data.summary,
          transactions: res.data.transactions,
          total: res.data.total,
        });
      } else {
        toast.error(t.errors.generic);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, batchId]);

  if (failed || !data) {
    return <TabNotice title={labels.mutasi.title} text={labels.mutasi.failed} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-extrabold text-cocoa-900">{labels.mutasi.title}</h2>
        <p className="mt-1 text-[13px] text-cocoa-500">{labels.mutasi.subtitle}</p>
      </div>

      <SalesSummaryCards summary={data.summary} />

      <SalesTransactionsSection
        transactions={data.transactions}
        total={data.total}
        filters={filters}
        onChangeFilters={setFilters}
        onReset={() => setFilters({ fromDate: "", toDate: "", search: "" })}
        loading={pending}
      />
    </div>
  );
}

/* ========================================================================== */

function TabNotice({ title, text }: { title: string; text: string }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold text-cocoa-900">{title}</h2>
      <p className="mt-3 text-sm text-cocoa-500">{text}</p>
    </section>
  );
}