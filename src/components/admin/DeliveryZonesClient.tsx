"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Loader2,
  MapPin,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type { AdminDeliveryZone } from "@/app/admin/actions";
import {
  deleteDeliveryZoneAction,
  getDeliveryZonesAction,
  saveDeliveryZoneAction,
} from "@/app/admin/actions";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { formatIDR } from "@/lib/utils";

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
};

export function DeliveryZonesClient() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<AdminDeliveryZone[]>([]);
  const [editing, setEditing] = useState<ZoneDraft | null>(null);
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
    setEditing({ ...EMPTY });
  }

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
    if (
      !confirm(
        t.admin.deliveryZones.confirmDelete.replace("{code}", row.id)
      )
    ) {
      return;
    }
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
            {t.admin.deliveryZones.title}
          </h2>
          <p className="mt-1 text-xs text-cocoa-500">
            {t.admin.deliveryZones.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="btn-primary shrink-0 !py-1.5 !text-[13px]"
        >
          <Plus className="size-3.5" />
          {t.admin.deliveryZones.new}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center text-sm text-cocoa-500">
          {t.admin.deliveryZones.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-700">
                <MapPin className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cocoa-900">
                  {lang === "en" ? row.name_en : row.name_id}
                  <span className="ml-2 font-mono text-xs font-normal text-cocoa-500">
                    ({row.id})
                  </span>
                </p>
                <p className="text-xs text-cocoa-500">
                  {formatIDR(row.fee, lang)} ·{" "}
                  {row.lat && row.lng
                    ? `${t.admin.deliveryZones.fixedLabel} (${row.lat.toFixed(4)}, ${row.lng.toFixed(4)})`
                    : t.admin.deliveryZones.addressRequiredLabel}
                  {row.radius_km ? ` · ${row.radius_km} km` : ""}
                </p>
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
        />
      ) : null}
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
}: {
  draft: ZoneDraft;
  setDraft: (d: ZoneDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  t: ReturnType<typeof useI18n>["t"];
  lang: "id" | "en";
}) {
  function patch(p: Partial<ZoneDraft>) {
    setDraft({ ...draft, ...p });
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
          <label className="block">
            <span className="label">{t.admin.deliveryZones.codeLabel}</span>
            <input
              className="input font-mono lowercase"
              value={draft.id}
              onChange={(e) => patch({ id: e.target.value })}
              placeholder="antar"
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

          {draft.lat || draft.lng || !draft.requires_address ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="label">{t.admin.deliveryZones.latLabel}</span>
                <input
                  className="input font-mono"
                  value={draft.lat}
                  onChange={(e) => patch({ lat: e.target.value })}
                  placeholder="-6.917"
                />
              </label>
              <label className="block">
                <span className="label">{t.admin.deliveryZones.lngLabel}</span>
                <input
                  className="input font-mono"
                  value={draft.lng}
                  onChange={(e) => patch({ lng: e.target.value })}
                  placeholder="107.619"
                />
              </label>
              <label className="block">
                <span className="label">
                  {t.admin.deliveryZones.radiusLabel}
                </span>
                <input
                  className="input font-mono"
                  value={draft.radius_km}
                  onChange={(e) => patch({ radius_km: e.target.value })}
                  placeholder="0.5"
                />
              </label>
            </div>
          ) : null}

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