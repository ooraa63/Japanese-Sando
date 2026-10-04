"use client";

import { useState } from "react";
import { Loader2, Megaphone, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/lib/i18n";
import { formatDateTime } from "@/lib/utils";
import type { AdminAnnouncement } from "@/app/admin/actions";
import {
  deleteAnnouncementAction,
  saveAnnouncementAction,
} from "@/app/admin/actions";

/**
 * Halaman admin: Popup Announcement — daftar popup yang ditampilkan di
 * homepage pembeli. Tambah/edit/hapus. Tiap popup punya judul, body,
 * foto (opsional), CTA (opsional), status aktif/nonaktif.
 */
export function AnnouncementsClient({
  initial,
  labels,
}: {
  initial: AdminAnnouncement[];
  labels: {
    title: string;
    subtitle: string;
    add: string;
    edit: string;
    empty: string;
    name: string;
    nameHint: string;
    body: string;
    bodyHint: string;
    image: string;
    imageHint: string;
    ctaLabel: string;
    ctaHref: string;
    sortOrder: string;
    active: string;
    saved: string;
    deleted: string;
    confirmDelete: string;
    status: string;
    activeLabel: string;
    inactiveLabel: string;
    preview: string;
  };
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [items, setItems] = useState<AdminAnnouncement[]>(initial);
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving] = useState(false);

  function openNew() {
    setEditing({
      id: 0,
      title: "",
      body_md: "",
      image_url: null,
      cta_label: null,
      cta_href: null,
      is_active: true,
      sort_order: items.length + 1,
      created_at: "",
    });
  }

  async function toggleActive(a: AdminAnnouncement) {
    setBusyId(a.id);
    const res = await saveAnnouncementAction({
      id: a.id,
      title: a.title,
      body_md: a.body_md,
      image_url: a.image_url ?? "",
      cta_label: a.cta_label ?? "",
      cta_href: a.cta_href ?? "",
      is_active: !a.is_active,
      sort_order: a.sort_order,
    });
    setBusyId(null);
    if (res.ok) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === a.id ? { ...x, is_active: !x.is_active } : x
        )
      );
    } else {
      toast.error(t.errors.generic);
    }
  }

  async function remove(a: AdminAnnouncement) {
    if (!window.confirm(labels.confirmDelete)) return;
    setBusyId(a.id);
    const res = await deleteAnnouncementAction(a.id);
    setBusyId(null);
    if (res.ok) {
      setItems((prev) => prev.filter((x) => x.id !== a.id));
      toast.success(labels.deleted);
    } else {
      toast.error(t.errors.generic);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {labels.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{labels.subtitle}</p>
        </div>
        <button type="button" onClick={openNew} className="btn-primary shrink-0">
          <Plus className="size-4" />
          {labels.add}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card p-14 text-center">
          <Megaphone className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">{labels.empty}</p>
          <button type="button" onClick={openNew} className="btn-primary mt-5">
            <Plus className="size-4" />
            {labels.add}
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <li key={a.id} className="card overflow-hidden">
              {a.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={a.image_url}
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[16/9] items-center justify-center bg-gradient-to-br from-honey-300 to-berry-500 text-white">
                  <Megaphone className="size-12 opacity-70" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-1 font-display text-base font-bold text-cocoa-900">
                    {a.title}
                  </h3>
                  <span
                    className={`shrink-0 chip ${
                      a.is_active
                        ? "bg-matcha-100 text-matcha-700"
                        : "bg-cocoa-100 text-cocoa-500"
                    }`}
                  >
                    {a.is_active ? labels.activeLabel : labels.inactiveLabel}
                  </span>
                </div>
                {a.body_md ? (
                  <p className="mt-1 line-clamp-2 text-[12px] text-cocoa-600">
                    {a.body_md}
                  </p>
                ) : null}
                <p className="mt-2 text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {labels.sortOrder}: {a.sort_order} · {a.created_at ? formatDateTime(a.created_at, "id") : "—"}
                </p>
                <div className="mt-3 flex items-center gap-1 border-t border-cocoa-100 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditing(a)}
                    disabled={busyId === a.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100 disabled:opacity-40"
                  >
                    <Pencil className="size-3.5" />
                    {t.common.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(a)}
                    disabled={busyId === a.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100 disabled:opacity-40"
                  >
                    {busyId === a.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : a.is_active ? (
                      <span className="size-3.5 rounded-full bg-matcha-500" />
                    ) : (
                      <span className="size-3.5 rounded-full bg-cocoa-300" />
                    )}
                    {labels.status}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(a)}
                    disabled={busyId === a.id}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-berry-500 transition hover:bg-berry-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                    {t.common.delete}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AnnouncementForm
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setItems((prev) => {
              const i = prev.findIndex((x) => x.id === saved.id);
              if (i === -1) return [...prev, saved];
              const next = prev.slice();
              next[i] = saved;
              return next;
            });
            toast.success(labels.saved);
            setEditing(null);
          }}
          labels={labels}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function AnnouncementForm({
  value,
  onClose,
  onSaved,
  labels,
  saving,
}: {
  value: AdminAnnouncement;
  onClose: () => void;
  onSaved: (a: AdminAnnouncement) => void;
  labels: {
    name: string;
    nameHint: string;
    body: string;
    bodyHint: string;
    image: string;
    imageHint: string;
    ctaLabel: string;
    ctaHref: string;
    sortOrder: string;
    active: string;
  };
  saving: boolean;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(value.title);
  const [body, setBody] = useState(value.body_md);
  const [image, setImage] = useState(value.image_url ?? "");
  const [ctaLabel, setCtaLabel] = useState(value.cta_label ?? "");
  const [ctaHref, setCtaHref] = useState(value.cta_href ?? "");
  const [sortOrder, setSortOrder] = useState(String(value.sort_order));
  const [isActive, setIsActive] = useState(value.is_active);

  function save() {
    if (title.trim().length < 2) {
      toast.warning(labels.name);
      return;
    }
    void (async () => {
      const res = await saveAnnouncementAction({
        id: value.id || null,
        title: title.trim(),
        body_md: body,
        image_url: image.trim(),
        cta_label: ctaLabel.trim(),
        cta_href: ctaHref.trim(),
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      });
      if (res.ok) {
        onSaved({
          ...value,
          title: title.trim(),
          body_md: body,
          image_url: image.trim() || null,
          cta_label: ctaLabel.trim() || null,
          cta_href: ctaHref.trim() || null,
          sort_order: Number(sortOrder) || 0,
          is_active: isActive,
        });
      } else {
        toast.error(res.error ?? "unknown");
      }
    })();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={value.id ? "Edit popup" : "Tambah popup"}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-ghost" disabled={saving}>
            Batal
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Simpan
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">{labels.name}</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Promo akhir bulan!"
          />
          <p className="mt-1 text-[11px] text-cocoa-400">{labels.nameHint}</p>
        </div>

        <div>
          <label className="label">{labels.body}</label>
          <textarea
            rows={3}
            className="input resize-none"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Dapatkan diskon 20% untuk semua rasa sando."
          />
          <p className="mt-1 text-[11px] text-cocoa-400">{labels.bodyHint}</p>
        </div>

        <div>
          <label className="label">{labels.image}</label>
          <input
            type="url"
            className="input"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="https://..."
          />
          <p className="mt-1 text-[11px] text-cocoa-400">{labels.imageHint}</p>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="mt-2 max-h-32 rounded-xl border border-cocoa-200 object-cover"
            />
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{labels.ctaLabel}</label>
            <input
              className="input"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder="Lihat promo"
            />
          </div>
          <div>
            <label className="label">{labels.ctaHref}</label>
            <input
              type="url"
              className="input"
              value={ctaHref}
              onChange={(e) => setCtaHref(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">{labels.sortOrder}</label>
            <input
              type="number"
              className="input tabular"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 self-end rounded-xl border border-cocoa-200 px-3.5 py-2.5">
            <span className="text-sm font-bold text-cocoa-700">{labels.active}</span>
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-cocoa-200 transition peer-checked:bg-matcha-500" />
              <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
}