"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Check,
  ChartNoAxesColumn,
  Filter,
  Loader2,
  Package,
  Pencil,
  Save,
  Search,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import type {
  AdminCustomerRow,
  PoBatchDetail,
} from "@/app/admin/actions";
import { savePoBatchBundlesAction, savePoBatchStockAction } from "@/app/admin/actions";
import type { Order, OrderStatus, SalesSummary, SalesTransaction } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { updateOrderStatusAction } from "@/app/admin/actions";
import {
  deliveryLabel,
  formatFullDateTime,
  formatIDR,
  formatPhone,
  formatPickupDate,
  paymentLabel,
  statusLabel,
} from "@/lib/utils";

/**
 * Detail satu batch pre-order (Steven 14-10-2026).
 *
 * Navigasi di dalam halaman ini tetap berupa kotak Stok / Pesanan /
 * Pelanggan / Mutasi — tapi tiap tab sekarang halaman LENGKAP dengan kartu
 * ringkasan, filter, dan tabel, supaya sepadan dengan halaman Mutasi asli di
 * sidebar utama. Bedanya cuma: semua datanya disaring ke satu batch.
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
 */

type TabKey = "stok" | "pesanan" | "pelanggan" | "mutasi";

export interface PoDetailLabels {
  back: string;
  subtitle: string;
  scopeNote: string;
  tabs: { stok: string; pesanan: string; pelanggan: string; mutasi: string };
  stok: {
    title: string;
    subtitle: string;
    colName: string;
    colInitial: string;
    colSold: string;
    colLeft: string;
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
    bundlesPrice: string;
    bundlesPriceHint: string;
  };
  pesanan: {
    title: string;
    subtitle: string;
    empty: string;
    failed: string;
    colCode: string;
    colCustomer: string;
    colItems: string;
    colTotal: string;
    colStatus: string;
    colDate: string;
    accept: string;
    reject: string;
    ready: string;
    deliver: string;
  };
  pelanggan: {
    title: string;
    subtitle: string;
    empty: string;
    failed: string;
    search: string;
    colName: string;
    colPhone: string;
    colIg: string;
    colOrders: string;
    colSpent: string;
    colLast: string;
  };
  mutasi: {
    title: string;
    subtitle: string;
    empty: string;
    failed: string;
    search: string;
    colDate: string;
    colCode: string;
    colCustomer: string;
    colItems: string;
    colTotal: string;
  };
  summary: {
    revenue: string;
    revenueToday: string;
    orders: string;
    pcs: string;
    terjual: string;
    pending: string;
    selesai: string;
    ditolak: string;
  };
  viewDetail: string;
}

export function PoBatchDetailClient({
  initial,
  kategori,
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
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("stok");

  const { batch, ringkasan } = initial;
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
    <div className="space-y-5 pb-24">
      <Link
        href="/admin/po"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-cocoa-600 transition hover:text-cocoa-900"
      >
        <ArrowLeft className="size-4" />
        {labels.back}
      </Link>

      <header className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold text-cocoa-900">
            {batch.label}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadge}`}>
            {t.admin.po[statusKey[batch.status]]}
          </span>
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-cocoa-500">
          <span>
            {t.admin.po.openAt}: {formatPickupDate(batch.open_at, lang)}
          </span>
          <span>·</span>
          <span>
            {t.admin.po.closeAt}: {formatPickupDate(batch.close_at, lang)}
          </span>
          <span>·</span>
          <span className="font-semibold text-cocoa-700">
            {t.admin.po.pickupDate}: {formatPickupDate(batch.pickup_date, lang)}
          </span>
        </p>

        <p className="mt-2 text-sm text-cocoa-500">{labels.scopeNote}</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)] lg:items-start">
        <nav
          aria-label={labels.tabs.stok}
          className="flex gap-1.5 overflow-x-auto rounded-2xl border border-cocoa-200 bg-cream-50 p-1.5 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible"
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
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold whitespace-nowrap transition ${
                  active ? "bg-cocoa-900 text-cream-50" : "text-cocoa-600 hover:bg-white"
                }`}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-5">
          {tab === "stok" ? (
            <StockTab initial={initial} kategori={kategori} labels={labels} toast={toast} onSaved={() => router.refresh()} />
          ) : null}

          {tab === "pesanan" ? (
            <OrdersTab orders={orders} failed={ordersFailed} labels={labels} toast={toast} />
          ) : null}

          {tab === "pelanggan" ? (
            <CustomersTab customers={customers} failed={customersFailed} labels={labels} />
          ) : null}

          {tab === "mutasi" ? (
            <MutasiTab mutasi={mutasi} failed={mutasiFailed} labels={labels} />
          ) : null}

          {/* Ringkasan batch — muncul di semua tab, karena angkanya berlaku untuk
              seluruh batch bukan cuma satu tab. */}
          <section className="card p-5">
            <h2 className="text-lg font-extrabold text-cocoa-900">
              {labels.summary.terjual}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label={labels.summary.revenue} value={formatIDR(ringkasan.pendapatan, lang)} />
              <Stat label={labels.summary.pcs} value={String(ringkasan.pcs_terjual)} />
              <Stat label={labels.summary.pending} value={String(ringkasan.pending)} />
              <Stat label={labels.summary.selesai} value={String(ringkasan.selesai)} />
              <Stat label={labels.summary.ditolak} value={String(ringkasan.ditolak)} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
 * STOK — bisa diedit + pilih bundle
 * ========================================================================== */

