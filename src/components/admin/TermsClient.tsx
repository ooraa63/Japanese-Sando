"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FileText, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminTermItem } from "@/app/admin/actions";
import {
  deleteTermsAction,
  listTermsAction,
  saveTermsAction,
} from "@/app/admin/actions";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Kelola isi Syarat & Ketentuan yang tampil di halaman /syarat-ketentuan.
 *
 * Strukturnya sama persis dengan `FaqClient` — satu modal untuk tambah/ubah,
 * satu dialog konfirmasi untuk hapus — karena keduanya dibaca dari tabel yang
 * dikelola lewat RPC `admin_*` (migration-46 dan migration-47), bukan select
 * langsung. Jadi aturan "hanya admin" ditegakkan di database, bukan hanya
 * disembunyikan di UI.
 */

type Draft = Omit<AdminTermItem, "id"> & { id: number | null };

const EMPTY: Draft = {
  id: null,
  title_id: "",
  title_en: "",
  body_id: "",
  body_en: "",
  sort_order: 10,
  is_active: true,
};

export function TermsClient({ initialItems }: { initialItems: AdminTermItem[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<AdminTermItem[]>(initialItems);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminTermItem | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listTermsAction();
      if (res.ok && res.data) setItems(res.data);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patch(next: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function startNew() {
    // Pertahankan urutan di bawah bagian terakhir supaya bagian baru tidak
    // menduduki posisi pertama secara tidak sengaja.
    const last = items.length ? items[items.length - 1].sort_order : 0;
    setDraft({ ...EMPTY, sort_order: last + 10 });
  }

  function startEdit(item: AdminTermItem) {
    setDraft({ ...item });
  }

  function save() {
    if (!draft) return;
    if (!draft.title_id.trim() && !draft.title_en.trim()) {
      toast.error(t.admin.terms.errorTitleRequired);
      return;
    }
    setSaving(true);
    startTransition(async () => {
      const res = await saveTermsAction({
        id: draft.id,
        title_id: draft.title_id,
        title_en: draft.title_en,
        body_id: draft.body_id,
        body_en: draft.body_en,
        sort_order: draft.sort_order,
        is_active: draft.is_active,
      });
      setSaving(false);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      toast.success(t.admin.terms.saved);
      setDraft(null);
      // Muat ulang dari server supaya urutannya benar-benar sama dengan
      // database (perkiraan optimistic rawan meleset soal sort_order).
      load();
    });
  }

  function remove() {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    setSaving(true);
    startTransition(async () => {
      const res = await deleteTermsAction(target.id);
      setSaving(false);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      toast.success(t.admin.terms.deleted);
      setItems((prev) => prev.filter((x) => x.id !== target.id));
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-cocoa-900">
            {t.admin.terms.title}
          </h2>
          <p className="mt-1 text-xs text-cocoa-500">{t.admin.terms.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="btn-primary shrink-0 !py-1.5 !text-[13px]"
        >
          <Plus className="size-3.5" />
          {t.admin.terms.new}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center text-sm text-cocoa-500">
          {t.admin.terms.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-700">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cocoa-900">
                  {item.title_id || item.title_en}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-cocoa-500">
                  {item.body_id || item.body_en}
                </p>
                <p className="mt-1 text-[11px] text-cocoa-400">
                  #{item.sort_order}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${
                  item.is_active
                    ? "bg-matcha-500/15 text-matcha-700"
                    : "bg-cocoa-100 text-cocoa-500"
                }`}
              >
                {item.is_active
                  ? t.admin.vouchers.statusActive
                  : t.admin.vouchers.statusInactive}
              </span>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => startEdit(item)}
                  className="rounded-md border border-cocoa-200 px-2.5 py-1.5 text-xs font-bold text-cocoa-700 hover:bg-cocoa-50"
                >
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setRemoving(item)}
                  disabled={pending}
                  className="rounded-md border border-berry-500/30 px-2.5 py-1.5 text-[12px] font-bold text-berry-500 hover:bg-berry-500/10 disabled:opacity-40"
                  aria-label={t.common.delete}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <Modal
          open
          title={draft.id ? t.common.edit : t.admin.terms.new}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDraft(null)}
                disabled={saving}
                className="btn-ghost !text-[13px]"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-primary !py-2 !text-[13px]"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                {saving ? t.common.saving : t.common.save}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <label className="block">
              <span className="label">{t.admin.terms.titleIdLabel}</span>
              <input
                className="input"
                value={draft.title_id}
                onChange={(e) => patch({ title_id: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.terms.titleEnLabel}</span>
              <input
                className="input"
                value={draft.title_en}
                onChange={(e) => patch({ title_en: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.terms.bodyIdLabel}</span>
              <textarea
                className="input min-h-[9rem]"
                value={draft.body_id}
                onChange={(e) => patch({ body_id: e.target.value })}
                maxLength={4000}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.terms.bodyEnLabel}</span>
              <textarea
                className="input min-h-[9rem]"
                value={draft.body_en}
                onChange={(e) => patch({ body_en: e.target.value })}
                maxLength={4000}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.terms.sortOrderLabel}</span>
              <input
                type="number"
                className="input"
                value={draft.sort_order}
                onChange={(e) =>
                  patch({ sort_order: Number(e.target.value) || 0 })
                }
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
                {t.admin.terms.activeLabel}
              </span>
            </label>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        request={
          removing
            ? {
                title: t.admin.terms.confirmDelete,
                body: removing.title_id || removing.title_en,
              }
            : null
        }
        busy={saving}
        onCancel={() => setRemoving(null)}
        onConfirm={remove}
      />
    </section>
  );
}