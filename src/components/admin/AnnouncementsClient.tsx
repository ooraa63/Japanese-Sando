"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ImageIcon, Loader2, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import type { AdminAnnouncement } from "@/app/admin/actions";
import {
  deleteAnnouncementAction,
  listAnnouncementsAction,
  saveAnnouncementAction,
} from "@/app/admin/actions";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * Kelola pengumuman / promo yang muncul di lonceng notifikasi pembeli.
 *
 * Steven 14-10-2026: "di admin bisa set pemberitahuan, seperti mungkin ada
 * promo atau apa langsung muncul untuk semua".
 *
 * Tabel `announcements` + RPC `admin_*`-nya sudah ada sejak migration-13 tapi
 * belum pernah dipakai — halaman ini yang pertama kali mengelolanya, jadi
 * sumber datanya lewat RPC (bukan select langsung) supaya aturan "hanya admin"
 * ditegakkan di database.
 */

type Draft = Omit<AdminAnnouncement, "id" | "created_at"> & { id: number | null };

const EMPTY: Draft = {
  id: null,
  title: "",
  body_md: "",
  image_url: null,
  cta_label: null,
  cta_href: null,
  is_active: true,
  sort_order: 0,
};

export function AnnouncementsClient({
  initialItems,
}: {
  initialItems: AdminAnnouncement[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<AdminAnnouncement[]>(initialItems);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminAnnouncement | null>(null);

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listAnnouncementsAction();
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
    // Simpan di bawah bar terakhir supaya pengumuman baru tidak menduduki
    // posisi teratas secara tidak sengaja.
    const last = items.length ? items[items.length - 1].sort_order : 0;
    setDraft({ ...EMPTY, sort_order: last + 10 });
  }

  function startEdit(item: AdminAnnouncement) {
    setDraft({
      id: item.id,
      title: item.title,
      body_md: item.body_md,
      image_url: item.image_url,
      cta_label: item.cta_label,
      cta_href: item.cta_href,
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
  }

  function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error(t.admin.announcements.errorTitleRequired);
      return;
    }
    setSaving(true);
    startTransition(async () => {
      const res = await saveAnnouncementAction({
        id: draft.id,
        title: draft.title.trim(),
        body_md: draft.body_md,
        // RPC menyimpan string kosong jadi NULL, tapi kirim null dari sini
        // supaya pilihan "opsional" beneran berarti tidak ada.
        image_url: draft.image_url?.trim() || null,
        cta_label: draft.cta_label?.trim() || null,
        cta_href: draft.cta_href?.trim() || null,
        is_active: draft.is_active,
        sort_order: draft.sort_order,
      });
      setSaving(false);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      toast.success(t.admin.announcements.saved);
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
      const res = await deleteAnnouncementAction(target.id);
      setSaving(false);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      toast.success(t.admin.announcements.deleted);
      setItems((prev) => prev.filter((x) => x.id !== target.id));
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-cocoa-900">
            {t.admin.announcements.title}
          </h2>
          <p className="mt-1 text-xs text-cocoa-500">
            {t.admin.announcements.subtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="btn-primary shrink-0 !py-1.5 !text-[13px]"
        >
          <Plus className="size-3.5" />
          {t.admin.announcements.new}
        </button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-cocoa-200 bg-cream-50 p-6 text-center text-sm text-cocoa-500">
          {t.admin.announcements.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start gap-3 rounded-2xl border border-cocoa-200 bg-cream-50 p-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-700">
                <Megaphone className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-cocoa-900">{item.title}</p>
                {item.body_md ? (
                  <p className="mt-0.5 line-clamp-2 text-xs text-cocoa-500">
                    {item.body_md}
                  </p>
                ) : null}
                {item.cta_href ? (
                  <p className="mt-1 truncate text-[11px] text-cocoa-400">
                    {item.cta_label || t.admin.announcements.ctaLabelLabel}:{" "}
                    {item.cta_href}
                  </p>
                ) : null}
                {item.image_url ? (
                  <p className="mt-1 truncate text-[11px] text-cocoa-400">
                    <ImageIcon className="mr-1 inline size-3" />
                    {item.image_url}
                  </p>
                ) : null}
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
          title={draft.id ? t.common.edit : t.admin.announcements.new}
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
              <span className="label">{t.admin.announcements.titleLabel}</span>
              <input
                className="input"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="label">{t.admin.announcements.bodyLabel}</span>
              <textarea
                className="input min-h-[6rem]"
                value={draft.body_md}
                onChange={(e) => patch({ body_md: e.target.value })}
                maxLength={2000}
              />
            </label>
            <label className="block">
              <span className="label">
                {t.admin.announcements.imageLabel} (
                {t.admin.announcements.optional})
              </span>
              <input
                className="input"
                value={draft.image_url ?? ""}
                onChange={(e) => patch({ image_url: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">
                {t.admin.announcements.ctaLabelLabel} (
                {t.admin.announcements.optional})
              </span>
              <input
                className="input"
                value={draft.cta_label ?? ""}
                onChange={(e) => patch({ cta_label: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">
                {t.admin.announcements.ctaHrefLabel} (
                {t.admin.announcements.optional})
              </span>
              <input
                className="input"
                value={draft.cta_href ?? ""}
                onChange={(e) => patch({ cta_href: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="label">
                {t.admin.announcements.sortOrderLabel}
              </span>
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
                {t.admin.announcements.activeLabel}
              </span>
            </label>
          </div>
        </Modal>
      ) : null}

      <ConfirmDialog
        request={
          removing
            ? {
                title: t.admin.announcements.confirmDelete,
                body: removing.title,
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