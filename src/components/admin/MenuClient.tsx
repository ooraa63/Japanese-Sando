"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import {
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Minus,
  Package,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { Flavor } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { deleteFlavorAction, saveFlavorAction, setStockAction } from "@/app/admin/actions";

type Draft = {
  id: number | null;
  name_id: string;
  name_en: string;
  desc_id: string;
  desc_en: string;
  price: string;
  image_url: string;
  is_active: boolean;
  is_featured: boolean;
  stock_enabled: boolean;
  stock: string;
  sort_order: string;
};

const EMPTY: Draft = {
  id: null,
  name_id: "",
  name_en: "",
  desc_id: "",
  desc_en: "",
  price: "",
  image_url: "",
  is_active: true,
  is_featured: false,
  stock_enabled: true,
  stock: "0",
  sort_order: "0",
};

export function MenuClient({
  initialFlavors,
}: {
  initialFlavors: Flavor[];
  labels: { title: string };
}) {
  const { t, lang } = useI18n();
  const toast = useToast();

  const [flavors, setFlavors] = useState(initialFlavors);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, startSaving] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return flavors;
    return flavors.filter(
      (f) =>
        f.name_id.toLowerCase().includes(q) ||
        f.name_en.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q)
    );
  }, [flavors, search]);

  function openNew() {
    const nextOrder = (flavors.at(-1)?.sort_order ?? 0) + 1;
    setEditing({ ...EMPTY, sort_order: String(nextOrder) });
  }

  function openEdit(f: Flavor) {
    setEditing({
      id: f.id,
      name_id: f.name_id,
      name_en: f.name_en,
      desc_id: f.desc_id,
      desc_en: f.desc_en,
      price: String(f.price),
      image_url: f.image_url ?? "",
      is_active: f.is_active,
      is_featured: f.is_featured,
      stock_enabled: f.stock_enabled,
      stock: String(f.stock),
      sort_order: String(f.sort_order),
    });
  }

  function patch(next: Partial<Draft>) {
    setEditing((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function save() {
    if (!editing) return;
    if (editing.name_id.trim().length < 2) {
      toast.warning(t.admin.menu.nameId);
      return;
    }
    const price = Number(editing.price.replace(/\D/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      toast.warning(t.admin.menu.priceLabel);
      return;
    }

    startSaving(async () => {
      const res = await saveFlavorAction({
        id: editing.id,
        name_id: editing.name_id.trim(),
        name_en: editing.name_en.trim(),
        desc_id: editing.desc_id.trim(),
        desc_en: editing.desc_en.trim(),
        price,
        image_url: editing.image_url.trim(),
        is_active: editing.is_active,
        is_featured: editing.is_featured,
        stock_enabled: editing.stock_enabled,
        stock: Number(editing.stock.replace(/\D/g, "")) || 0,
        sort_order: Number(editing.sort_order) || 0,
      });

      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }

      // Perbarui state lokal supaya daftar langsung berubah
      setFlavors((prev) => {
        const payload: Flavor = {
          id: res.data!.id,
          slug: editing.name_id
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          name_id: editing.name_id.trim(),
          name_en: editing.name_en.trim() || editing.name_id.trim(),
          desc_id: editing.desc_id.trim(),
          desc_en: editing.desc_en.trim(),
          price,
          image_url: editing.image_url.trim() || null,
          is_active: editing.is_active,
          is_featured: editing.is_featured,
          stock_enabled: editing.stock_enabled,
          stock: Number(editing.stock.replace(/\D/g, "")) || 0,
          sort_order: Number(editing.sort_order) || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const exists = prev.some((f) => f.id === payload.id);
        if (!exists) return [...prev, payload].sort((a, b) => a.sort_order - b.sort_order);
        return prev.map((f) => (f.id === payload.id ? { ...f, ...payload } : f));
      });

      toast.success(t.admin.menu.saved);
      setEditing(null);
    });
  }

  async function remove(f: Flavor) {
    if (!window.confirm(t.admin.menu.deleteConfirm)) return;
    setBusyId(f.id);
    const res = await deleteFlavorAction(f.id);
    setBusyId(null);

    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    if (res.data?.deactivated) {
      setFlavors((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: false } : x)));
      toast.warning(t.admin.menu.deactivated);
    } else {
      setFlavors((prev) => prev.filter((x) => x.id !== f.id));
      toast.success(t.admin.menu.deleted);
    }
  }

  async function toggleActive(f: Flavor) {
    setBusyId(f.id);
    const res = await saveFlavorAction({
      id: f.id,
      name_id: f.name_id,
      name_en: f.name_en,
      desc_id: f.desc_id,
      desc_en: f.desc_en,
      price: f.price,
      image_url: f.image_url ?? "",
      is_active: !f.is_active,
      is_featured: f.is_featured,
      stock_enabled: f.stock_enabled,
      stock: f.stock,
      sort_order: f.sort_order,
    });
    setBusyId(null);

    if (res.ok) {
      setFlavors((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: !f.is_active } : x)));
      toast.success(!f.is_active ? t.admin.menu.showToast : t.admin.menu.hideToast);
    } else {
      toast.error(t.errors.generic);
    }
  }

  async function quickStock(f: Flavor, next: number) {
    const target = Math.max(0, next);
    setBusyId(f.id);
    const res = await setStockAction(f.id, target);
    setBusyId(null);

    if (res.ok) {
      setFlavors((prev) => prev.map((x) => (x.id === f.id ? { ...x, stock: target } : x)));
    } else {
      toast.error(t.errors.generic);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.menu.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{t.admin.menu.subtitle}</p>
        </div>
        <button type="button" onClick={openNew} className="btn-primary shrink-0">
          <Plus className="size-4" />
          {t.admin.menu.addNew}
        </button>
      </div>

      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
        <input
          className="input !py-2.5 pl-10"
          placeholder={t.admin.menu.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-14 text-center">
          <UtensilsCrossed className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">{t.common.empty}</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const busy = busyId === f.id;
            const name = lang === "en" ? f.name_en : f.name_id;
            const low = f.stock_enabled && f.stock > 0 && f.stock <= 5;
            const out = f.stock_enabled && f.stock === 0;

            return (
              <li key={f.id} className="card overflow-hidden">
                <div className="flex gap-3.5 p-4">
                  <div
                    className={`relative size-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br ${
                      f.image_url ? "bg-cocoa-100" : "from-cocoa-300 to-cocoa-500"
                    }`}
                  >
                    {f.image_url ? (
                      <Image
                        src={f.image_url}
                        alt={name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center font-display text-2xl font-bold text-white/60">
                        {f.name_id.charAt(0)}
                      </span>
                    )}
                    {!f.is_active ? (
                      <span className="absolute inset-0 grid place-items-center bg-cocoa-950/60 text-[10px] font-bold tracking-wider text-white uppercase">
                        {t.admin.menu.hideToast}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-base leading-tight font-bold text-cocoa-900">
                        {name}
                      </h3>
                      {f.is_featured ? (
                        <Star
                          className="size-3.5 shrink-0 fill-honey-400 text-honey-400"
                          aria-label={t.menu.featured}
                        />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-cocoa-600 tabular">
                      {formatIDR(f.price, lang)}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-cocoa-300">
                      {f.slug}
                    </p>

                    {/* Stok */}
                    {f.stock_enabled ? (
                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span
                          className={`chip tabular ${
                            out
                              ? "bg-berry-500/10 text-berry-600"
                              : low
                                ? "bg-honey-300/25 text-honey-500"
                                : "bg-matcha-100 text-matcha-700"
                          }`}
                        >
                          <Package className="size-3" />
                          {f.stock}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => quickStock(f, f.stock - 1)}
                            disabled={busy || f.stock === 0}
                            className="grid size-7 place-items-center rounded-lg border border-cocoa-200 text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-40"
                            aria-label="-1"
                          >
                            <Minus className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => quickStock(f, f.stock + 1)}
                            disabled={busy}
                            className="grid size-7 place-items-center rounded-lg border border-cocoa-200 text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-40"
                            aria-label="+1"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="chip mt-2.5 bg-cocoa-100 text-cocoa-500">
                        {t.admin.menu.noStock}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 border-t border-cocoa-100 bg-cocoa-50/60 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => openEdit(f)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100"
                  >
                    <Pencil className="size-3.5" />
                    {t.common.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(f)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100 disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : f.is_active ? (
                      <Eye className="size-3.5" />
                    ) : (
                      <EyeOff className="size-3.5" />
                    )}
                    {f.is_active ? t.admin.menu.active : t.admin.menu.hideToast}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(f)}
                    disabled={busy}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-berry-500 transition hover:bg-berry-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="size-3.5" />
                    {t.common.delete}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ---------- Form tambah/ubah ---------- */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? t.admin.menu.editFlavor : t.admin.menu.newFlavor}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="btn-ghost"
              disabled={saving}
            >
              {t.common.cancel}
            </button>
            <button type="button" onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t.common.saving : t.common.save}
            </button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-5">
            {/* Nama & harga */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-name-id" className="label">
                  {t.admin.menu.nameId}
                </label>
                <input
                  id="f-name-id"
                  className="input"
                  value={editing.name_id}
                  onChange={(e) => patch({ name_id: e.target.value })}
                  placeholder="Caramel Cheese"
                />
              </div>
              <div>
                <label htmlFor="f-name-en" className="label">
                  {t.admin.menu.nameEn}
                </label>
                <input
                  id="f-name-en"
                  className="input"
                  value={editing.name_en}
                  onChange={(e) => patch({ name_en: e.target.value })}
                  placeholder={t.admin.menu.nameEnHint}
                />
              </div>
            </div>

            <div>
              <label htmlFor="f-price" className="label">
                {t.admin.menu.priceLabel}
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-cocoa-400">
                  Rp
                </span>
                <input
                  id="f-price"
                  inputMode="numeric"
                  className="input pl-11 tabular"
                  value={editing.price}
                  onChange={(e) => patch({ price: e.target.value.replace(/\D/g, "") })}
                  placeholder="18000"
                />
              </div>
            </div>

            {/* Deskripsi */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-desc-id" className="label">
                  {t.admin.menu.descId}
                </label>
                <textarea
                  id="f-desc-id"
                  rows={2}
                  className="input resize-none"
                  value={editing.desc_id}
                  onChange={(e) => patch({ desc_id: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="f-desc-en" className="label">
                  {t.admin.menu.descEn}
                </label>
                <textarea
                  id="f-desc-en"
                  rows={2}
                  className="input resize-none"
                  value={editing.desc_en}
                  onChange={(e) => patch({ desc_en: e.target.value })}
                />
              </div>
            </div>

            {/* Foto */}
            <div>
              <span className="label">{t.admin.menu.image}</span>
              <ImageField
                url={editing.image_url}
                onChange={(url) => patch({ image_url: url })}
                labels={{
                  upload: t.admin.menu.uploadImage,
                  change: t.admin.menu.changeImage,
                  remove: t.admin.menu.removeImage,
                  hint: t.admin.menu.imageHint,
                }}
              />
            </div>

            {/* Stok */}
            <div className="rounded-2xl border border-cocoa-200 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={editing.stock_enabled}
                  onChange={(e) => patch({ stock_enabled: e.target.checked })}
                  className="mt-0.5 size-4.5 shrink-0 accent-cocoa-800"
                />
                <span>
                  <span className="block text-sm font-bold text-cocoa-800">
                    {t.admin.menu.stockEnabled}
                  </span>
                  <span className="mt-0.5 block text-xs text-cocoa-400">
                    {t.admin.menu.stockEnabledHint}
                  </span>
                </span>
              </label>

              {editing.stock_enabled ? (
                <div className="mt-4">
                  <label htmlFor="f-stock" className="label">
                    {t.admin.menu.stockLabel}
                  </label>
                  <input
                    id="f-stock"
                    inputMode="numeric"
                    className="input tabular"
                    value={editing.stock}
                    onChange={(e) => patch({ stock: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
              ) : null}
            </div>

            {/* Tampilan */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-sort" className="label">
                  {t.admin.menu.sortOrder}
                </label>
                <input
                  id="f-sort"
                  inputMode="numeric"
                  className="input tabular"
                  value={editing.sort_order}
                  onChange={(e) => patch({ sort_order: e.target.value.replace(/\D/g, "") })}
                />
                <p className="mt-1.5 text-xs text-cocoa-400">{t.admin.menu.sortHint}</p>
              </div>

              <div className="flex flex-col justify-end gap-3 pb-1">
                <Toggle
                  checked={editing.is_active}
                  onChange={(v) => patch({ is_active: v })}
                  label={t.admin.menu.active}
                />
                <Toggle
                  checked={editing.is_featured}
                  onChange={(v) => patch({ is_featured: v })}
                  label={t.admin.menu.featured}
                />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-cocoa-200 px-3.5 py-2.5">
      <span className="text-sm font-bold text-cocoa-700">{label}</span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span className="h-6 w-11 rounded-full bg-cocoa-200 transition peer-checked:bg-matcha-500" />
        <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Unggah foto produk ke bucket publik `flavor-images`. */
function ImageField({
  url,
  onChange,
  labels,
}: {
  url: string;
  onChange: (url: string) => void;
  labels: { upload: string; change: string; remove: string; hint: string };
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(labels.hint);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(labels.hint);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `flavors/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
      const { error } = await supabase.storage
        .from("flavor-images")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) throw error;
      const { data } = supabase.storage.from("flavor-images").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch {
      toast.error(labels.hint);
    } finally {
      setBusy(false);
      setInputKey((k) => k + 1);
    }
  }

  return (
    <div>
      <input
        key={inputKey}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />

      {url ? (
        <div className="flex items-center gap-3">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
            <Image src={url} alt="" fill sizes="80px" className="object-cover" />
          </div>
          <div className="flex gap-1.5">
            <label className="cursor-pointer rounded-lg border border-cocoa-200 px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-50">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {labels.change}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => onChange("")}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-berry-500 transition hover:bg-berry-500/10"
            >
              <X className="size-3.5" />
              {labels.remove}
            </button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-cocoa-200 bg-cocoa-50/50 px-4 py-7 text-center transition hover:border-matcha-400 hover:bg-matcha-50/50">
          {busy ? (
            <Loader2 className="size-6 animate-spin text-matcha-500" />
          ) : (
            <ImagePlus className="size-6 text-cocoa-400" />
          )}
          <span className="text-sm font-bold text-cocoa-700">
            {busy ? "..." : labels.upload}
          </span>
          <span className="text-xs text-cocoa-400">{labels.hint}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
        </label>
      )}
    </div>
  );
}
