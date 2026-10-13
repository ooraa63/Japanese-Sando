"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import type { PoBatch, PoCategoryLite } from "@/app/admin/actions";
import {
  deletePoBatchAction,
  savePoBatchAction,
} from "@/app/admin/actions";

/**
 * Kelola batch pre-order.
 *
 * Model (Steven 13-10-2026): beberapa batch boleh hidup bersamaan. Contohnya
 * batch A buka 14-16 Oktober, ambil 17 Oktober, stok 30; batch B buka
 * 15-18 Oktober, ambil 19 Oktober, stok 40. Pembeli hanya melihat "17 Oktober"
 * atau "19 Oktober" — nama batch tidak pernah tampil ke mereka.
 *
 * Stok diisi PER JENIS MENU, sama seperti model stok lama yang per kategori.
 * Yang berubah adalah satu batch punya stoknya sendiri, jadi dua batch yang
 * tumpang tindih tidak berebut stok yang sama.
 */
type Draft = {
  id: number | null;
  label: string;
  open_at: string;
  close_at: string;
  pickup_date: string;
  is_active: boolean;
  /** Di-index dengan String(category_id). */
  stock: Record<string, string>;
};

const KOSONG: Draft = {
  id: null,
  label: "",
  open_at: "",
  close_at: "",
  pickup_date: "",
  is_active: true,
  stock: {},
};

const STATUS_KEY = {
  buka: "statusBuka",
  akan_dibuka: "statusAkan",
  selesai: "statusSelesai",
  nonaktif: "statusNonaktif",
} as const;