function StockTab({
  initial,
  kategori,
  labels,
  toast,
  onSaved,
}: {
  initial: PoBatchDetail;
  kategori: Array<{ id: number; name: string }>;
  labels: PoDetailLabels;
  toast: ReturnType<typeof useToast>;
  onSaved: () => void;
}) {
  const { lang, t } = useI18n();
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

  const [picked, setPicked] = useState<Record<number, number | null>>(() => {
    const draft: Record<number, number | null> = {};
    for (const b of initial.bundles) draft[b.bundle_id] = b.dipakai ? (b.harga_batch ?? null) : null;
    return draft;
  });

  const semuaBundleAktif = initial.semua_bundle_aktif;
  const rows = useMemo(() => {
    const byId = new Map(initial.stok.map((r) => [r.category_id, r]));
    return kategori.map((k) => ({
      id: k.id,
      name: k.name,
      terjual: byId.get(k.id)?.terjual ?? 0,
      nilai: stock[k.id] ?? 0,
    }));
  }, [initial.stok, kategori, stock]);

  function toggleBundle(id: number) {
    setDirtyBundles(true);
    setPicked((prev) => ({ ...prev, [id]: prev[id] == null ? 0 : null }));
  }

  function setBundlePrice(id: number, value: string) {
    setDirtyBundles(true);
    const n = Number(value.replace(/\D/g, ""));
    setPicked((prev) => ({ ...prev, [id]: value === "" ? null : n }));
  }

  function simpan() {
    startTransition(async () => {
      if (dirtyStock) {
        const payload: Record<string, number> = {};
        for (const row of rows) payload[String(row.id)] = row.nilai;
        const res = await savePoBatchStockAction(initial.batch.id, payload);
        if (!res.ok) {
          toast.error(res.error ?? t.errors.generic);
          return;
        }
        setDirtyStock(false);
      }
      if (dirtyBundles) {
        const list = Object.entries(picked)
          .filter(([, v]) => v != null)
          .map(([id, v]) => ({ bundle_id: Number(id), price: v }));
        const res = await savePoBatchBundlesAction(initial.batch.id, list);
        if (!res.ok) {
          toast.error(res.error ?? t.errors.generic);
          return;
        }
        setDirtyBundles(false);
      }
      toast.success(labels.stok.saved);
      onSaved();
    });
  }

  const adaPerubahan = dirtyStock || dirtyBundles;

  return (
    <>
      <section className="card p-5">
        <h2 className="text-lg font-extrabold text-cocoa-900">{labels.stok.title}</h2>
        <p className="mt-1 text-[13px] text-cocoa-500">{labels.stok.subtitle}</p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-cocoa-200">
          <div className="hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-cocoa-500 sm:grid sm:grid-cols-[minmax(0,1fr)_90px_90px_120px] sm:gap-3">
            <div>{labels.stok.colName}</div>
            <div className="text-right">{labels.stok.colInitial}</div>
            <div className="text-right">{labels.stok.colSold}</div>
            <div className="text-right">{labels.stok.colInput}</div>
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-cocoa-400">{labels.stok.empty}</p>
          ) : (
            <ul className="divide-y divide-cocoa-200">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="grid grid-cols-3 gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_90px_90px_120px] sm:items-center"
                >
                  <div className="col-span-3 font-bold text-cocoa-900 sm:col-span-1">
                    {row.name}
                  </div>
                  <div className="text-right text-cocoa-600 tabular">
                    {row.nilai + row.terjual}
                  </div>
                  <div className="text-right text-cocoa-600 tabular">{row.terjual}</div>
                  <div className="text-right">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      aria-label={`${row.name} — ${labels.stok.colInput}`}
                      value={row.nilai}
                      onChange={(e) => {
                        setDirtyStock(true);
                        const n = Math.max(0, Number.parseInt(e.target.value || "0", 10) || 0);
                        setStock((prev) => ({ ...prev, [row.id]: n }));
                      }}
                      className="input tabular w-28 text-right"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-2.5 text-[12px] text-cocoa-500">{labels.stok.initialHint}</p>

        {/* ---------- Bundle ---------- */}
        <div className="mt-7 border-t border-cocoa-200 pt-6">
          <h3 className="text-base font-extrabold text-cocoa-900">
            {labels.stok.bundlesTitle}
          </h3>
          <p className="mt-1 text-[13px] text-cocoa-500">{labels.stok.bundlesSubtitle}</p>

          {initial.bundles.length === 0 ? (
            <p className="mt-4 text-sm text-cocoa-400">{labels.stok.bundlesEmpty}</p>
          ) : (
            <>
              {!semuaBundleAktif ? null : (
                <p className="mt-3 rounded-xl bg-honey-300/20 px-3.5 py-2.5 text-[13px] font-semibold text-honey-500">
                  {labels.stok.bundlesAllHint}
                </p>
              )}
              <ul className="mt-4 space-y-2.5">
                {initial.bundles.map((b) => {
                  const on = picked[b.bundle_id] != null;
                  return (
                    <li
                      key={b.bundle_id}
                      className={`flex flex-wrap items-center gap-3 rounded-2xl border-2 p-3.5 transition ${
                        on ? "border-cocoa-900 bg-cream-50" : "border-cocoa-200 bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleBundle(b.bundle_id)}
                        aria-pressed={on}
                        className={`grid size-6 shrink-0 place-items-center rounded-md border transition ${
                          on ? "border-cocoa-900 bg-cocoa-900 text-cream-50" : "border-cocoa-300"
                        }`}
                        aria-label={b.nama}
                      >
                        {on ? <Check className="size-4" /> : null}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-cocoa-900">{b.nama}</p>
                        <p className="text-[12px] text-cocoa-500">
                          {b.required_qty} pcs · {formatIDR(b.harga_bawaan, lang)}
                        </p>
                      </div>

                      <div className="text-right">
                        <label className="block text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
                          {labels.stok.bundlesPrice}
                        </label>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          disabled={!on}
                          placeholder={String(b.harga_bawaan)}
                          aria-label={`${b.nama} — ${labels.stok.bundlesPrice}`}
                          value={picked[b.bundle_id] ?? ""}
                          onChange={(e) => setBundlePrice(b.bundle_id, e.target.value)}
                          className="input tabular mt-0.5 w-32 text-right disabled:opacity-50"
                        />
                        <p className="mt-0.5 text-[11px] text-cocoa-400">
                          {labels.stok.bundlesPriceHint}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {adaPerubahan ? (
          <div className="sticky bottom-4 mt-5 flex justify-end">
            <button type="button" onClick={simpan} disabled={pending} className="btn-primary shadow-lg">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {pending ? labels.stok.saving : labels.stok.save}
            </button>
          </div>
        ) : null}
      </section>
    </>
  );
}

/* ==========================================================================
 * PESANAN
 * ========================================================================== */

const NEXT_STATUS: Array<{ status: OrderStatus; icon: typeof Check }> = [
  { status: "accepted", icon: Check },
  { status: "ready", icon: Package },
  { status: "delivered", icon: Boxes },
];

function OrdersTab({
  orders,
  failed,
  labels,
  toast,
}: {
  orders: Order[];
  failed: boolean;
  labels: PoDetailLabels;
  toast: ReturnType<typeof useToast>;
}) {
  const { lang, t } = useI18n();
  const [busyId, setBusyId] = useState<number | null>(null);

  const actionLabel: Record<string, string> = {
    accepted: labels.pesanan.accept,
    ready: labels.pesanan.ready,
    delivered: labels.pesanan.deliver,
    rejected: labels.pesanan.reject,
  };

  async function changeStatus(order: Order, next: OrderStatus) {
    setBusyId(order.id);
    const res = await updateOrderStatusAction(order.id, next);
    setBusyId(null);
    if (res.ok) {
      toast.success(statusLabel(next, lang));
    } else {
      toast.error(res.error ?? t.errors.generic);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold text-cocoa-900">{labels.pesanan.title}</h2>
      <p className="mt-1 text-[13px] text-cocoa-500">{labels.pesanan.subtitle}</p>

      {failed ? (
        <p className="mt-5 text-sm text-cocoa-500">{labels.pesanan.failed}</p>
      ) : orders.length === 0 ? (
        <p className="mt-5 text-sm text-cocoa-400">{labels.pesanan.empty}</p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 gap-2.5">
            <Stat
              label={labels.summary.orders}
              value={String(orders.filter((o) => o.status === "pending").length)}
            />
            <Stat
              label={labels.summary.selesai}
              value={String(
                orders.filter((o) => ["accepted", "ready", "delivered"].includes(o.status))
                  .length
              )}
            />
            <Stat
              label={labels.summary.revenue}
              value={formatIDR(
                orders
                  .filter((o) => !["rejected", "cancelled"].includes(o.status))
                  .reduce((a, o) => a + o.total_price, 0),
                lang
              )}
            />
          </dl>

          <div className="mt-5 overflow-hidden rounded-2xl border border-cocoa-200">
            <div className="hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-cocoa-500 lg:grid lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1.2fr)_110px_150px_240px] lg:gap-3">
              <div>{labels.pesanan.colDate}</div>
              <div>{labels.pesanan.colCode}</div>
              <div>{labels.pesanan.colCustomer}</div>
              <div className="text-right">{labels.pesanan.colItems}</div>
              <div className="text-right">{labels.pesanan.colTotal}</div>
              <div>{labels.pesanan.colStatus}</div>
            </div>
            <ul className="divide-y divide-cocoa-200">
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 text-sm lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1.2fr)_110px_150px_240px] lg:items-center lg:gap-3"
                >
                  <div className="font-mono text-[12px] text-cocoa-500">
                    {formatFullDateTime(o.created_at, lang)}
                  </div>
                  <div className="font-mono text-xs font-bold text-cocoa-900">
                    {o.order_code}
                    <span className="block font-sans text-[12px] font-normal text-cocoa-500">
                      {deliveryLabel(o.delivery_method, lang)} ·{" "}
                      {paymentLabel(o.payment_method, lang)}
                    </span>
                  </div>
                  <div className="text-[13px] text-cocoa-700">
                    {o.customer_name}
                    <span className="block text-[12px] text-cocoa-500" dir="ltr">
                      {formatPhone(o.phone)}
                    </span>
                  </div>
                  <div className="text-right text-[13px] text-cocoa-600 tabular">
                    {o.items.reduce((a, i) => a + i.quantity, 0)}
                  </div>
                  <div className="text-right font-bold text-cocoa-900 tabular">
                    {formatIDR(o.total_price, lang)}
                  </div>
                  <div className="col-span-2 flex flex-wrap items-center gap-1.5 lg:col-span-1">
                    <StatusBadge
                      status={o.status}
                      label={statusLabel(o.status, lang)}
                      size="sm"
                    />
                    {NEXT_STATUS.filter((n) => orderCanGo(o.status, n.status)).map(
                      (n) => {
                        const Icon = n.icon;
                        return (
                          <button
                            key={n.status}
                            type="button"
                            disabled={busyId === o.id}
                            onClick={() => void changeStatus(o, n.status)}
                            title={actionLabel[n.status]}
                            aria-label={`${actionLabel[n.status]} ${o.order_code}`}
                            className="grid size-8 place-items-center rounded-lg border border-cocoa-200 text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-40"
                          >
                            {busyId === o.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Icon className="size-4" />
                            )}
                          </button>
                        );
                      }
                    )}
                    {o.status === "pending" ? (
                      <button
                        type="button"
                        disabled={busyId === o.id}
                        onClick={() => void changeStatus(o, "rejected")}
                        title={labels.pesanan.reject}
                        aria-label={`${labels.pesanan.reject} ${o.order_code}`}
                        className="grid size-8 place-items-center rounded-lg border border-berry-500/30 text-berry-600 transition hover:bg-berry-500/10 disabled:opacity-40"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

/** Status berikutnya yang valid untuk pesanan ini. */
function orderCanGo(from: OrderStatus, to: OrderStatus): boolean {
  const chain: OrderStatus[] = ["pending", "accepted", "ready", "delivered"];
  const i = chain.indexOf(from);
  const j = chain.indexOf(to);
  return i >= 0 && j === i + 1;
}

/* ==========================================================================
 * PELANGGAN
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
  const { lang, t } = useI18n();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((c) =>
      [c.customer_name, c.phone, c.customer_email, c.instagram]
        .filter((x): x is string => !!x)
        .some((x) => x.toLowerCase().includes(needle))
    );
  }, [customers, q]);

  return (
    <section className="card p-5">
      <h2 className="text-lg font-extrabold text-cocoa-900">{labels.pelanggan.title}</h2>
      <p className="mt-1 text-[13px] text-cocoa-500">{labels.pelanggan.subtitle}</p>

      {failed ? (
        <p className="mt-5 text-sm text-cocoa-500">{labels.pelanggan.failed}</p>
      ) : customers.length === 0 ? (
        <p className="mt-5 text-sm text-cocoa-400">{labels.pelanggan.empty}</p>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-cocoa-200 bg-cream-50 px-3 py-2.5">
            <Search className="size-4 shrink-0 text-cocoa-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={labels.pelanggan.search}
              aria-label={labels.pelanggan.search}
              className="min-w-0 flex-1 bg-transparent text-sm text-cocoa-900 outline-none placeholder:text-cocoa-400"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label={t.common.close}
                className="text-cocoa-400 hover:text-cocoa-700"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-cocoa-200">
            <div className="hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-cocoa-500 lg:grid lg:grid-cols-[minmax(0,1fr)_160px_150px_90px_130px_170px] lg:gap-3">
              <div>{labels.pelanggan.colName}</div>
              <div>{labels.pelanggan.colPhone}</div>
              <div>{labels.pelanggan.colIg}</div>
              <div className="text-right">{labels.pelanggan.colOrders}</div>
              <div className="text-right">{labels.pelanggan.colSpent}</div>
              <div>{labels.pelanggan.colLast}</div>
            </div>
            <ul className="divide-y divide-cocoa-200">
              {filtered.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_160px_150px_90px_130px_170px] lg:items-center lg:gap-3"
                >
                  <div className="col-span-2 font-bold text-cocoa-900 lg:col-span-1">
                    {c.customer_name}
                  </div>
                  <a
                    href={`https://wa.me/${c.phone_normalized}`}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                    className="text-[13px] text-cocoa-600 hover:underline"
                  >
                    {formatPhone(c.phone)}
                  </a>
                  <div className="truncate text-[13px] text-cocoa-600">
                    {c.instagram ? `@${c.instagram}` : "—"}
                  </div>
                  <div className="text-right text-cocoa-600 tabular">{c.order_count}×</div>
                  <div className="text-right font-bold text-cocoa-900 tabular">
                    {formatIDR(c.total_spent, lang)}
                  </div>
                  <div className="font-mono text-[12px] text-cocoa-500">
                    {c.last_order_code}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </section>
  );
}

/* ==========================================================================
 * MUTASI
 * ========================================================================== */

function MutasiTab({
  mutasi,
  failed,
  labels,
}: {
  mutasi: { summary: SalesSummary; transactions: SalesTransaction[]; total: number } | null;
  failed: boolean;
  labels: PoDetailLabels;
}) {
  const { lang, t } = useI18n();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !mutasi) return mutasi?.transactions ?? [];
    return mutasi.transactions.filter((tr) =>
      [tr.order_code, tr.customer_name, tr.phone]
        .filter((x): x is string => !!x)
        .some((x) => x.toLowerCase().includes(needle))
    );
  }, [mutasi, q]);

  if (failed || !mutasi) {
    return (
      <section className="card p-5">
        <h2 className="text-lg font-extrabold text-cocoa-900">{labels.mutasi.title}</h2>
        <p className="mt-4 text-sm text-cocoa-500">{labels.mutasi.failed}</p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 text-lg font-extrabold text-cocoa-900">
        <ChartNoAxesColumn className="size-5" />
        {labels.mutasi.title}
      </h2>
      <p className="mt-1 text-[13px] text-cocoa-500">{labels.mutasi.subtitle}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2.5">
        <Stat
          label={labels.summary.revenue}
          value={formatIDR(mutasi.summary.revenue_total, lang)}
        />
        <Stat label={labels.summary.orders} value={String(mutasi.summary.orders_count)} />
        <Stat label={labels.summary.pcs} value={String(mutasi.summary.pcs_sold)} />
      </dl>

      {mutasi.summary.top_flavors?.length ? (
        <div className="mt-4 rounded-2xl border border-cocoa-200 p-4">
          <h3 className="text-sm font-bold text-cocoa-800">{t.admin.sales.topFlavors}</h3>
          <ul className="mt-2.5 space-y-1.5">
            {mutasi.summary.top_flavors.map((f, i) => (
              <li key={f.flavor_name} className="flex items-center gap-2 text-sm">
                <span className="w-8 shrink-0 font-bold text-cocoa-400 tabular">#{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-cocoa-700">{f.flavor_name}</span>
                <span className="font-bold text-cocoa-900 tabular">{f.qty}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-cocoa-200 bg-cream-50 px-3 py-2.5">
        <Filter className="size-4 shrink-0 text-cocoa-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.mutasi.search}
          aria-label={labels.mutasi.search}
          className="min-w-0 flex-1 bg-transparent text-sm text-cocoa-900 outline-none placeholder:text-cocoa-400"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label={t.common.close}
            className="text-cocoa-400 hover:text-cocoa-700"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {mutasi.transactions.length === 0 ? (
        <p className="mt-4 text-sm text-cocoa-400">{labels.mutasi.empty}</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-cocoa-200">
          <div className="hidden border-b border-cocoa-200 bg-cream-100/70 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-cocoa-500 lg:grid lg:grid-cols-[90px_120px_minmax(0,1fr)_minmax(0,1.3fr)_130px] lg:gap-3">
            <div>{labels.mutasi.colDate}</div>
            <div>{labels.mutasi.colCode}</div>
            <div>{labels.mutasi.colCustomer}</div>
            <div>{labels.mutasi.colItems}</div>
            <div className="text-right">{labels.mutasi.colTotal}</div>
          </div>
          <ul className="divide-y divide-cocoa-200">
            {filtered.map((tr) => (
              <li
                key={tr.id}
                className="grid grid-cols-2 gap-x-3 gap-y-1 px-4 py-3 text-sm lg:grid-cols-[90px_120px_minmax(0,1fr)_minmax(0,1.3fr)_130px] lg:items-center lg:gap-3"
              >
                <div className="font-mono text-[12px] text-cocoa-500">
                  {formatFullDateTime(tr.created_at, lang)}
                </div>
                <div className="font-mono text-xs font-bold text-cocoa-900">{tr.order_code}</div>
                <div className="truncate text-[13px] text-cocoa-700">{tr.customer_name}</div>
                <div className="col-span-2 truncate text-[12px] text-cocoa-500 lg:col-span-1">
                  {tr.items.length === 0
                    ? "—"
                    : tr.items.map((i) => `${i.quantity}× ${i.flavor_name}`).join(", ")}
                </div>
                <div className="text-right font-bold text-cocoa-900 tabular">
                  {formatIDR(tr.total_price, lang)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cocoa-50 px-3 py-2.5">
      <dt className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-extrabold text-cocoa-900 tabular">{value}</dd>
    </div>
  );
}

void Pencil;