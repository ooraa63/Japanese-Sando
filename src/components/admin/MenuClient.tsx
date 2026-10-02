"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
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
import type { Flavor, StoreSettings } from "@/lib/types";
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
  sort_order: "0",
};

export function MenuClient({
  initialFlavors,
  initialSettings,
}: {
  initialFlavors: Flavor[];
  initialSettings: StoreSettings | null;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [flavors, setFlavors] = useState(initialFlavors);
  const [stock, setStock] = useState(initialSettings?.total_stock ?? 0);
  const [stockEnabled, setStockEnabled] = useState(
    initialSettings?.stock_enabled ?? true
  );
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [saving, startSaving] = useTransition();

  // Stok.global diambil ulang tiap kali halaman dibuka.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("store_settings")
        .select("total_stock, stock_enabled")
        .eq("id", 1)
        .maybeSingle();
      if (cancelled || !data) return;
      setStock(data.total_stock);
      setStockEnabled(data.stock_enabled);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = search.trim()
    ? flavors.filter(
        (f) =>
          f.name_id.toLowerCase().includes(search.trim().toLowerCase()) ||
          f.name_en.toLowerCase().includes(search.trim().toLowerCase())
      )
    : flavors;

  function openNew() {
    setEditing({
      ...EMPTY,
      sort_order: String((flavors.at(-1)?.sort_order ?? 0) + 1),
    });
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
        stock_enabled: true,
        stock: 0,
        sort_order: Number(editing.sort_order) || 0,
      });

      if (!res.ok) {
        toast.error(t.errors.generic);
        return;
      }

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
          stock_enabled: true,
          stock: 0,
          sort_order: Number(editing.sort_order) || 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const exists = prev.some((f) => f.id === payload.id);
        return exists
          ? prev.map((f) => (f.id === payload.id ? { ...f, ...payload } : f))
          : [...prev, payload].sort((a, b) => a.sort_order - b.sort_order);
      });

      toast.success(t.admin.menu.saved);
      setEditing(null);
      router.refresh();
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
      stock_enabled: true,
      stock: 0,
      sort_order: f.sort_order,
    });
    setBusyId(null);

    if (res.ok) {
      setFlavors((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, is_active: !f.is_active } : x))
      );
      toast.success(!f.is_active ? t.admin.menu.showToast : t.admin.menu.hideToast);
    } else {
      toast.error(t.errors.generic);
    }
  }

  async function changeStock(next: number) {
    const target = Math.max(0, next);
    setStockBusy(true);
    const res = await setStockAction(target);
    setStockBusy(false);

    if (res.ok && res.data) {
      setStock(res.data.total_stock);
      router.refresh();
    } else {
      toast.error(t.errors.generic);
    }
  }

  async function toggleStockEnabled(next: boolean) {
    setStockEnabled(next);
    const res = await setStockAction(stock);
    if (!res.ok) {
      setStockEnabled(!next);
      toast.error(t.errors.generic);
    } else {
      router.refresh();
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

      {/* ---------- Stok global ---------- */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
                stockEnabled
                  ? "bg-matcha-100 text-matcha-700"
                  : "bg-cocoa-100 text-cocoa-400"
              }`}
            >
              <Package className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-cocoa-800">
                {t.admin.dash.stockTitle}
              </h2>
              <p className="mt-0.5 text-xs text-cocoa-500">
                {t.admin.dash.stockAllFlavors}
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5">
            <span className="text-sm font-semibold text-cocoa-600">
              {t.admin.menu.stockEnabled}
            </span>
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={stockEnabled}
                onChange={(e) => void toggleStockEnabled(e.target.checked)}
                className="peer sr-only"
              />
              <span className="h-6 w-11 rounded-full bg-cocoa-200 transition peer-checked:bg-matcha-500" />
              <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>

        {stockEnabled ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-cocoa-100 pt-4">
            <button
              type="button"
              onClick={() => void changeStock(stock - 1)}
              disabled={stockBusy || stock === 0}
              className="grid size-10 place-items-center rounded-xl border border-cocoa-200 text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-40"
              aria-label="-1"
            >
              <Minus className="size-4" />
            </button>

            <div className="min-w-24 text-center">
              <p className="font-display text-4xl font-extrabold text-cocoa-900 tabular">
                {stock}
              </p>
              <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                {t.admin.dash.pcsLeft}
              </p>
            </div>

            <button
              type="button"
              onClick={() => void changeStock(stock + 1)}
              disabled={stockBusy}
              className="grid size-10 place-items-center rounded-xl border border-cocoa-200 text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-40"
              aria-label="+1"
            >
              {stockBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <input
                type="number"
                min={0}
                defaultValue={stock}
                onBlur={(e) => {
                  const v = Number(e.target.value.replace(/\D/g, ""));
                  if (Number.isFinite(v) && v !== stock) void changeStock(v);
                }}
                className="input tabular !w-24 !py-2 text-center"
                aria-label={t.admin.menu.stockAdjust}
              />
              <button
                type="button"
                onClick={() => void changeStock(stock + 10)}
                disabled={stockBusy}
                className="rounded-xl border border-cocoa-200 px-3 py-2 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-50 disabled:opacity-40"
              >
                +10
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-4 border-t border-cocoa-100 pt-4 text-sm font-semibold text-cocoa-500">
            {t.admin.dash.stockUnlimited}
          </p>
        )}
      </div>

      {/* ---------- Daftar rasa ---------- */}
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
