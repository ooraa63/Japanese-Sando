"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Info,
  Loader2,
  MapPin,
  Plus,
  Save,
  Store,
  Tag,
  Trash2,
} from "lucide-react";
import type { AdminDeliveryZone } from "@/app/admin/actions";
import {
  deleteDeliveryZoneAction,
  getDeliveryZonesAction,
  saveDeliveryZoneAction,
} from "@/app/admin/actions";
import type { ShippingDiscount } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatIDR } from "@/lib/utils";


/**
 * Rapikan nilai `shipping_discounts` yang datang dari database.
 *
 * Kolomnya jsonb dan bebas diisi apa saja (penjual bisa menyunting langsung
 * dari SQL), jadi bentuknya tidak selalu rapi: bisa bukan array, bisa berisi
 * `null`, `min` bukan angka, atau `percent` di luar 0-100. Semua itu dibuang
 * di sini supaya form admin tidak pernah crash.
 */
function normalizeDiscounts(value: unknown): ShippingDiscount[] {
  if (!Array.isArray(value)) return [];
  const out: ShippingDiscount[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { min?: unknown; percent?: unknown };
    const min = Number(r.min);
    const percent = Number(r.percent);
    if (!Number.isFinite(min) || min < 0) continue;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) continue;
    out.push({ min: Math.floor(min), percent: Math.floor(percent) });
  }
  return out.sort((a, b) => a.min - b.min);
}

interface ZoneDraft {
  id: string;
  name_id: string;
  name_en: string;
  fee: number;
  lat: string;
  lng: string;
  radius_km: string;
  requires_address: boolean;
  sort_order: number;
  is_active: boolean;
  /** 'delivery' = zona antaran (pakai ongkir). 'pickup' = titik pengambilan. */
  kind: "delivery" | "pickup";
  /** Catatan untuk pembeli — mis. jam ambil. Dipakai titik pengambilan. */
  note_id: string;
  note_en: string;
  /** Potongan ongkir bertingkat (migration-46). Hanya untuk 'delivery'. */
  shipping_discounts: ShippingDiscount[];
}

const EMPTY: ZoneDraft = {
  id: "",
  name_id: "",
  name_en: "",
  fee: 0,
  lat: "",
  lng: "",
  radius_km: "",
  requires_address: true,
  sort_order: 0,
  is_active: true,
  kind: "delivery",
  note_id: "",
  note_en: "",
  shipping_discounts: [],
};

