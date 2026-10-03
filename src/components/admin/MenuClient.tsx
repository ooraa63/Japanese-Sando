"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  ImagePlus,
  LayoutGrid,
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
import type { BundleTier, Category, Flavor, StoreSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { calcBundle, formatIDR } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import {
  deleteCategoryAction,
  deleteFlavorAction,
  saveCategoryAction,
  saveFlavorAction,
  setStockAction,
} from "@/app/admin/actions";

/**
 * Bentuk form saat mengedit: price & sort_order diubah jadi string supaya
 * enak diketik di input (mis. "18000" tanpa langsung jadi angka).
 */
interface FlavorDraft extends Omit<Flavor, "price" | "sort_order"> {
  price: string;
  sort_order: string;
}

function toFlavorDraft(f: Flavor): FlavorDraft {
  return {
    ...f,
    price: String(f.price),
    sort_order: String(f.sort_order),
  };
}

/**
 * Menu admin dua tingkat: daftar jenis makanan -> daftar rasa di dalamnya.
 * Tampilan default menunjukkan kategori; klik kategori untuk mengelola rasa.
 */
export function MenuClient({
  initialFlavors,
  initialCategories,
  initialSettings,
}: {
  initialFlavors: Flavor[];
  initialCategories: Category[];
  initialSettings: StoreSettings | null;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [categories, setCategories] = useState(initialCategories);
  const [flavors, setFlavors] = useState(initialFlavors);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const [stock, setStock] = useState(initialSettings?.total_stock ?? 0);
  const [stockEnabled, setStockEnabled] = useState(
    initialSettings?.stock_enabled ?? true
  );
  const [stockBusy, setStockBusy] = useState(false);
  const [saving, startSaving] = useTransition();

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingFlavor, setEditingFlavor] = useState<FlavorDraft | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Stok global diambil ulang tiap halaman dibuka.
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

  const activeCategory = categories.find((c) => c.id === activeCategoryId) ?? null;

  const flavorsInCategory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flavors
      .filter((f) => f.category_id === activeCategoryId)
      .filter(
        (f) =>
          !q ||
          f.name_id.toLowerCase().includes(q) ||
          f.name_en.toLowerCase().includes(q)
      );
  }, [flavors, activeCategoryId, search]);

  const sortedCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...categories]
      .filter((c) => !q || c.name_id.toLowerCase().includes(q) || c.name_en.toLowerCase().includes(q))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [categories, search]);

  /* ---------------- Stok global ---------------- */

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

  /* ---------------- Kategori ---------------- */

  function openNewCategory() {
    const nextOrder = (categories.at(-1)?.sort_order ?? 0) + 1;
    setEditingCategory({
      id: 0,
      slug: "",
      name_id: "",
      name_en: "",
      desc_id: "",
      desc_en: "",
      image_url: null,
      is_active: true,
      is_featured: false,
      sort_order: nextOrder,
    });
  }

  function openEditCategory(c: Category) {
    setEditingCategory({ ...c });
  }

  function saveCategory() {
    if (!editingCategory) return;
    if (editingCategory.name_id.trim().length < 2) {
      toast.warning(t.admin.menu.nameId);
      return;
    }

    startSaving(async () => {
      const res = await saveCategoryAction({
        id: editingCategory.id || null,
        name_id: editingCategory.name_id.trim(),
        name_en: editingCategory.name_en.trim(),
        desc_id: editingCategory.desc_id.trim(),
        desc_en: editingCategory.desc_en.trim(),
        image_url: editingCategory.image_url ?? "",
        is_active: editingCategory.is_active,
        is_featured: editingCategory.is_featured,
        sort_order: editingCategory.sort_order,
      });

      if (!res.ok) {
        toast.error(
          res.error === "slug_taken" ? t.admin.menu.slugTaken : t.errors.generic
        );
        return;
      }

      setCategories((prev) => {
        const id = res.data!.id;
        const next: Category = {
          ...editingCategory,
          id,
          slug:
            editingCategory.name_id
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
        };
        const exists = prev.some((c) => c.id === id);
        return exists
          ? prev.map((c) => (c.id === id ? { ...c, ...next } : c))
          : [...prev, next];
      });

      toast.success(t.admin.menu.categorySaved);
      setEditingCategory(null);
      router.refresh();
    });
  }

  async function removeCategory(c: Category) {
    if (!window.confirm(t.admin.menu.deleteCategoryConfirm)) return;
    setBusyId(c.id);
    const res = await deleteCategoryAction(c.id);
    setBusyId(null);

    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    if (res.data?.deactivated) {
      setCategories((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, is_active: false } : x))
      );
      toast.warning(t.admin.menu.categoryDeactivated);
    } else {
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      toast.success(t.admin.menu.categoryDeleted);
    }
    router.refresh();
  }

  /* ---------------- Rasa ---------------- */

  function openNewFlavor() {
    const nextOrder = (flavorsInCategory.at(-1)?.sort_order ?? 0) + 1;
    setEditingFlavor({
      id: 0,
      slug: "",
      name_id: "",
      name_en: "",
      desc_id: "",
      desc_en: "",
      price: "",
      image_url: null,
      is_active: true,
      is_featured: false,
      stock_enabled: true,
      stock: 0,
      sort_order: String(nextOrder),
      bundle_tiers: [],
      category_id: activeCategoryId,
      created_at: "",
      updated_at: "",
    });
  }

  function openEditFlavor(f: Flavor) {
    setEditingFlavor(toFlavorDraft(f));
  }

  function saveFlavor() {
    if (!editingFlavor) return;
    if (editingFlavor.name_id.trim().length < 2) {
      toast.warning(t.admin.menu.nameId);
      return;
    }
    const price = Number(editingFlavor.price.replace(/\D/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      toast.warning(t.admin.menu.priceLabel);
      return;
    }

    startSaving(async () => {
      const res = await saveFlavorAction({
        id: editingFlavor.id || null,
        name_id: editingFlavor.name_id.trim(),
        name_en: editingFlavor.name_en.trim(),
        desc_id: editingFlavor.desc_id.trim(),
        desc_en: editingFlavor.desc_en.trim(),
        price,
        image_url: editingFlavor.image_url ?? "",
        is_active: editingFlavor.is_active,
        is_featured: editingFlavor.is_featured,
        stock_enabled: true,
        stock: 0,
        sort_order: Number(editingFlavor.sort_order) || 0,
        bundle_tiers: editingFlavor.bundle_tiers,
        category_id: editingFlavor.category_id ?? activeCategoryId,
      });

      if (!res.ok) {
        toast.error(
          res.error === "slug_taken" ? t.admin.menu.slugTaken : t.errors.generic
        );
        return;
      }

      setFlavors((prev) => {
        const id = res.data!.id;
        const next: Flavor = {
          ...editingFlavor,
          id,
          slug:
            editingFlavor.name_id
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
          price,
          sort_order: Number(editingFlavor.sort_order) || 0,
          category_id: editingFlavor.category_id ?? activeCategoryId,
          created_at: editingFlavor.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const exists = prev.some((f) => f.id === id);
        return exists
          ? prev.map((f) => (f.id === id ? { ...f, ...next } : f))
          : [...prev, next].sort((a, b) => a.sort_order - b.sort_order);
      });

      // Perbarui jumlah rasa di kategori
      setCategories((prev) =>
        prev.map((c) => {
          if (c.id !== (editingFlavor.category_id ?? activeCategoryId)) return c;
          const count = flavors.filter(
            (f) =>
              f.category_id === c.id &&
              f.is_active &&
              !(editingFlavor.id === 0 && f.id === res.data!.id)
          ).length;
          return { ...c, flavor_count: (c.flavor_count ?? 0) + (editingFlavor.id === 0 ? 1 : 0) || count };
        })
      );

      toast.success(t.admin.menu.saved);
      setEditingFlavor(null);
      router.refresh();
    });
  }

  async function removeFlavor(f: Flavor) {
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
    router.refresh();
  }

  async function toggleFlavorActive(f: Flavor) {
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
      bundle_tiers: f.bundle_tiers ?? [],
      category_id: f.category_id,
    });
    setBusyId(null);

    if (res.ok) {
      setFlavors((prev) => prev.map((x) => (x.id === f.id ? { ...x, is_active: !f.is_active } : x)));
      toast.success(!f.is_active ? t.admin.menu.showToast : t.admin.menu.hideToast);
    } else {
      toast.error(t.errors.generic);
    }
  }

  /* ---------------- Tampilan ---------------- */

  return (
    <div className="space-y-5">
      {/* ---------- Header ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.menu.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{t.admin.menu.subtitle}</p>
        </div>
        {activeCategory ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveCategoryId(null)}
              className="btn-ghost !px-4 !py-2.5"
            >
              <ArrowLeft className="size-4" />
              {t.admin.menu.backToCategories}
            </button>
            <button type="button" onClick={openNewFlavor} className="btn-primary shrink-0">
              <Plus className="size-4" />
              {t.admin.menu.addFlavor}
            </button>
          </div>
        ) : (
          <button type="button" onClick={openNewCategory} className="btn-primary shrink-0">
            <Plus className="size-4" />
            {t.admin.menu.addCategory}
          </button>
        )}
      </div>

      {/* ---------- Stok global ---------- */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
                stockEnabled ? "bg-matcha-100 text-matcha-700" : "bg-cocoa-100 text-cocoa-400"
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

      {/* ---------- Pencarian ---------- */}
      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
        <input
          className="input !py-2.5 pl-10"
          placeholder={activeCategory ? t.admin.menu.searchPlaceholder : t.admin.menu.searchCategory}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          type="search"
        />
      </div>

      {/* ---------- Tingkat 1: KATEGORI ---------- */}
      {!activeCategory ? (
        sortedCategories.length === 0 ? (
          <div className="card p-14 text-center">
            <LayoutGrid className="mx-auto size-8 text-cocoa-300" />
            <p className="mt-3 text-sm text-cocoa-400">{t.admin.menu.noCategory}</p>
            <button type="button" onClick={openNewCategory} className="btn-primary mt-5">
              <Plus className="size-4" />
              {t.admin.menu.addCategory}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-cocoa-500">{t.admin.menu.categoryHint}</p>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sortedCategories.map((c) => {
                const name = lang === "en" ? c.name_en : c.name_id;
                const count = flavors.filter(
                  (f) => f.category_id === c.id && f.is_active
                ).length;

                return (
                  <li key={c.id} className="card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategoryId(c.id);
                        setSearch("");
                      }}
                      className="group flex w-full items-center gap-3.5 p-4 text-left transition hover:bg-cocoa-50"
                    >
                      <span
                        className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl ${
                          c.image_url
                            ? "bg-cocoa-100"
                            : "bg-gradient-to-br from-cocoa-300 to-cocoa-500"
                        }`}
                      >
                        {c.image_url ? (
                          <Image
                            src={c.image_url}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <LayoutGrid className="size-6 text-white/70" />
                        )}
                        {!c.is_active ? (
                          <span className="absolute inset-0 grid place-items-center bg-cocoa-950/65 text-[9px] font-bold tracking-wider text-white uppercase">
                            off
                          </span>
                        ) : null}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-display text-base font-bold text-cocoa-900">
                            {name}
                          </span>
                          {c.is_featured ? (
                            <Star className="size-3.5 shrink-0 fill-honey-400 text-honey-400" />
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-cocoa-400">
                          {count} {t.menu.flavors}
                        </span>
                      </span>

                      <ArrowLeft className="size-4 shrink-0 rotate-180 text-cocoa-300 transition group-hover:translate-x-0.5" />
                    </button>

                    <div className="flex items-center gap-1 border-t border-cocoa-100 bg-cocoa-50/60 px-2 py-2">
                      <button
                        type="button"
                        onClick={() => openEditCategory(c)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100"
                      >
                        <Pencil className="size-3.5" />
                        {t.common.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCategory(c)}
                        disabled={busyId === c.id}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-berry-500 transition hover:bg-berry-500/10 disabled:opacity-40"
                      >
                        {busyId === c.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                        {t.common.delete}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )
      ) : (
        /* ---------- Tingkat 2: RASA ---------- */
        <>
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-cocoa-300 to-cocoa-500 text-white">
              <LayoutGrid className="size-4" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-cocoa-900">
                {lang === "en" ? activeCategory.name_en : activeCategory.name_id}
              </h2>
              <p className="text-xs text-cocoa-400">
                {flavorsInCategory.length} {t.menu.flavors}
              </p>
            </div>
          </div>

          {flavorsInCategory.length === 0 ? (
            <div className="card p-14 text-center">
              <UtensilsCrossed className="mx-auto size-8 text-cocoa-300" />
              <p className="mt-3 text-sm text-cocoa-400">{t.common.empty}</p>
              <button type="button" onClick={openNewFlavor} className="btn-primary mt-5">
                <Plus className="size-4" />
                {t.admin.menu.addFlavor}
              </button>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {flavorsInCategory.map((f) => {
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
                          <span className="absolute inset-0 grid place-items-center bg-cocoa-950/65 text-[10px] font-bold tracking-wider text-white uppercase">
                            off
                          </span>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-display text-base leading-tight font-bold text-cocoa-900">
                            {name}
                          </h3>
                          {f.is_featured ? (
                            <Star className="size-3.5 shrink-0 fill-honey-400 text-honey-400" />
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
                        onClick={() => openEditFlavor(f)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100"
                      >
                        <Pencil className="size-3.5" />
                        {t.common.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFlavorActive(f)}
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
                        onClick={() => removeFlavor(f)}
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
        </>
      )}

      {/* ---------- Modal kategori ---------- */}
      <Modal
        open={Boolean(editingCategory)}
        onClose={() => setEditingCategory(null)}
        title={
          editingCategory?.id
            ? t.admin.menu.editCategory
            : t.admin.menu.newCategory
        }
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingCategory(null)}
              className="btn-ghost"
              disabled={saving}
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={saveCategory}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t.common.saving : t.common.save}
            </button>
          </>
        }
      >
        {editingCategory ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="c-name-id" className="label">
                  {t.admin.menu.nameId}
                </label>
                <input
                  id="c-name-id"
                  className="input"
                  value={editingCategory.name_id}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, name_id: e.target.value })
                  }
                  placeholder="Sando Sandwich"
                />
              </div>
              <div>
                <label htmlFor="c-name-en" className="label">
                  {t.admin.menu.nameEn}
                </label>
                <input
                  id="c-name-en"
                  className="input"
                  value={editingCategory.name_en}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, name_en: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="c-desc-id" className="label">
                  {t.admin.menu.descId}
                </label>
                <textarea
                  id="c-desc-id"
                  rows={2}
                  className="input resize-none"
                  value={editingCategory.desc_id}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, desc_id: e.target.value })
                  }
                />
              </div>
              <div>
                <label htmlFor="c-desc-en" className="label">
                  {t.admin.menu.descEn}
                </label>
                <textarea
                  id="c-desc-en"
                  rows={2}
                  className="input resize-none"
                  value={editingCategory.desc_en}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, desc_en: e.target.value })
                  }
                />
              </div>
            </div>

            <div>
              <span className="label">{t.admin.menu.image}</span>
              <ImageField
                url={editingCategory.image_url ?? ""}
                onChange={(url) =>
                  setEditingCategory({ ...editingCategory, image_url: url || null })
                }
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
                <label htmlFor="c-sort" className="label">
                  {t.admin.menu.sortOrder}
                </label>
                <input
                  id="c-sort"
                  inputMode="numeric"
                  className="input tabular"
                  value={editingCategory.sort_order}
                  onChange={(e) =>
                    setEditingCategory({
                      ...editingCategory,
                      sort_order: Number(e.target.value.replace(/\D/g, "")) || 0,
                    })
                  }
                />
              </div>
              <div className="flex flex-col justify-end gap-3 pb-1">
                <Toggle
                  checked={editingCategory.is_active}
                  onChange={(v) => setEditingCategory({ ...editingCategory, is_active: v })}
                  label={t.admin.menu.active}
                />
                <Toggle
                  checked={editingCategory.is_featured}
                  onChange={(v) => setEditingCategory({ ...editingCategory, is_featured: v })}
                  label={t.admin.menu.featured}
                />
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ---------- Modal rasa ---------- */}
      <Modal
        open={Boolean(editingFlavor)}
        onClose={() => setEditingFlavor(null)}
        title={editingFlavor?.id ? t.admin.menu.editFlavor : t.admin.menu.newFlavor}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingFlavor(null)}
              className="btn-ghost"
              disabled={saving}
            >
              {t.common.cancel}
            </button>
            <button type="button" onClick={saveFlavor} disabled={saving} className="btn-primary">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t.common.saving : t.common.save}
            </button>
          </>
        }
      >
        {editingFlavor ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="f-name-id" className="label">
                  {t.admin.menu.nameId}
                </label>
                <input
                  id="f-name-id"
                  className="input"
                  value={editingFlavor.name_id}
                  onChange={(e) =>
                    setEditingFlavor({ ...editingFlavor, name_id: e.target.value })
                  }
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
                  value={editingFlavor.name_en}
                  onChange={(e) =>
                    setEditingFlavor({ ...editingFlavor, name_en: e.target.value })
                  }
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
                  value={editingFlavor.price}
                  onChange={(e) =>
                    setEditingFlavor({
                      ...editingFlavor,
                      price: e.target.value.replace(/\D/g, ""),
                    })
                  }
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
                  value={editingFlavor.desc_id}
                  onChange={(e) =>
                    setEditingFlavor({ ...editingFlavor, desc_id: e.target.value })
                  }
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
                  value={editingFlavor.desc_en}
                  onChange={(e) =>
                    setEditingFlavor({ ...editingFlavor, desc_en: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Paket harga untuk produk ini */}
            <div className="rounded-2xl border border-cocoa-200 p-4">
              <p className="text-sm font-bold text-cocoa-800">
                {t.admin.menu.bundleTitle}
              </p>
              <p className="mt-0.5 text-xs text-cocoa-400">
                {t.admin.menu.bundleHint}
              </p>
              <BundleTierEditor
                tiers={editingFlavor.bundle_tiers ?? []}
                onChange={(tiers) =>
                  setEditingFlavor({ ...editingFlavor, bundle_tiers: tiers })
                }
                unitPrice={Number(editingFlavor.price.replace(/\D/g, "")) || 0}
              />
            </div>

            <div>
              <span className="label">{t.admin.menu.image}</span>
              <ImageField
                url={editingFlavor.image_url ?? ""}
                onChange={(url) => setEditingFlavor({ ...editingFlavor, image_url: url || null })}
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
                  value={editingFlavor.sort_order}
                  onChange={(e) =>
                    setEditingFlavor({
                      ...editingFlavor,
                      sort_order: e.target.value.replace(/\D/g, ""),
                    })
                  }
                />
              </div>
              <div className="flex flex-col justify-end gap-3 pb-1">
                <Toggle
                  checked={editingFlavor.is_active}
                  onChange={(v) => setEditingFlavor({ ...editingFlavor, is_active: v })}
                  label={t.admin.menu.active}
                />
                <Toggle
                  checked={editingFlavor.is_featured}
                  onChange={(v) => setEditingFlavor({ ...editingFlavor, is_featured: v })}
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

/* ---------- komponen kecil ---------- */

/**
 * Daftar harga paket untuk satu produk. Tambah sebanyak apa pun.
 * Pratinjau memakai aturan yang sama dengan server: paket ditumpuk, paket
 * dengan qty terbesar dulu, sisanya harga satuan.
 */
function BundleTierEditor({
  tiers,
  onChange,
  unitPrice,
}: {
  tiers: BundleTier[];
  onChange: (tiers: BundleTier[]) => void;
  unitPrice: number;
}) {
  const { t, lang } = useI18n();

  const sorted = [...tiers].sort((a, b) => a.qty - b.qty);

  function update(i: number, next: Partial<BundleTier>) {
    onChange(tiers.map((tier, idx) => (idx === i ? { ...tier, ...next } : tier)));
  }

  function remove(i: number) {
    onChange(tiers.filter((_, idx) => idx !== i));
  }

  const preview = [1, 2, 3, 4, 5].map((n) => {
    const calc = calcBundle(n, unitPrice, sorted);
    return { n, total: calc.total, saving: calc.saving };
  });

  return (
    <div className="mt-3 space-y-3">
      {sorted.length === 0 ? (
        <p className="rounded-xl bg-cocoa-50 p-3.5 text-sm text-cocoa-500">
          {t.admin.menu.bundleEmpty}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {sorted.map((tier, i) => {
            const regular = tier.qty * unitPrice;
            const worth = unitPrice > 0 && tier.price < regular;
            return (
              <li key={i} className="rounded-xl border border-cocoa-200 p-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div>
                    <span className="label">{t.admin.menu.bundleSize}</span>
                    <div className="relative">
                      <input
                        inputMode="numeric"
                        min={2}
                        className="input tabular"
                        value={tier.qty}
                        onChange={(e) =>
                          update(i, {
                            qty: Math.max(2, Number(e.target.value.replace(/\D/g, "")) || 2),
                          })
                        }
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs font-bold text-cocoa-400">
                        pcs
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="label">{t.admin.menu.bundlePrice}</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-cocoa-400">
                        Rp
                      </span>
                      <input
                        inputMode="numeric"
                        className="input pl-11 tabular"
                        value={tier.price}
                        onChange={(e) =>
                          update(i, { price: Number(e.target.value.replace(/\D/g, "")) || 0 })
                        }
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="self-end rounded-lg p-2.5 text-berry-500 transition hover:bg-berry-500/10"
                    aria-label={t.common.delete}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <p className="mt-1.5 text-xs text-cocoa-400">
                  {tier.qty} × {formatIDR(unitPrice, lang)} ={" "}
                  {formatIDR(regular, lang)}
                  {worth ? (
                    <span className="ml-1.5 font-bold text-matcha-600">
                      {t.admin.menu.bundleSave} {formatIDR(regular - tier.price, lang)}
                    </span>
                  ) : unitPrice > 0 ? (
                    <span className="ml-1.5 font-bold text-honey-500">
                      {t.admin.menu.bundleNotCheaper}
                    </span>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() =>
          onChange([
            ...tiers,
            {
              qty: (sorted.at(-1)?.qty ?? 1) + 1,
              price: Math.round((sorted.at(-1)?.price ?? unitPrice * 2) * 0.94 / 500) * 500,
            },
          ])
        }
        className="btn-outline w-full !py-2.5 !text-[13px]"
      >
        <Plus className="size-4" />
        {t.admin.menu.bundleAdd}
      </button>

      <div className="rounded-xl bg-cocoa-50 p-3.5">
        <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
          {t.admin.menu.bundlePreview}
        </p>
        <ul className="mt-2 space-y-1 text-[13px] text-cocoa-600 tabular">
          {preview.map((p) => (
            <li key={p.n} className="flex justify-between gap-3">
              <span>
                {p.n} {t.admin.menu.pcs}
              </span>
              <span className="font-bold">
                {formatIDR(p.total, lang)}
                {p.saving > 0 ? (
                  <span className="ml-1.5 text-[11px] font-semibold text-matcha-600">
                    (−{formatIDR(p.saving, lang)})
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </div>
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

/** Unggah foto ke bucket publik `flavor-images`. */
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
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
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
