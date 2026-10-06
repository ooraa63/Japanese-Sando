"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Loader2,
  Plus,
  Save,
  Search,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import type { VoucherType } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  deleteVoucherAction,
  getVouchersAction,
  saveVoucherAction,
} from "@/app/admin/actions";
import { Modal } from "@/components/ui/Modal";
import { formatDate } from "@/lib/utils";

interface VoucherRow {
  id: number;
  code: string;
  customer_id: string | null;
  type: VoucherType;
  value: Record<string, unknown>;
  label_id: string;
  label_en: string;
  expires_at: string | null;
  is_active: boolean;
  used_at: string | null;
  order_id: number | null;
  created_at: string;
}

interface VoucherDraft {
  id: number | null;
  code: string;
  customer_id: string;
  type: VoucherType;
  value: Record<string, number | string | unknown>;
  label_id: string;
  label_en: string;
  expires_at: string;
  is_active: boolean;
}

const EMPTY_DRAFT: VoucherDraft = {
  id: null,
  code: "",
  customer_id: "",
  type: "percent",
  value: { percent: 10 },
  label_id: "",
  label_en: "",
  expires_at: "",
  is_active: true,
};

function describe(
  type: VoucherType,
  value: Record<string, unknown>,
  lang: "id" | "en"
) {
  if (type === "percent") {
    return lang === "en" ? `${value.percent ?? 0}% off` : `Diskon ${value.percent ?? 0}%`;
  }
  if (type === "amount") {
    const n = Number(value.amount ?? 0).toLocaleString(lang === "en" ? "en-US" : "id-ID");
    return lang === "en" ? `Rp ${n} off` : `Potongan Rp ${n}`;
  }
  if (type === "free_shipping") {
    return lang === "en" ? "Free shipping" : "Gratis ongkir";
  }
  return lang === "en" ? "Free 1 item" : "Gratis 1 item";
}