export function DeliveryZonesClient({
  kindFilter,
}: {
  /** Batasi daftar (dan jenis bawaan saat membuat baru) ke satu jenis. */
  kindFilter?: "delivery" | "pickup";
} = {}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<AdminDeliveryZone[]>([]);
  const [editing, setEditing] = useState<ZoneDraft | null>(null);
  const [removing, setRemoving] = useState<AdminDeliveryZone | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await getDeliveryZonesAction();
      if (res.ok && res.data) setRows(res.data);
      else toast.error(t.errors.generic);
    });
  }, [t, toast]);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditing({
      ...EMPTY,
      // Zona baru di halaman "Ambil di toko" langsung jadi titik ambil,
      // dan tidak perlu ongkir / alamat pembeli.
      ...(kindFilter === "pickup"
        ? { kind: "pickup" as const, fee: 0, requires_address: false }
        : kindFilter === "delivery"
          ? { kind: "delivery" as const }
          : {}),
    });
  }

  // Baris yang tampil. Kalau halaman ini difilter per jenis (menu "Catatan
  // Pengambilan & Pengiriman" punya tab Ambil di toko / Pengantaran),
  // hanya jenis itu yang dirender — jadi admin tidak salah pilih tab.
  const visibleRows = kindFilter
    ? rows.filter((r) => (r.kind ?? "delivery") === kindFilter)
    : rows;

  function startEdit(row: AdminDeliveryZone) {
    setEditing({
      id: row.id,
      name_id: row.name_id,
      name_en: row.name_en,
      fee: row.fee,
      lat: row.lat?.toString() ?? "",
      lng: row.lng?.toString() ?? "",
      radius_km: row.radius_km?.toString() ?? "",
      requires_address: row.requires_address,
      sort_order: row.sort_order,
      is_active: row.is_active,
      kind: row.kind === "pickup" ? "pickup" : "delivery",
      note_id: row.note_id ?? "",
      note_en: row.note_en ?? "",
      shipping_discounts:
        row.kind === "pickup" ? [] : normalizeDiscounts(row.shipping_discounts),
    });
  }

  function save() {
    if (!editing) return;
    if (!editing.id.trim()) {
      toast.error(t.admin.deliveryZones.errorIdRequired);
      return;
    }
    startTransition(async () => {
      const payload = {
        id: editing.id.trim().toLowerCase(),
        name_id: editing.name_id.trim(),
        name_en: editing.name_en.trim(),
        fee: editing.fee,
        lat: editing.lat.trim(),
        lng: editing.lng.trim(),
        radius_km: editing.radius_km.trim(),
        requires_address: editing.requires_address,
        sort_order: editing.sort_order,
        is_active: editing.is_active,
        // Tanpa `kind` di payload, `admin_upsert_zone` selalu menyimpan
        // 'delivery' — itu sebabnya admin tidak pernah bisa membuat titik
        // pengambilan. Lihat supabase/migration-39.sql.
        kind: editing.kind,
        note_id: editing.note_id.trim(),
        note_en: editing.note_en.trim(),
        // Hanya zona antaran yang bisa punya potongan. Titik pengambilan tidak
        // pakai ongkir sama sekali, jadi database mengabaikannya juga — kita
        // tetap kirim `[]` supaya tidak ada sisa aturan lama yang aktif.
        shipping_discounts:
          editing.kind === "delivery"
            ? normalizeDiscounts(editing.shipping_discounts)
            : [],
      };
      const res = await saveDeliveryZoneAction(payload);
      if (res.ok) {
        toast.success(t.admin.deliveryZones.saved);
        setEditing(null);
        load();
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  function remove(row: AdminDeliveryZone) {
    // Dialog bawaan browser bisa ditutup tanpa umpan balik apa pun, jadi
    // PENJUAL bisa mengira zona sudah terhapus padahal tidak ada RPC yang
    // dipanggil (pola yang sama yang menimbulkan keluhan "menu sudah dihapus
    // tapi masih muncul" di MenuClient).
    setRemoving(row);
  }

  function confirmRemove() {
    if (!removing) return;
    const row = removing;
    setRemoving(null);
    startTransition(async () => {
      const res = await deleteDeliveryZoneAction(row.id);
      if (res.ok) {
        toast.success(t.admin.deliveryZones.deleted);
        load();
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-cocoa-900">
          {kindFilter === "pickup"
            ? t.admin.deliveryZones.pickupTitle
            : kindFilter === "delivery"
              ? t.admin.deliveryZones.deliveryTitle
              : t.admin.deliveryZones.title}
        </h2>
        <p className="mt-1 text-xs text-cocoa-500">
          {kindFilter === "pickup"
            ? t.admin.deliveryZones.pickupSubtitle
            : kindFilter === "delivery"
              ? t.admin.deliveryZones.deliverySubtitle
              : t.admin.deliveryZones.subtitle}
        </p>
      </div>
      <button
        type="button"
        onClick={startNew}
        className="btn-primary shrink-0 !py-1.5 !text-[13px]"
      >
        <Plus className="size-3.5" />
        {kindFilter === "pickup"
          ? t.admin.deliveryZones.pickupNew
          : t.admin.deliveryZones.new}
      </button>
      </div>

      {visibleRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center text-sm text-cocoa-500">
          {t.admin.deliveryZones.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-700">
                {row.kind === "pickup" ? (
                  <Store className="size-4" />
                ) : (
                  <MapPin className="size-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cocoa-900">
                  {lang === "en" ? row.name_en : row.name_id}
                  <span className="ml-2 font-mono text-xs font-normal text-cocoa-500">
                    ({row.id})
                  </span>
                </p>
                <p className="text-xs text-cocoa-500">
                  {row.kind === "pickup"
                    ? t.admin.deliveryZones.pickupRowHint
                    : `${formatIDR(row.fee, lang)} · ${
                        row.lat && row.lng
                          ? `${t.admin.deliveryZones.fixedLabel} (${row.lat.toFixed(4)}, ${row.lng.toFixed(4)})`
                          : t.admin.deliveryZones.addressRequiredLabel
                      }${row.radius_km ? ` · ${row.radius_km} km` : ""}`}
                </p>
                {row.kind === "pickup"
                  ? null
                  : (() => {
                      const tiers = normalizeDiscounts(row.shipping_discounts);
                      if (tiers.length === 0) return null;
                      return (
                        <p className="mt-1 flex items-start gap-1.5 text-xs text-matcha-700">
                          <Tag className="mt-0.5 size-3 shrink-0" />
                          <span className="min-w-0">
                            {tiers
                              .map((d) =>
                                t.admin.deliveryZones.discountTierSummary
                                  .replace("{min}", formatIDR(d.min, lang))
                                  .replace("{pct}", String(d.percent))
                              )
                              .join(" · ")}
                          </span>
                        </p>
                      );
                    })()}
                {row.note_id ? (
                  <p className="mt-1 flex items-start gap-1.5 text-xs text-matcha-700">
                    <Info className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0">{row.note_id}</span>
                  </p>
                ) : null}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                  row.is_active
                    ? "bg-matcha-500/15 text-matcha-700"
                    : "bg-cocoa-100 text-cocoa-500"
                }`}
              >
                {row.is_active
                  ? t.admin.vouchers.statusActive
                  : t.admin.vouchers.statusInactive}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="rounded-md border border-cocoa-200 px-2.5 py-1.5 text-xs font-bold text-cocoa-700 hover:bg-cocoa-50"
                >
                  {t.common.edit}
                </button>
                <button
                  type="button"
                  onClick={() => remove(row)}
                  disabled={pending}
                  className="rounded-md border border-berry-500/30 px-2.5 py-1.5 text-[12px] font-bold text-berry-500 hover:bg-berry-500/10 disabled:opacity-40"
                  aria-label="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <EditZoneModal
          draft={editing}
          setDraft={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
          saving={pending}
          t={t}
          lang={lang}
          kindFilter={kindFilter}
        />
      ) : null}

      <ConfirmDialog
        request={
          removing
            ? {
                title: t.admin.deliveryZones.confirmDelete.replace(
                  "{code}",
                  removing.id
                ),
                body:
                  lang === "en"
                    ? removing.name_en || removing.name_id
                    : removing.name_id || removing.name_en,
              }
            : null
        }
        busy={pending}
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </section>
  );
}

function EditZoneModal({
  draft,
  setDraft,
  onSave,
  onClose,
  saving,
  t,
  lang,
  kindFilter,
}: {
  draft: ZoneDraft;
  setDraft: (d: ZoneDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  t: ReturnType<typeof useI18n>["t"];
  lang: "id" | "en";
  kindFilter?: "delivery" | "pickup";
}) {
  function patch(p: Partial<ZoneDraft>) {
    setDraft({ ...draft, ...p });
  }

  /** Ubah satu field satu tingkat diskon tanpa menyentuh tingkat lain. */
  function patchTier(idx: number, field: keyof ShippingDiscount, value: number) {
    const next = draft.shipping_discounts.map((tier, i) =>
      i === idx ? { ...tier, [field]: value } : tier
    );
    patch({ shipping_discounts: normalizeDiscounts(next) });
  }

  /** Tambah tingkat baru. Minimal belanja default-nya 50.000 di atas tier
   *  terakhir supaya tidak menabruk nilai yang sudah ada. */
  function addTier() {
    const current = draft.shipping_discounts;
    const last = current.length ? current[current.length - 1].min : 0;
    patch({
      shipping_discounts: [
        ...current,
        { min: last + 50000, percent: current.length ? 100 : 50 },
      ],
    });
  }

  function removeTier(idx: number) {
    patch({
      shipping_discounts: draft.shipping_discounts.filter((_, i) => i !== idx),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-cocoa-950/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="border-b border-cocoa-100 px-5 py-4">
          <h2 className="text-base font-bold text-cocoa-800">
            {draft.id ? draft.id : t.admin.deliveryZones.new}
          </h2>
        </header>
        <div className="space-y-3 overflow-y-auto p-5">
          {/* Jenis zona: menentukan sisa form di bawah. Hidden kalau halaman
              ini sudah difilter (tab Ambil di toko / Pengantaran). */}
          {kindFilter ? null : (
            <div>
              <span className="label">{t.admin.deliveryZones.kindLabel}</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["delivery", "pickup"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      patch(
                        k === "pickup"
                          ? { kind: "pickup", fee: 0, requires_address: false }
                          : { kind: "delivery" }
                      )
                    }
                    className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left transition ${
                      draft.kind === k
                        ? "border-matcha-500 bg-matcha-500/10"
                        : "border-cocoa-200 bg-white hover:bg-cream-100"
                    }`}
                  >
                    {k === "pickup" ? (
                      <Store className="mt-0.5 size-4 shrink-0 text-cocoa-600" />
                    ) : (
                      <MapPin className="mt-0.5 size-4 shrink-0 text-cocoa-600" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-cocoa-900">
                        {k === "pickup"
                          ? t.admin.deliveryZones.kindPickup
                          : t.admin.deliveryZones.kindDelivery}
                      </span>
                      <span className="mt-0.5 block text-xs text-cocoa-500">
                        {k === "pickup"
                          ? t.admin.deliveryZones.kindPickupHint
                          : t.admin.deliveryZones.kindDeliveryHint}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="label">{t.admin.deliveryZones.codeLabel}</span>
            <input
              className="input font-mono lowercase"
              value={draft.id}
              onChange={(e) => patch({ id: e.target.value })}
              placeholder={draft.kind === "pickup" ? "pickup-toko" : "antar"}
              maxLength={50}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">{t.admin.deliveryZones.labelId}</span>
              <input
                className="input"
                value={draft.name_id}
                onChange={(e) => patch({ name_id: e.target.value })}
                placeholder="Antar ke alamatmu"
                maxLength={80}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.deliveryZones.labelEn}</span>
              <input
                className="input"
                value={draft.name_en}
                onChange={(e) => patch({ name_en: e.target.value })}
                placeholder="Deliver to your location"
                maxLength={80}
              />
            </label>
          </div>
          {/* Titik pengambilan tidak pakai ongkir dan pembeli tidak perlu
              menandai alamat (mereka datang ke lokasi), jadi kedua field ini
              disembunyikan + dikunci di migration-39. */}
          {draft.kind === "pickup" ? null : (
            <>
              <label className="block">
                <span className="label">{t.admin.deliveryZones.feeLabel}</span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  className="input"
                  value={draft.fee}
                  onChange={(e) => patch({ fee: Number(e.target.value) })}
                />
              </label>

              {/* Potongan ongkir bertingkat. Letak persis di bawah "Delivery
                  fee" sesuai permintaan Steven: begitu belanja mencapai
                  minimal, ongkir dipotong persentase tersebut (100% = gratis
                  ongkir). Berlaku per zona, jadi zona dekat dan zona jauh bisa
                  punya aturan berbeda. */}
              <div className="rounded-xl border border-cocoa-200 bg-cream-50 p-3">
                <p className="text-sm font-bold text-cocoa-800">
                  {t.admin.deliveryZones.discountTitle}
                </p>
                <p className="mt-0.5 text-xs text-cocoa-500">
                  {t.admin.deliveryZones.discountHint}
                </p>

                {draft.shipping_discounts.length === 0 ? (
                  <p className="mt-2 text-xs text-cocoa-400">
                    {t.admin.deliveryZones.discountEmpty}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {draft.shipping_discounts.map((tier, idx) => (
                      <li
                        key={idx}
                        className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-lg bg-white p-2"
                      >
                        <label className="block">
                          <span className="label text-[10px]">
                            {t.admin.deliveryZones.discountMinLabel}
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            className="input"
                            value={tier.min}
                            onChange={(e) =>
                              patchTier(
                                idx,
                                "min",
                                Math.max(0, Number(e.target.value) || 0)
                              )
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="label text-[10px]">
                            {t.admin.deliveryZones.discountPercentLabel}
                          </span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            className="input"
                            value={tier.percent}
                            onChange={(e) =>
                              patchTier(
                                idx,
                                "percent",
                                Math.min(100, Math.max(0, Number(e.target.value) || 0))
                              )
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeTier(idx)}
                          className="mb-1 rounded-md border border-berry-500/30 px-2 py-2 text-[11px] font-bold text-berry-500 hover:bg-berry-500/10"
                          aria-label={t.admin.deliveryZones.discountRemove}
                          title={t.admin.deliveryZones.discountRemove}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={addTier}
                  className="mt-2 flex items-center gap-1.5 rounded-md border border-cocoa-300 px-2.5 py-1.5 text-[12px] font-bold text-cocoa-700 hover:bg-white"
                >
                  <Plus className="size-3.5" />
                  {t.admin.deliveryZones.discountAdd}
                </button>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-cream-100 p-3">
                <input
                  type="checkbox"
                  checked={!draft.requires_address}
                  onChange={(e) =>
                    patch({ requires_address: !e.target.checked })
                  }
                  className="mt-0.5 size-4 rounded border-cocoa-300"
                />
                <span className="text-xs">
                  <span className="font-bold text-cocoa-700">
                    {t.admin.deliveryZones.fixedLabel}
                  </span>
                  <span className="mt-0.5 block text-cocoa-500">
                    {t.admin.deliveryZones.fixedHint}
                  </span>
                </span>
              </label>
            </>
          )}

          {/* Catatan pembeli — dipakai untuk jam ambil pada titik pengambilan.
              Ini yang Steven minta: "...ada catatan juga jadi tau ambil jam
              berapa". */}
          <label className="block">
            <span className="label">{t.admin.deliveryZones.noteLabelId}</span>
            <textarea
              className="input min-h-[4.5rem]"
              value={draft.note_id}
              onChange={(e) => patch({ note_id: e.target.value })}
              placeholder={
                draft.kind === "pickup"
                  ? "mis. Ambil setiap hari 10.00 - 20.00 WIB"
                  : "mis. Pengiriman tiap hari kerja"
              }
              maxLength={240}
            />
            <span className="mt-1 block text-xs text-cocoa-400">
              {t.admin.deliveryZones.noteHint}
            </span>
          </label>
          <label className="block">
            <span className="label">{t.admin.deliveryZones.noteLabelEn}</span>
            <textarea
              className="input min-h-[4.5rem]"
              value={draft.note_en}
              onChange={(e) => patch({ note_en: e.target.value })}
              placeholder="e.g. Pick up daily 10:00 - 20:00 WIB"
              maxLength={240}
            />
          </label>

          {/* Peta dihapus 12-10-2026 (permintaan Steven). Koordinat & radius
              milik zona TIDAK dihapus dari database maupun dari draft, cuma
              tidak bisa diedit lewat UI lagi. `onSave` tetap mengirim nilai
              lama itu apa adanya, jadi `admin_upsert_zone` tidak mengosongkan
              kolomnya (RPC memakai `lat = excluded.lat`). */}

          <label className="block">
            <span className="label">
              {t.admin.deliveryZones.sortOrderLabel}
            </span>
            <input
              type="number"
              className="input"
              value={draft.sort_order}
              onChange={(e) => patch({ sort_order: Number(e.target.value) })}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={draft.is_active}
              onChange={(e) => patch({ is_active: e.target.checked })}
              className="size-4 rounded border-cocoa-300"
            />
            <span className="text-sm font-bold text-cocoa-700">
              {t.admin.vouchers.activeLabel}
            </span>
          </label>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-cocoa-100 bg-cream-50/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-ghost !text-[13px]"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary !text-[13px]"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {t.common.save}
          </button>
        </footer>
        {/* unused suppress */}
        <span className="hidden">{lang}</span>
      </div>
    </div>
  );
}