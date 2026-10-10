"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  HelpCircle,
  Loader2,
  MessageCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UserCircle,
} from "lucide-react";
import type { ProfileMenuButton, ProfileMenuItem } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  deleteProfileMenuItemAction,
  saveProfileMenuItemAction,
} from "@/app/admin/actions";

/**
 * Kelola bar menu sheet "Profil" (tab paling kanan bottom nav pembeli).
 *
 * Setiap bar punya: judul (id/en), isi popup (id/en), tombol (JSON), urutan,
 * dan status aktif. Penjual bisa menambah bar baru tanpa perlu deploy ulang.
 *
 * Kode `account` punya perilaku khusus di frontend (membuka form login),
 * jadi tidak boleh diubah dan tidak boleh diduplikasi.
 */

const ICON_CHOICES = [
  { name: "UserCircle", icon: UserCircle },
  { name: "MessageCircle", icon: MessageCircle },
  { name: "HelpCircle", icon: HelpCircle },
  { name: "Clock", icon: Clock },
  { name: "FileText", icon: FileText },
  { name: "Sparkles", icon: Sparkles },
] as const;

type Draft = Omit<ProfileMenuItem, "id"> & { id?: number };

const EMPTY: Draft = {
  code: "",
  icon: "HelpCircle",
  title_id: "",
  title_en: "",
  body_id: "",
  body_en: "",
  buttons: [],
  sort_order: 50,
  is_active: true,
};