function isoHariIni() {
  // Pakai waktu lokal perangkat, bukan toISOString() yang bisa bergeser satu
  // hari depending zona waktu.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function formatTanggal(iso: string, lang: string) {
  if (!iso) return "-";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === "en" ? "en-GB" : "id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PoBatchesClient({
  initial,
  loadFailed = false,
}: {
  initial: { batches: PoBatch[]; kategori: PoCategoryLite[] };
  loadFailed?: boolean;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [batches, setBatches] = useState<PoBatch[]>(initial.batches);
  const [openId, setOpenId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(KOSONG);

  const kategori = initial.kategori;
  const patch = (next: Partial<Draft>) => setDraft((p) => ({ ...p, ...next }));

  function editBatch(b: PoBatch) {
    const stock: Record<string, string> = {};
    for (const k of kategori) {
      const cell = b.stok[String(k.id)];
      stock[String(k.id)] = cell ? String(cell.stock) : "0";
    }
    setDraft({
      id: b.id,
      label: b.label,
      open_at: b.open_at,
      close_at: b.close_at,
      pickup_date: b.pickup_date,
      is_active: b.is_active,
      stock,
    });
    setOpenId(b.id);
  }

  function newBatch() {
    const hariIni = isoHariIni();
    setDraft({
      ...KOSONG,
      open_at: hariIni,
      close_at: hariIni,
      pickup_date: hariIni,
      stock: Object.fromEntries(kategori.map((k) => [String(k.id), "0"])),
    });
    setOpenId("new");
  }

  function save() {
    if (!draft.label.trim()) {
      toast.error(t.admin.po.label);
      return;
    }
    if (!draft.open_at || !draft.close_at || !draft.pickup_date) {
      toast.error(t.admin.po.dateHint);
      return;
    }

    const stock: Record<string, number> = {};
    for (const [k, v] of Object.entries(draft.stock)) {
      stock[k] = Math.max(0, Number.parseInt(v || "0", 10) || 0);
    }

    startTransition(async () => {
      const res = await savePoBatchAction({
        id: draft.id,
        label: draft.label.trim(),
        open_at: draft.open_at,
        close_at: draft.close_at,
        pickup_date: draft.pickup_date,
        is_active: draft.is_active,
        stock,
      });
      if (!res.ok) {
        toast.error(
          res.error === "stock_below_reserved"
            ? t.admin.po.stockBelowReserved
            : t.errors.generic
        );
        return;
      }
      toast.success(t.admin.po.saved);
      setOpenId(null);
      router.refresh();
    });
  }

  function remove(b: PoBatch) {
    if (!window.confirm(t.admin.po.deleteConfirm)) return;
    startTransition(async () => {
      const res = await deletePoBatchAction(b.id);
      if (!res.ok) {
        toast.error(
          res.error === "batch_has_orders" ? t.admin.po.deleteBlocked : t.errors.generic
        );
        return;
      }
      toast.success(t.admin.po.deleted);
      setBatches((prev) => prev.filter((x) => x.id !== b.id));
      router.refresh();
    });
  }

  const badge = (s: PoBatch["status"]) =>
    s === "buka"
      ? "bg-matcha-100 text-matcha-700"
      : s === "akan_dibuka"
        ? "bg-honey-300/25 text-honey-500"
        : s === "selesai"
          ? "bg-cocoa-100 text-cocoa-500"
          : "bg-berry-500/10 text-berry-600";

  const bolehHapus = useMemo(
    () => batches.filter((b) => b.terjual === 0),
    [batches]
  );

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.po.title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-cocoa-500">{t.admin.po.subtitle}</p>
        </div>
        <button type="button" onClick={newBatch} className="btn-primary shrink-0">
          <Plus className="size-4" />
          {t.admin.po.addBatch}
        </button>
      </div>

      {loadFailed ? (
        <div className="card flex items-start gap-3 border-berry-200 bg-berry-500/5 p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-berry-600" />
          <p className="text-sm text-cocoa-700">{t.errors.generic}</p>
        </div>
      ) : null}

      {batches.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-cocoa-500">{t.admin.po.empty}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-cocoa-400">
            {t.admin.po.emptyHint}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {batches.map((b) => (
            <li key={b.id} className="card p-0">
              <div className="flex flex-wrap items-start gap-3 p-4">
                {/* Area kiri adalah TAUTAN ke /admin/po/[id] (Steven
                    14-10-2026). Tombol Ubah/Hapus sengaja TIDAK ikut jadi
                    tautan supaya klik "Hapus" tidak pernah Bella-belok
                    membuka halaman detail. */}
                <Link
                  href={`/admin/po/${b.id}`}
                  className="min-w-0 flex-1 rounded-lg transition hover:opacity-80"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base font-bold text-cocoa-900">
                      {b.label}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge(b.status)}`}
                    >
                      {t.admin.po[STATUS_KEY[b.status]]}
                    </span>
                  </div>

                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-cocoa-500">
                    <CalendarDays className="size-3.5" />
                    <span>
                      {t.admin.po.openAt}: {formatTanggal(b.open_at, lang)}
                    </span>
                    <span>·</span>
                    <span>
                      {t.admin.po.closeAt}: {formatTanggal(b.close_at, lang)}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-cocoa-700">
                      {t.admin.po.pickupDate}: {formatTanggal(b.pickup_date, lang)}
                    </span>
                  </p>

                  <p className="mt-1 text-[13px] text-cocoa-500">
                    {t.admin.po.soldLabel.replace("{n}", String(b.terjual))} ·{" "}
                    {t.admin.po.pcsSoldLabel.replace("{n}", String(b.pcs_terjual))} ·{" "}
                    {t.admin.po.revenue}: Rp {b.pendapatan.toLocaleString("id-ID")}
                  </p>

                  <p className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-bold text-cocoa-600">
                    {t.admin.po.detail.viewDetail}
                    <ChevronRight className="size-3.5" />
                  </p>
                </Link>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => editBatch(b)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100"
                  >
                    <Pencil className="size-3.5" />
                    {t.common.edit}
                  </button>
                  {bolehHapus.includes(b) ? (
                    <button
                      type="button"
                      onClick={() => remove(b)}
                      disabled={pending}
                      className="rounded-lg p-2 text-cocoa-400 transition hover:bg-berry-500/10 hover:text-berry-600 disabled:opacity-40"
                      aria-label={t.admin.po.delete}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              {Object.keys(b.stok).length > 0 ? (
                <div className="flex flex-wrap gap-2 border-t border-cocoa-100 bg-cream-50/60 px-4 py-2.5">
                  {Object.entries(b.stok).map(([k, cell]) => (
                    <span
                      key={k}
                      className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                        cell.stock <= 0
                          ? "bg-berry-500/10 text-berry-600"
                          : "bg-matcha-50 text-matcha-700"
                      }`}
                    >
                      {cell.nama}: {cell.stock} {t.admin.po.pcsLeft}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {openId ? (
        <div className="card p-5">
          <h2 className="text-lg font-bold text-cocoa-900">
            {draft.id ? t.admin.po.editBatch : t.admin.po.newBatch}
          </h2>

          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-cocoa-700">
                {t.admin.po.label}
              </span>
              <input
                type="text"
                value={draft.label}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder={t.admin.po.labelPlaceholder}
                className="input mt-1 w-full"
              />
              <span className="mt-1 block text-xs text-cocoa-400">
                {t.admin.po.labelHint}
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-sm font-semibold text-cocoa-700">
                  {t.admin.po.openAt}
                </span>
                <input
                  type="date"
                  value={draft.open_at}
                  onChange={(e) => patch({ open_at: e.target.value })}
                  className="input mt-1 w-full"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-cocoa-700">
                  {t.admin.po.closeAt}
                </span>
                <input
                  type="date"
                  value={draft.close_at}
                  onChange={(e) => patch({ close_at: e.target.value })}
                  className="input mt-1 w-full"
                />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-cocoa-700">
                  {t.admin.po.pickupDate}
                </span>
                <input
                  type="date"
                  value={draft.pickup_date}
                  min={draft.open_at || undefined}
                  onChange={(e) => patch({ pickup_date: e.target.value })}
                  className="input mt-1 w-full"
                />
              </label>
            </div>
            <p className="text-xs text-cocoa-400">{t.admin.po.dateHint}</p>

            <div>
              <p className="text-sm font-semibold text-cocoa-700">
                {t.admin.po.stockTitle}
              </p>
              <p className="mt-0.5 text-xs text-cocoa-400">{t.admin.po.stockHint}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {kategori.map((k) => (
                  <label
                    key={k.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-cocoa-200 bg-white px-3 py-2"
                  >
                    <span className="truncate text-sm font-semibold text-cocoa-700">
                      {k.nama}
                    </span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={draft.stock[String(k.id)] ?? "0"}
                      onChange={(e) =>
                        patch({
                          stock: { ...draft.stock, [String(k.id)]: e.target.value },
                        })
                      }
                      className="input w-24 text-right tabular"
                    />
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-cocoa-700">
              <input
                type="checkbox"
                checked={draft.is_active}
                onChange={(e) => patch({ is_active: e.target.checked })}
              />
              {draft.is_active ? t.admin.po.active : t.admin.po.inactive}
            </label>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="btn-primary"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {t.admin.po.save}
            </button>
            <button
              type="button"
              onClick={() => setOpenId(null)}
              disabled={pending}
              className="btn-ghost"
            >
              {t.common.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}