export function VouchersClient() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<VoucherRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<VoucherDraft | null>(null);
  const [pending, startTransition] = useTransition();

  const loadVouchers = useCallback(
    (q: string) => {
      startTransition(async () => {
        const res = await getVouchersAction({ search: q, limit: 100, offset: 0 });
        if (res.ok && res.data) {
          setRows(res.data.vouchers);
          setTotal(res.data.total);
        } else {
          toast.error(t.errors.generic);
        }
      });
    },
    [t, toast]
  );

  useEffect(() => {
    loadVouchers("");
  }, [loadVouchers]);

  useEffect(() => {
    const handle = setTimeout(() => loadVouchers(search), 250);
    return () => clearTimeout(handle);
  }, [search, loadVouchers]);

  function startNew() {
    setEditing({ ...EMPTY_DRAFT });
  }

  function startEdit(row: VoucherRow) {
    setEditing({
      id: row.id,
      code: row.code,
      customer_id: row.customer_id ?? "",
      type: row.type,
      value: { ...row.value },
      label_id: row.label_id,
      label_en: row.label_en,
      expires_at: row.expires_at ? row.expires_at.slice(0, 10) : "",
      is_active: row.is_active,
    });
  }

  function save() {
    if (!editing) return;
    if (!editing.code.trim()) {
      toast.error(t.admin.vouchers.errorCodeRequired);
      return;
    }
    if (!editing.label_id.trim() || !editing.label_en.trim()) {
      toast.error(t.admin.vouchers.errorLabelRequired);
      return;
    }
    startTransition(async () => {
      const payload: Record<string, unknown> = {
        id: editing.id,
        code: editing.code.trim().toUpperCase(),
        customer_id: editing.customer_id.trim() || null,
        type: editing.type,
        value: editing.value,
        label_id: editing.label_id.trim(),
        label_en: editing.label_en.trim(),
        expires_at: editing.expires_at || null,
        is_active: editing.is_active,
      };
      const res = await saveVoucherAction(payload);
      if (res.ok) {
        toast.success(t.admin.vouchers.saved);
        setEditing(null);
        loadVouchers(search);
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  function remove(row: VoucherRow) {
    if (!confirm(t.admin.vouchers.confirmDelete.replace("{code}", row.code))) {
      return;
    }
    startTransition(async () => {
      const res = await deleteVoucherAction(row.id);
      if (res.ok) {
        toast.success(t.admin.vouchers.deleted);
        loadVouchers(search);
      } else {
        toast.error(t.errors.generic);
      }
    });
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.vouchers.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">
            {t.admin.vouchers.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="btn-primary shrink-0"
        >
          <Plus className="size-4" />
          {t.admin.vouchers.new}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.admin.vouchers.searchPlaceholder}
          className="input pl-9"
        />
      </div>

      {pending && rows.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-cocoa-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-8 text-center text-sm text-cocoa-500">
          {t.admin.vouchers.empty}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50">
          <ul className="divide-y divide-cocoa-200">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-matcha-100 text-matcha-700">
                  <Ticket className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-extrabold text-cocoa-900">
                    {row.code}
                  </p>
                  <p className="text-xs text-cocoa-500">
                    {describe(row.type, row.value, lang)} ·{" "}
                    {lang === "en" ? row.label_en : row.label_id}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-cocoa-500">
                  {row.expires_at ? (
                    <span>
                      {t.admin.vouchers.expiresLabel.replace(
                        "{date}",
                        formatDate(row.expires_at, lang)
                      )}
                    </span>
                  ) : null}
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
                  <span className="text-cocoa-400">
                    {total > 0 ? `${rows.length}/${total}` : ""}
                  </span>
                </div>
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
                    className="rounded-md border border-berry-500/30 px-2.5 py-1.5 text-xs font-bold text-berry-500 hover:bg-berry-500/10 disabled:opacity-40"
                    aria-label="Delete"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing ? (
        <VoucherEditModal
          draft={editing}
          setDraft={setEditing}
          onSave={save}
          onClose={() => setEditing(null)}
          saving={pending}
          t={t}
        />
      ) : null}
    </div>
  );
}

function VoucherEditModal({
  draft,
  setDraft,
  onSave,
  onClose,
  saving,
  t,
}: {
  draft: VoucherDraft;
  setDraft: (d: VoucherDraft) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  function patch(p: Partial<VoucherDraft>) {
    setDraft({ ...draft, ...p });
  }
  function setType(type: VoucherType) {
    let value: Record<string, number | string | unknown> = {};
    if (type === "percent") value = { percent: 10 };
    else if (type === "amount") value = { amount: 5000 };
    setDraft({ ...draft, type, value });
  }
  return (
    <Modal open onClose={onClose} title={draft.id ? t.admin.vouchers.edit : t.admin.vouchers.new}>
      <div className="space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="label">{t.admin.vouchers.codeLabel}</span>
            <input
              className="input font-mono uppercase tracking-wider"
              value={draft.code}
              onChange={(e) => patch({ code: e.target.value.toUpperCase() })}
              placeholder="WELCOME15"
              maxLength={32}
            />
          </label>
          <label className="block">
            <span className="label">{t.admin.vouchers.labelId}</span>
            <input
              className="input"
              value={draft.label_id}
              onChange={(e) => patch({ label_id: e.target.value })}
              placeholder="Diskon 15% untuk semua rasa"
              maxLength={120}
            />
          </label>
          <label className="block">
            <span className="label">{t.admin.vouchers.labelEn}</span>
            <input
              className="input"
              value={draft.label_en}
              onChange={(e) => patch({ label_en: e.target.value })}
              placeholder="15% off any flavor"
              maxLength={120}
            />
          </label>
          <label className="block">
            <span className="label">{t.admin.vouchers.typeLabel}</span>
            <select
              className="input"
              value={draft.type}
              onChange={(e) => setType(e.target.value as VoucherType)}
            >
              <option value="percent">{t.admin.vouchers.typePercent}</option>
              <option value="amount">{t.admin.vouchers.typeAmount}</option>
              <option value="free_shipping">
                {t.admin.vouchers.typeFreeShipping}
              </option>
              <option value="free_item">{t.admin.vouchers.typeFreeItem}</option>
            </select>
          </label>
          <label className="block">
            <span className="label">{t.admin.vouchers.expiresLabel.replace("{date}", "")}</span>
            <input
              type="date"
              className="input"
              value={draft.expires_at}
              onChange={(e) => patch({ expires_at: e.target.value })}
            />
          </label>

          {draft.type === "percent" ? (
            <label className="block sm:col-span-2">
              <span className="label">{t.admin.vouchers.percentValue}</span>
              <input
                type="number"
                min={1}
                max={100}
                className="input"
                value={String(draft.value.percent ?? "")}
                onChange={(e) =>
                  patch({ value: { percent: Number(e.target.value) } })
                }
              />
            </label>
          ) : null}
          {draft.type === "amount" ? (
            <label className="block sm:col-span-2">
              <span className="label">{t.admin.vouchers.amountValue}</span>
              <input
                type="number"
                min={0}
                step={500}
                className="input"
                value={String(draft.value.amount ?? "")}
                onChange={(e) =>
                  patch({ value: { amount: Number(e.target.value) } })
                }
              />
            </label>
          ) : null}

          <label className="flex cursor-pointer items-center gap-2 sm:col-span-2">
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

        <div className="flex items-center justify-end gap-2 border-t border-cocoa-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            disabled={saving}
          >
            <X className="size-4" />
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {t.common.save}
          </button>
        </div>
      </div>
    </Modal>
  );
}