export function ProfileMenuClient({
  initialItems,
}: {
  initialItems: ProfileMenuItem[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [items, setItems] = useState<ProfileMenuItem[]>(initialItems);
  const [openId, setOpenId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  function editItem(item: ProfileMenuItem) {
    setDraft({
      id: item.id,
      code: item.code,
      icon: item.icon,
      title_id: item.title_id,
      title_en: item.title_en,
      body_id: item.body_id,
      body_en: item.body_en,
      buttons: Array.isArray(item.buttons) ? item.buttons : [],
      sort_order: item.sort_order,
      is_active: item.is_active,
    });
    setOpenId(item.id);
  }

  function newItem() {
    // Kode baru selalu dibuat di urutan paling akhir supaya tidak bentrok.
    const nextOrder =
      items.length > 0
        ? Math.max(...items.map((i) => i.sort_order)) + 10
        : 10;
    setDraft({ ...EMPTY, sort_order: nextOrder });
    setOpenId("new");
  }

  function save() {
    const code = draft.code.trim().toLowerCase();
    if (!code || !draft.title_id.trim()) {
      toast.error(t.admin.settings.profileMenu.codeRequired);
      return;
    }

    startTransition(async () => {
      const res = await saveProfileMenuItemAction({
        id: draft.id ?? null,
        code,
        icon: draft.icon,
        title_id: draft.title_id,
        title_en: draft.title_en,
        body_id: draft.body_id,
        body_en: draft.body_en,
        buttons: draft.buttons.filter((b) => b.label_id.trim() && b.href.trim()),
        sort_order: Number(draft.sort_order) || 0,
        is_active: draft.is_active,
      });

      if (!res.ok) {
        toast.error(
          res.error === "code_taken"
            ? t.admin.settings.profileMenu.codeTaken
            : t.errors.generic
        );
        return;
      }

      toast.success(t.admin.settings.profileMenu.saved);
      setOpenId(null);
      router.refresh();
    });
  }

  function remove(item: ProfileMenuItem) {
    if (!window.confirm(t.admin.settings.profileMenu.deleteConfirm)) return;
    startTransition(async () => {
      const res = await deleteProfileMenuItemAction(item.id);
      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setOpenId(null);
      toast.success(t.admin.settings.profileMenu.deleted);
      router.refresh();
    });
  }

  /** Naikkan/turunkan bar satu tingkat (naik 10, turun 10). */
  function move(item: ProfileMenuItem, dir: -1 | 1) {
    const next = items.map((i) =>
      i.id === item.id
        ? { ...i, sort_order: Math.max(0, i.sort_order + dir * 10) }
        : i
    );
    setItems(next);
    startTransition(async () => {
      await saveProfileMenuItemAction({
        id: item.id,
        code: item.code,
        icon: item.icon,
        title_id: item.title_id,
        title_en: item.title_en,
        body_id: item.body_id,
        body_en: item.body_en,
        buttons: item.buttons,
        sort_order: Math.max(0, item.sort_order + dir * 10),
        is_active: item.is_active,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.settings.profileMenu.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{t.admin.settings.profileMenu.subtitle}</p>
        </div>
        <button type="button" onClick={newItem} className="btn-primary shrink-0">
          <Plus className="size-4" />
          {t.admin.settings.profileMenu.addItem}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-cocoa-400">
          <p>{t.admin.settings.profileMenu.empty}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="card p-0">
              <div className="flex items-center gap-3 p-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
                  {iconEl(item.icon)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-cocoa-900">
                    {item.title_id}
                    {item.code === "account" ? (
                      <span className="ml-2 rounded-full bg-matcha-100 px-2 py-0.5 text-[10px] font-bold text-matcha-700">
                        {t.admin.settings.profileMenu.special}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-cocoa-400">
                    <code className="font-mono">{item.code}</code>
                    {" · "}
                    {item.is_active
                      ? t.admin.settings.profileMenu.active
                      : t.admin.settings.profileMenu.hidden}
                    {item.body_id ? ` · ${item.body_id}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(item, -1)}
                    disabled={pending || item.sort_order <= 0}
                    aria-label={t.admin.settings.profileMenu.moveUp}
                    className="rounded-lg p-2 text-cocoa-400 transition hover:bg-cocoa-100 disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(item, 1)}
                    disabled={pending}
                    aria-label={t.admin.settings.profileMenu.moveDown}
                    className="rounded-lg p-2 text-cocoa-400 transition hover:bg-cocoa-100 disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => editItem(item)}
                    className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100"
                  >
                    {t.common.edit}
                  </button>
                </div>
              </div>

              {openId === item.id ? (
                <ItemForm
                  draft={draft}
                  onPatch={patch}
                  onSave={save}
                  onCancel={() => setOpenId(null)}
                  onDelete={() => remove(item)}
                  pending={pending}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {openId === "new" ? (
        <div className="card p-0">
          <div className="border-b border-cocoa-100 px-5 py-4">
            <h2 className="text-base font-bold text-cocoa-800">
              {t.admin.settings.profileMenu.newTitle}
            </h2>
          </div>
          <ItemForm
            draft={draft}
            onPatch={patch}
            onSave={save}
            onCancel={() => setOpenId(null)}
            pending={pending}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Ikon sebagai JSX (bukan komponen) supaya tidak melanggar
 *  react-hooks/static-components. */
function iconEl(name: string) {
  const cls = "size-4.5";
  switch (name) {
    case "UserCircle":
      return <UserCircle className={cls} />;
    case "MessageCircle":
      return <MessageCircle className={cls} />;
    case "Clock":
      return <Clock className={cls} />;
    case "FileText":
      return <FileText className={cls} />;
    case "Sparkles":
      return <Sparkles className={cls} />;
    default:
      return <HelpCircle className={cls} />;
  }
}

function ItemForm({
  draft,
  onPatch,
  onSave,
  onCancel,
  onDelete,
  pending,
}: {
  draft: Draft;
  onPatch: (next: Partial<Draft>) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  pending: boolean;
}) {
  const { t } = useI18n();
  const isAccount = draft.code === "account";
  // Isi bar `contact` di-seed dari store_settings, jadi itu SALINAN, bukan
  // data langsung. Kalau alamat / jam buka diubah di tab "Kontak & Lokasi",
  // teks di popup ini TIDAK ikut berubah — harus disalin manual di sini.
  const isSeededContact = draft.code === "contact";

  return (
    <div className="border-t border-cocoa-100 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="pm-code">
            {t.admin.settings.profileMenu.code}
          </label>
          <input
            id="pm-code"
            className="input font-mono"
            value={draft.code}
            readOnly={isAccount}
            onChange={(e) => onPatch({ code: e.target.value })}
            placeholder="faq"
          />
          <p className="mt-1.5 text-xs text-cocoa-400">
            {t.admin.settings.profileMenu.codeHint}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="pm-icon">
            {t.admin.settings.profileMenu.icon}
          </label>
          <select
            id="pm-icon"
            className="input"
            value={draft.icon}
            onChange={(e) => onPatch({ icon: e.target.value })}
          >
            {ICON_CHOICES.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="pm-title-id">
            {t.admin.settings.profileMenu.titleId}
          </label>
          <input
            id="pm-title-id"
            className="input"
            value={draft.title_id}
            onChange={(e) => onPatch({ title_id: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="pm-title-en">
            {t.admin.settings.profileMenu.titleEn}
          </label>
          <input
            id="pm-title-en"
            className="input"
            value={draft.title_en}
            onChange={(e) => onPatch({ title_en: e.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="pm-body-id">
            {t.admin.settings.profileMenu.bodyId}
          </label>
          <textarea
            id="pm-body-id"
            rows={4}
            className="input resize-none"
            value={draft.body_id}
            readOnly={isAccount}
            onChange={(e) => onPatch({ body_id: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="pm-body-en">
            {t.admin.settings.profileMenu.bodyEn}
          </label>
          <textarea
            id="pm-body-en"
            rows={3}
            className="input resize-none"
            value={draft.body_en}
            readOnly={isAccount}
            onChange={(e) => onPatch({ body_en: e.target.value })}
          />
        </div>
      </div>

      {!isAccount ? <ButtonEditor buttons={draft.buttons} onPatch={onPatch} /> : null}

      {isSeededContact ? (
        <p className="mt-3 rounded-xl bg-honey-50 px-3.5 py-2.5 text-xs text-cocoa-600">
          {t.admin.settings.profileMenu.contactCopiedFromSettings}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => onPatch({ is_active: e.target.checked })}
            className="size-4 accent-matcha-500"
          />
          <span className="text-sm font-bold text-cocoa-700">
            {t.admin.settings.profileMenu.showInSheet}
          </span>
        </label>

        <div className="flex items-center gap-2">
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-berry-500 transition hover:bg-berry-500/10 disabled:opacity-40"
            >
              <Trash2 className="size-4" />
              {t.common.delete}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="btn-ghost"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="btn-primary"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {t.common.save}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Editor tombol di dalam popup.
 *
 * Tombol disimpan sebagai JSON di kolom `buttons` (lihat migration-41).
 * Bentuknya bebas dari viewpoint database, jadi cukup label + link — tidak
 * ada "jenis" tombol yang perlu divalidasi.
 */
function ButtonEditor({
  buttons,
  onPatch,
}: {
  buttons: ProfileMenuButton[];
  onPatch: (next: Partial<Draft>) => void;
}) {
  const { t } = useI18n();
  const list = Array.isArray(buttons) ? buttons : [];

  function update(i: number, next: Partial<ProfileMenuButton>) {
    onPatch({
      buttons: list.map((b, idx) => (idx === i ? { ...b, ...next } : b)),
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-dashed border-cocoa-200 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-cocoa-800">
            {t.admin.settings.profileMenu.buttons}
          </p>
          <p className="mt-0.5 text-xs text-cocoa-400">
            {t.admin.settings.profileMenu.buttonsHint}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            onPatch({
              buttons: [...list, { label_id: "", label_en: "", href: "" }],
            })
          }
          className="btn-ghost shrink-0 !px-3 !py-1.5 !text-[12px]"
        >
          <Plus className="size-3.5" />
          {t.admin.settings.profileMenu.addButton}
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-xs text-cocoa-400">{t.admin.settings.profileMenu.noButtons}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((b, i) => (
            <li
              key={i}
              className="grid gap-2 rounded-xl bg-cocoa-50 p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <input
                className="input !py-2"
                placeholder="Label (Indonesia)"
                value={b.label_id}
                onChange={(e) => update(i, { label_id: e.target.value })}
              />
              <input
                className="input !py-2"
                placeholder="Label (English)"
                value={b.label_en ?? ""}
                onChange={(e) => update(i, { label_en: e.target.value })}
              />
              <div className="flex gap-2">
                <input
                  className="input !py-2 min-w-0 flex-1"
                  placeholder="https://…"
                  value={b.href}
                  onChange={(e) => update(i, { href: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() =>
                    onPatch({ buttons: list.filter((_, idx) => idx !== i) })
                  }
                  aria-label={t.common.delete}
                  className="shrink-0 rounded-lg p-2.5 text-berry-500 transition hover:bg-berry-500/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}