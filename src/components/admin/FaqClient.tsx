"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { HelpCircle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminFaqItem } from "@/app/admin/actions";
import {
  deleteFaqAction,
  listFaqAction,
  saveFaqAction,
} from "@/app/admin/actions";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Kelola isi FAQ toko.
 *
 * Isi ini dibaca dua halaman pembeli sekaligus — `/faq` dan section FAQ di
 * `/contact` — jadi mengedit di sini langsung mengubah keduanya tanpa deploy.
 * Sumber datanya tabel `faq_items` lewat RPC `admin_*` (migration-46), bukan
 * select langsung, jadi aturan "hanya admin" ditegakkan di database.
 */

type Draft = Omit<AdminFaqItem, "id"> & { id: number | null };

const EMPTY: Draft = {
  id: null,
  question_id: "",
  question_en: "",
  answer_id: "",
  answer_en: "",
  sort_order: 10,
  is_active: true,
};

export function FaqClient({ initialItems }: { initialItems: AdminFaqItem[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<AdminFaqItem[]>(initialItems);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminFaqItem | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listFaqAction();
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
    // Pertahankan urutan di bawah bar terakhir supaya pertanyaan baru tidak
    // menduduki posisi pertama secara tidak sengaja.
    const last = items.length ? items[items.length - 1].sort_order : 0;
    setDraft({ ...EMPTY, sort_order: last + 10 });
  }

  function startEdit(item: AdminFaqItem) {
    setDraft({ ...item });
  }

  function save() {
    if (!draft) return;
    if (!draft.question_id.trim() && !draft.question_en.trim()) {
      toast.error(t.admin.faq.errorQuestionRequired);
      return;
    }
    setSaving(true);
    startTransition(async () => {
      const res = await saveFaqAction({
        id: draft.id,
        question_id: draft.question_id,
        question_en: draft.question_en,
        answer_id: draft.answer_id,
        answer_en: draft.answer_en,
        sort_order: draft.sort_order,
        is_active: draft.is_active,
      });
      setSaving(false);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      toast.success(t.admin.faq.saved);
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
      const res = await deleteFaqAction(target.id);
      setSaving(false);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      toast.success(t.admin.faq.deleted);
      setItems((prev) => prev.filter((x) => x.id !== target.id));
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-cocoa-900">{t.admin.faq.title}</h2>
          <p className="mt-1 text-xs text-cocoa-500">{t.admin.faq.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="btn-primary shrink-0 !py-1.5 !text-[13px]"
        >
          <Plus className="size-3.5" />
          {t.admin.faq.new}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center text-sm text-cocoa-500">
          {t.admin.faq.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-700">
                <HelpCircle className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cocoa-900">
                  {item.question_id || item.question_en}
                </p>
                <p className="mt-0.5 line-clamp-2 text-xs text-cocoa-500">
                  {item.answer_id || item.answer_en}
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
          title={draft.id ? t.common.edit : t.admin.faq.new}
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
              <span className="label">{t.admin.faq.questionIdLabel}</span>
              <input
                className="input"
                value={draft.question_id}
                onChange={(e) => patch({ question_id: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.faq.questionEnLabel}</span>
              <input
                className="input"
                value={draft.question_en}
                onChange={(e) => patch({ question_en: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.faq.answerIdLabel}</span>
              <textarea
                className="input min-h-[6rem]"
                value={draft.answer_id}
                onChange={(e) => patch({ answer_id: e.target.value })}
                maxLength={2000}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.faq.answerEnLabel}</span>
              <textarea
                className="input min-h-[6rem]"
                value={draft.answer_en}
                onChange={(e) => patch({ answer_en: e.target.value })}
                maxLength={2000}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.faq.sortOrderLabel}</span>
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
                {t.admin.faq.activeLabel}
              </span>
            </label>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        request={
          removing
            ? {
                title: t.admin.faq.confirmDelete,
                body: removing.question_id || removing.question_en,
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