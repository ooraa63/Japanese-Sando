"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Gift,
  ImagePlus,
  LayoutGrid,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import type { Bundle, BundleChoiceSlot, Category, Flavor, StoreSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { formatIDR } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import {
  deleteCategoryAction,
  deleteFlavorAction,
  deleteBundleAction,
  saveCategoryAction,
  saveFlavorAction,
  saveBundleAction,
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
    likes_count: f.likes_count ?? 0,
    price: String(f.price),
    sort_order: String(f.sort_order),
  };
}

/**
 * Bundle form state — price & sort_order string biar enak diketik.
 *
 * `flavor_ids` = daftar rasa yang dipilih PENJUAL untuk isi bundle ini.
 * Kosong = semua rasa aktif boleh dipakai, jadi bundle tidak terkunci ke
 * kategori tertentu (migration-45, tabel `bundle_flavors`).
 *
 * `slots` = daftar PILIHAN (migration-59). Kalau tidak kosong, paket memakai
 * mode pilihan: tiap pilihan punya daftar rasa sendiri dan pembeli ambil satu
 * rasa per pilihan. Daftar `flavor_ids` lalu tidak dipakai sama sekali untuk
 * paket ini.
 */
interface BundleDraft extends Omit<Bundle, "price" | "sort_order" | "slots"> {
  price: string;
  /** Harga coret — string / kosong = tidak ada harga coret. */
  compare_price_str: string;
  sort_order: string;
  category_id_str: string; // <select> butuh string
  flavor_ids: number[];
  /** Selalu array, supaya tidak perlu cek null di mana-mana. */
  slots: BundleChoiceDraft[];
}

/** Batas pilihan per paket. Sama dengan batas yang ditegakkan RPC. */
const MAKS_PILIHAN = 10;

/**
 * Bentuk pilihan yang siap disimpan. `index` sengaja tidak dikirim — server
 * assigns dari posisi array, jadi urutan di layar inilah yang jadi urutan
 * di database.
 */
type BundleChoiceDraft = Omit<BundleChoiceSlot, "index">;

function keDraftChoice(slots: BundleChoiceSlot[] | undefined): BundleChoiceDraft[] {
  return (slots ?? []).map((s) => ({
    label_id: s.label_id ?? "",
    label_en: s.label_en ?? "",
    flavor_ids: [...(s.flavor_ids ?? [])],
  }));
}

function toBundleDraft(b: Bundle): BundleDraft {
  return {
    ...b,
    price: String(b.price),
    compare_price_str: b.compare_price == null ? "" : String(b.compare_price),
    sort_order: String(b.sort_order),
    category_id_str: b.category_id == null ? "" : String(b.category_id),
    flavor_ids: b.flavor_ids ?? [],
    is_fixed: b.is_fixed ?? false,
    slots: keDraftChoice(b.slots),
  };
}

type Tab = "categories" | "bundles";

/**
 * Menu admin — tiga tingkat:
 *   1. Tab: Kategori | Bundle
 *   2. Tingkat kategori: daftar kategori -> di dalamnya ada daftar rasa
 *   3. Bundle: daftar bundle berdiri sendiri atau per kategori
 *
 * Tab "Kategori" mengikuti alur lama (klik kategori -> kelola rasa).
 * Tab "Bundle" menampilkan semua bundle (bisa difilter per kategori).
 */
export function MenuClient({
  initialFlavors,
  initialCategories,
  initialBundles,
  canBundleChoices = false,
}: {
  initialFlavors: Flavor[];
  initialCategories: Category[];
  initialBundles?: Bundle[];
  /**
   * migration-59 sudah terpasang di database? Kalau tidak, mode "pilihan"
   * disembunyikan — `admin_save_bundle` versi lama akan mengabaikan kunci
   * `slots`, jadi Steven akan menyimpan paket tanpa pilihan tanpa sadar.
   */
  canBundleChoices?: boolean;
  /** Tidak dipakai langsung di klien — dipertahankan untuk kompatibilitas pemanggil. */
  initialSettings?: StoreSettings | null;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("categories");
  const [categories, setCategories] = useState(initialCategories);
  const [flavors, setFlavors] = useState(initialFlavors);
  const [bundles, setBundles] = useState<Bundle[]>(initialBundles ?? []);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [saving, startSaving] = useTransition();

  /**
   * Data yang sedang menunggu konfirmasi hapus, atau null kalau tidak ada.
   *
   * SEBELUMNYA hapus memakai `window.confirm()`. Itu sebabnya laporan Steven
   * 12-10-2026 "menu sudah delete tapi di web ga kehapus" bisa terjadi tanpa
   * jejak apa pun: dialog browser bisa ditutup (Esc / Cancel) dan aplikasi
   * tidak memberi umpan balik apa pun, jadi PENJUAL mengira hapus sudah jalan
   * padahal tidak ada RPC yang dipanggil.
   *
   * Sekarang konfirmasi memakai `ConfirmDialog` di dalam aplikasi: selalu ada
   * teks yang menjelaskan apa yang dihapus, dan membatalkan hanya menutup
   * dialog tanpa efek.
   */
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "category"; item: Category }
    | { kind: "flavor"; item: Flavor }
    | { kind: "bundle"; item: Bundle }
    | null
  >(null);

  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingFlavor, setEditingFlavor] = useState<FlavorDraft | null>(null);
  const [editingBundle, setEditingBundle] = useState<BundleDraft | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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
      .filter(
        (c) =>
          !q ||
          c.name_id.toLowerCase().includes(q) ||
          c.name_en.toLowerCase().includes(q)
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [categories, search]);

  const filteredBundles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...bundles]
      .filter(
        (b) =>
          !q ||
          b.name_id.toLowerCase().includes(q) ||
          b.name_en.toLowerCase().includes(q)
      )
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [bundles, search]);

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
      stock_enabled: true,
      stock: 0,
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
        stock_enabled: editingCategory.stock_enabled,
        stock: editingCategory.stock,
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

  /** Buka dialog konfirmasi hapus kategori (ganti `window.confirm`). */
  function askRemoveCategory(c: Category) {
    setPendingDelete({ kind: "category", item: c });
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
      is_new: false,
      stock_enabled: true,
      stock: 0,
      sort_order: String(nextOrder),
      likes_count: 0,
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
        is_new: editingFlavor.is_new,
        stock_enabled: true,
        stock: 0,
        sort_order: Number(editingFlavor.sort_order) || 0,
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
          return {
            ...c,
            flavor_count:
              (c.flavor_count ?? 0) + (editingFlavor.id === 0 ? 1 : 0) || count,
          };
        })
      );

      toast.success(t.admin.menu.saved);
      setEditingFlavor(null);
      router.refresh();
    });
  }

  async function removeFlavor(f: Flavor) {
    setBusyId(f.id);
    const res = await deleteFlavorAction(f.id);
    setBusyId(null);

    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    if (res.data?.deactivated) {
      setFlavors((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, is_active: false } : x))
      );
      toast.warning(t.admin.menu.deactivated);
    } else {
      setFlavors((prev) => prev.filter((x) => x.id !== f.id));
      toast.success(t.admin.menu.deleted);
    }
    router.refresh();
  }

  /** Buka dialog konfirmasi hapus rasa (ganti `window.confirm`). */
  function askRemoveFlavor(f: Flavor) {
    setPendingDelete({ kind: "flavor", item: f });
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
      // WAJIB ikut mengirim: `admin_save_flavor` memakai
      // `coalesce((payload->>'is_new')::boolean, false)`, jadi kalau kunci ini
      // tidak dikirim, toggling "Tampilkan" akan DELETE label "New" yang
      // sengaja diset penjual di form flavor.
      is_new: f.is_new,
      stock_enabled: true,
      stock: 0,
      sort_order: f.sort_order,
      category_id: f.category_id,
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

  async function toggleFlavorFeatured(f: Flavor) {
    setBusyId(f.id);
    const res = await saveFlavorAction({
      id: f.id,
      name_id: f.name_id,
      name_en: f.name_en,
      desc_id: f.desc_id,
      desc_en: f.desc_en,
      price: f.price,
      image_url: f.image_url ?? "",
      is_active: f.is_active,
      is_featured: !f.is_featured,
      // Sama seperti di toggleFlavorActive: kalau `is_new` tidak ikut dikirim,
      // nyalakan/mematikan label "Favorite" akan diam-diam menghapus label
      // "New" dari produk itu.
      is_new: f.is_new,
      stock_enabled: true,
      stock: 0,
      sort_order: f.sort_order,
      category_id: f.category_id,
    });
    setBusyId(null);

    if (res.ok) {
      setFlavors((prev) =>
        prev.map((x) => (x.id === f.id ? { ...x, is_featured: !f.is_featured } : x))
      );
    } else {
      toast.error(t.errors.generic);
    }
  }

  /* ---------------- Bundle ---------------- */

  function openNewBundle() {
    const nextOrder = (bundles.at(-1)?.sort_order ?? 0) + 1;
    setEditingBundle({
      id: 0,
      category_id: null,
      category_id_str: "",
      slug: "",
      name_id: "",
      name_en: "",
      desc_id: "",
      desc_en: "",
      price: "",
      compare_price_str: "",
      required_qty: 2,
      image_url: null,
      is_active: true,
      is_featured: false,
      flavor_ids: [],
      slots: [],
      sort_order: String(nextOrder),
    });
  }

  function openEditBundle(b: Bundle) {
    setEditingBundle(toBundleDraft(b));
  }

  function saveBundle() {
    if (!editingBundle) return;
    if (editingBundle.name_id.trim().length < 2) {
      toast.warning(t.admin.menu.nameId);
      return;
    }
    const price = Number(editingBundle.price.replace(/\D/g, ""));
    if (!Number.isFinite(price) || price < 0) {
      toast.warning(t.admin.menu.priceLabel);
      return;
    }
    // Harga coret opsional: kosong = tidak ada diskon. Kalau diisi harus lebih
    // besar dari price, kalau tidak UI akan mengabaikannya.
    const rawCompare = editingBundle.compare_price_str.replace(/\D/g, "");
    const comparePrice = rawCompare ? Number(rawCompare) : null;
    if (comparePrice != null && (!Number.isFinite(comparePrice) || comparePrice <= price)) {
      toast.warning(t.admin.menu.comparePriceHint);
      return;
    }
    // Mode pilihan: setiap pilihan wajib punya minimal satu rasa, kalau tidak
    // pembeli tidak akan pernah bisa menyelesaikan paketnya. Dicek di sini
    // supaya pesan errornya tidak perlu dikirim ke server dulu.
    const pilihan = editingBundle.slots;
    if (pilihan.length > MAKS_PILIHAN) {
      toast.warning(t.admin.menu.bundleChoiceMax);
      return;
    }
    if (pilihan.some((s) => s.flavor_ids.length === 0)) {
      toast.warning(t.admin.menu.bundleChoiceMismatch);
      return;
    }

    startSaving(async () => {
      const res = await saveBundleAction({
        id: editingBundle.id || null,
        name_id: editingBundle.name_id.trim(),
        name_en: editingBundle.name_en.trim(),
        desc_id: editingBundle.desc_id.trim(),
        desc_en: editingBundle.desc_en.trim(),
        price,
        compare_price: comparePrice,
        required_qty: Math.max(1, editingBundle.required_qty),
        image_url: editingBundle.image_url ?? "",
        is_active: editingBundle.is_active,
        is_featured: editingBundle.is_featured,
        sort_order: Number(editingBundle.sort_order) || 0,
        // Kategori tidak lagi membatasi isi bundle. Penjual yang menentukan
        // lewat `flavor_ids`; daftar kosong = semua rasa boleh dipakai.
        category_id: null,
        flavor_ids: editingBundle.flavor_ids,
        is_fixed: Boolean(editingBundle.is_fixed),
        // migration-59: `slots` hanya ikut kalau paketnya mode pilihan. Kalau
        // tidak, kuncinya TIDAK dikirim sama sekali supaya `admin_save_bundle`
        // tidak menyentuh `bundle_slots` yang sudah ada. Array kosong berarti
        // sengaja kembali ke mode biasa.
        ...(pilihan.length > 0 ? { slots: pilihan } : {}),
      });

      if (!res.ok) {
        toast.error(
          res.error === "slug_taken"
            ? t.admin.menu.slugTaken
            : res.error === "invalid_bundle_fixed"
              ? t.admin.menu.bundleFixedMismatch
              : res.error === "invalid_bundle_slots"
                ? t.admin.menu.bundleChoiceMismatch
                : t.errors.generic
        );
        return;
      }

      setBundles((prev) => {
        const id = res.data!.id;
        const next: Bundle = {
          ...editingBundle,
          id,
          slug:
            editingBundle.name_id
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, ""),
          price,
          category_id: null,
          flavor_ids: editingBundle.flavor_ids,
          is_fixed: Boolean(editingBundle.is_fixed),
          slots: pilihan.map((s, i) => ({ ...s, index: i + 1 })),
          sort_order: Number(editingBundle.sort_order) || 0,
        };
        const exists = prev.some((b) => b.id === id);
        return exists
          ? prev.map((b) => (b.id === id ? { ...b, ...next } : b))
          : [...prev, next].sort((a, b) => a.sort_order - b.sort_order);
      });

      toast.success(t.admin.menu.bundleSaved);
      setEditingBundle(null);
      router.refresh();
    });
  }

  async function removeBundle(b: Bundle) {
    setBusyId(b.id);
    const res = await deleteBundleAction(b.id);
    setBusyId(null);

    if (!res.ok) {
      toast.error(t.errors.generic);
      return;
    }
    if (res.data?.deactivated) {
      setBundles((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, is_active: false } : x))
      );
      toast.warning(t.admin.menu.bundleDeactivated);
    } else {
      setBundles((prev) => prev.filter((x) => x.id !== b.id));
      toast.success(t.admin.menu.bundleDeleted);
    }
    router.refresh();
  }

  /** Buka dialog konfirmasi hapus paket (ganti `window.confirm`). */
  function askRemoveBundle(b: Bundle) {
    setPendingDelete({ kind: "bundle", item: b });
  }

  async function toggleBundleFeatured(b: Bundle) {
    setBusyId(b.id);
    const res = await saveBundleAction({
      id: b.id,
      name_id: b.name_id,
      name_en: b.name_en,
      desc_id: b.desc_id,
      desc_en: b.desc_en,
      price: b.price,
      compare_price: b.compare_price ?? null,
      required_qty: b.required_qty,
      image_url: b.image_url ?? "",
      is_active: b.is_active,
      is_featured: !b.is_featured,
      sort_order: b.sort_order,
      category_id: b.category_id,
    });
    setBusyId(null);

    if (res.ok) {
      setBundles((prev) =>
        prev.map((x) =>
          x.id === b.id ? { ...x, is_featured: !x.is_featured } : x
        )
      );
    } else {
      toast.error(t.errors.generic);
    }
  }

  async function toggleBundleActive(b: Bundle) {
    setBusyId(b.id);
    const res = await saveBundleAction({
      id: b.id,
      name_id: b.name_id,
      name_en: b.name_en,
      desc_id: b.desc_id,
      desc_en: b.desc_en,
      price: b.price,
      compare_price: b.compare_price ?? null,
      required_qty: b.required_qty,
      image_url: b.image_url ?? "",
      is_active: !b.is_active,
      is_featured: b.is_featured,
      sort_order: b.sort_order,
      category_id: b.category_id,
    });
    setBusyId(null);

    if (res.ok) {
      setBundles((prev) =>
        prev.map((x) =>
          x.id === b.id ? { ...x, is_active: !x.is_active } : x
        )
      );
      toast.success(!b.is_active ? t.admin.menu.showToast : t.admin.menu.hideToast);
    } else {
      toast.error(t.errors.generic);
    }
  }

  /* ---------------- Tampilan ---------------- */

  return (
    <div className="space-y-5">
      {/* ---------- Header + tabs ---------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.menu.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{t.admin.menu.subtitle}</p>
        </div>

        {/* Tab switcher — mobile: pill horizontal, desktop: di header */}
        <div className="flex shrink-0 gap-1 rounded-xl border border-cocoa-200 bg-cream-50 p-1">
          <button
            type="button"
            onClick={() => {
              setTab("categories");
              setActiveCategoryId(null);
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
              tab === "categories"
                ? "bg-cocoa-800 text-cream-50 shadow"
                : "text-cocoa-600 hover:bg-cocoa-100"
            }`}
          >
            <LayoutGrid className="size-4" />
            {t.admin.menu.tabCategories}
            <span className="rounded-md bg-cocoa-100/60 px-1.5 py-0.5 text-[10px] font-bold tabular text-cocoa-600">
              {categories.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("bundles")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
              tab === "bundles"
                ? "bg-cocoa-800 text-cream-50 shadow"
                : "text-cocoa-600 hover:bg-cocoa-100"
            }`}
          >
            <Gift className="size-4" />
            {t.admin.menu.tabBundles}
            <span className="rounded-md bg-cocoa-100/60 px-1.5 py-0.5 text-[10px] font-bold tabular text-cocoa-600">
              {bundles.length}
            </span>
          </button>
        </div>
      </div>

      {tab === "categories" ? (
        <CategoriesView
          {...{
            t,
            lang,
            activeCategory,
            sortedCategories,
            flavorsInCategory,
            search,
            setSearch,
            openNewCategory,
            openEditCategory,
            removeCategory: askRemoveCategory,
            setActiveCategoryId,
            openNewFlavor,
            openEditFlavor,
            removeFlavor: askRemoveFlavor,
            toggleFlavorActive,
            toggleFlavorFeatured,
            busyId,
          }}
        />
      ) : (
        <BundlesView
          {...{
            t,
            lang,
            filteredBundles,
            search,
            setSearch,
            openNewBundle,
            openEditBundle,
            removeBundle: askRemoveBundle,
            toggleBundleActive,
            toggleBundleFeatured,
            busyId,
            categories,
          }}
        />
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
          <CategoryForm
            category={editingCategory}
            setCategory={setEditingCategory}
            t={t}
          />
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
            <button
              type="button"
              onClick={saveFlavor}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t.common.saving : t.common.save}
            </button>
          </>
        }
      >
        {editingFlavor ? (
          <FlavorForm
            flavor={editingFlavor}
            setFlavor={setEditingFlavor}
            t={t}
          />
        ) : null}
      </Modal>

      {/* ---------- Modal bundle ---------- */}
      <Modal
        open={Boolean(editingBundle)}
        onClose={() => setEditingBundle(null)}
        title={editingBundle?.id ? t.admin.menu.editBundle : t.admin.menu.newBundle}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingBundle(null)}
              className="btn-ghost"
              disabled={saving}
            >
              {t.common.cancel}
            </button>
            <button
              type="button"
              onClick={saveBundle}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {saving ? t.common.saving : t.common.save}
            </button>
          </>
        }
      >
        {editingBundle ? (
          <BundleForm
            bundle={editingBundle}
            setBundle={setEditingBundle}
            categories={categories}
            flavors={flavors}
            canBundleChoices={canBundleChoices}
            t={t}
          />
        ) : null}
      </Modal>

      {/* ---------- Konfirmasi hapus (ganti window.confirm) ---------- */}
      <ConfirmDialog
        request={
          pendingDelete
            ? {
                title:
                  pendingDelete.kind === "category"
                    ? t.admin.menu.deleteCategoryConfirm
                    : pendingDelete.kind === "bundle"
                      ? t.admin.menu.deleteBundleConfirm
                      : t.admin.menu.deleteConfirm,
                body:
                  pendingDelete.kind === "category"
                    ? lang === "en"
                      ? pendingDelete.item.name_en || pendingDelete.item.name_id
                      : pendingDelete.item.name_id || pendingDelete.item.name_en
                    : pendingDelete.kind === "bundle"
                      ? lang === "en"
                        ? pendingDelete.item.name_en || pendingDelete.item.name_id
                        : pendingDelete.item.name_id || pendingDelete.item.name_en
                      : lang === "en"
                        ? pendingDelete.item.name_en || pendingDelete.item.name_id
                        : pendingDelete.item.name_id || pendingDelete.item.name_en,
              }
            : null
        }
        busy={busyId !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const req = pendingDelete;
          setPendingDelete(null);
          if (!req) return;
          if (req.kind === "category") void removeCategory(req.item);
          else if (req.kind === "flavor") void removeFlavor(req.item);
          else void removeBundle(req.item);
        }}
      />
    </div>
  );
}

/* ===========================================================================
 *  Sub-views
 * =========================================================================*/

function CategoriesView(props: {
  t: ReturnType<typeof useI18n>["t"];
  lang: ReturnType<typeof useI18n>["lang"];
  activeCategory: Category | null;
  sortedCategories: Category[];
  flavorsInCategory: Flavor[];
  search: string;
  setSearch: (s: string) => void;
  openNewCategory: () => void;
  openEditCategory: (c: Category) => void;
  removeCategory: (c: Category) => void;
  setActiveCategoryId: (id: number | null) => void;
  openNewFlavor: () => void;
  openEditFlavor: (f: Flavor) => void;
  removeFlavor: (f: Flavor) => void;
  toggleFlavorActive: (f: Flavor) => Promise<void>;
  toggleFlavorFeatured: (f: Flavor) => Promise<void>;
  busyId: number | null;
}) {
  const {
    t,
    lang,
    activeCategory,
    sortedCategories,
    flavorsInCategory,
    search,
    setSearch,
    openNewCategory,
    openEditCategory,
    removeCategory,
    setActiveCategoryId,
    openNewFlavor,
    openEditFlavor,
    removeFlavor,
    toggleFlavorActive,
    toggleFlavorFeatured,
    busyId,
  } = props;

  return (
    <>
      {/* Steven 14-10-2026 (gambar 7): "tambahkan jenis makanan buat ke kiri
          aja, karena kirinya kosong banget dan cari jenis makanan yang di
          kanan, sejajar dengan tombol tambah jenis makanan".

          Sebelumnya tombol tambah ada di kanan dan kotak cari berdiri sendiri
          di baris bawah rata kiri — jadi separuh baris kosong. Sekarang
          keduanya satu baris: tombol di kiri, cari di kanan. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {activeCategory ? (
          <button
            type="button"
            onClick={() => setActiveCategoryId(null)}
            className="btn-ghost"
          >
            <ArrowLeft className="size-4" />
            {t.admin.menu.backToCategories}
          </button>
        ) : (
          <button
            type="button"
            onClick={openNewCategory}
            className="btn-primary shrink-0"
          >
            <Plus className="size-4" />
            {t.admin.menu.addCategory}
          </button>
        )}

        {activeCategory ? (
          <button
            type="button"
            onClick={openNewFlavor}
            className="btn-primary shrink-0"
          >
            <Plus className="size-4" />
            {t.admin.menu.addFlavor}
          </button>
        ) : (
          <div className="relative w-full sm:w-auto sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
            <input
              className="input !py-2.5 pl-10"
              placeholder={t.admin.menu.searchCategory}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              type="search"
            />
          </div>
        )}
      </div>

      {!activeCategory ? (
        sortedCategories.length === 0 ? (
          <div className="card p-14 text-center">
            <LayoutGrid className="mx-auto size-8 text-cocoa-300" />
            <p className="mt-3 text-sm text-cocoa-400">{t.admin.menu.noCategory}</p>
            <button
              type="button"
              onClick={openNewCategory}
              className="btn-primary mt-5"
            >
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
                const count = c.flavor_count ?? 0;
                /* Steven 14-10-2026: "untuk visual sisa stocknya di delete aja
                   karena stock hanya bisa di set di yang batch po nnti".
                   Jadi badge "N pcs tersisa" DIHAPUS dari kartu jenis makanan.
                   Stok tetap dikelola di halaman detail batch PO. */
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
                        className={`relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl sm:size-16 ${
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
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <LayoutGrid className="size-7 text-white/70" />
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

                    {/* Aksi edit & hapus — tombol stok cepat dipindah ke halaman detail kategori */}
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
                        onClick={() => void removeCategory(c)}
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
        <FlavorList
          {...{
            t,
            lang,
            activeCategory,
            flavorsInCategory,
            openNewFlavor,
            openEditFlavor,
            removeFlavor,
            toggleFlavorActive,
            toggleFlavorFeatured,
            busyId,
          }}
        />
      )}
    </>
  );
}

function FlavorList(props: {
  t: ReturnType<typeof useI18n>["t"];
  lang: ReturnType<typeof useI18n>["lang"];
  activeCategory: Category;
  flavorsInCategory: Flavor[];
  openNewFlavor: () => void;
  openEditFlavor: (f: Flavor) => void;
  removeFlavor: (f: Flavor) => void;
  toggleFlavorActive: (f: Flavor) => Promise<void>;
  toggleFlavorFeatured: (f: Flavor) => Promise<void>;
  busyId: number | null;
}) {
  const {
    t,
    lang,
    activeCategory,
    flavorsInCategory,
    openNewFlavor,
    openEditFlavor,
    removeFlavor,
    toggleFlavorActive,
    toggleFlavorFeatured,
    busyId,
  } = props;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cocoa-200 bg-white px-4 py-3">
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
      </div>

      {flavorsInCategory.length === 0 ? (
        <div className="card p-14 text-center">
          <UtensilsCrossed className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">{t.common.empty}</p>
          <button
            type="button"
            onClick={openNewFlavor}
            className="btn-primary mt-5"
          >
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
                      f.image_url
                        ? "bg-cocoa-100"
                        : "from-cocoa-300 to-cocoa-500"
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
                      <button
                        type="button"
                        onClick={() => void toggleFlavorFeatured(f)}
                        disabled={busy}
                        title={t.admin.menu.featuredHint}
                        className={`shrink-0 rounded-md p-1 transition disabled:opacity-40 ${
                          f.is_featured
                            ? "bg-honey-300/30 text-honey-600"
                            : "text-cocoa-300 hover:bg-cocoa-100 hover:text-honey-500"
                        }`}
                      >
                        <Star
                          className={`size-3.5 ${
                            f.is_featured ? "fill-current" : ""
                          }`}
                        />
                      </button>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-cocoa-600 tabular">
                      {formatIDR(f.price, lang)}
                      {f.is_new ? (
                        <span className="rounded-full bg-honey-300/35 px-1.5 py-0.5 font-sans text-[9px] font-bold tracking-wide text-honey-700 uppercase">
                          New
                        </span>
                      ) : null}
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
                    onClick={() => void toggleFlavorActive(f)}
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
                    onClick={() => void removeFlavor(f)}
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
  );
}

function BundlesView(props: {
  t: ReturnType<typeof useI18n>["t"];
  lang: ReturnType<typeof useI18n>["lang"];
  filteredBundles: Bundle[];
  search: string;
  setSearch: (s: string) => void;
  openNewBundle: () => void;
  openEditBundle: (b: Bundle) => void;
  removeBundle: (b: Bundle) => void;
  toggleBundleActive: (b: Bundle) => Promise<void>;
  toggleBundleFeatured: (b: Bundle) => Promise<void>;
  busyId: number | null;
  categories: Category[];
}) {
  const {
    t,
    lang,
    filteredBundles,
    search,
    setSearch,
    openNewBundle,
    openEditBundle,
    removeBundle,
    toggleBundleActive,
    toggleBundleFeatured,
    busyId,
    categories,
  } = props;

  const getCategoryName = (id: number | null) => {
    if (id == null) return null;
    const c = categories.find((x) => x.id === id);
    if (!c) return null;
    return lang === "en" ? c.name_en : c.name_id;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={openNewBundle} className="btn-primary shrink-0">
          <Plus className="size-4" />
          {t.admin.menu.addBundle}
        </button>
        <div className="relative w-full sm:max-w-sm sm:w-auto">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-300" />
          <input
            className="input !py-2.5 pl-10"
            placeholder={t.admin.menu.searchBundle}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
          />
        </div>
      </div>

      <p className="text-sm text-cocoa-500">{t.admin.menu.bundleHint}</p>

      {filteredBundles.length === 0 ? (
        <div className="card p-14 text-center">
          <Gift className="mx-auto size-8 text-cocoa-300" />
          <p className="mt-3 text-sm text-cocoa-400">{t.admin.menu.noBundle}</p>
          <button type="button" onClick={openNewBundle} className="btn-primary mt-5">
            <Plus className="size-4" />
            {t.admin.menu.addBundle}
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredBundles.map((b) => {
            const busy = busyId === b.id;
            const name = lang === "en" ? b.name_en : b.name_id;
            const catName = getCategoryName(b.category_id);
            return (
              <li key={b.id} className="card overflow-hidden">
                <div className="flex gap-3.5 p-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-honey-300 to-berry-500">
                    {b.image_url ? (
                      <Image
                        src={b.image_url}
                        alt={name}
                        fill
                        sizes="80px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center text-white/70">
                        <Gift className="size-7" />
                      </span>
                    )}
                    {!b.is_active ? (
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
                      <button
                        type="button"
                        onClick={() => void toggleBundleFeatured(b)}
                        disabled={busy}
                        title={t.admin.menu.featuredHint}
                        className={`shrink-0 rounded-md p-1 transition disabled:opacity-40 ${
                          b.is_featured
                            ? "bg-honey-300/30 text-honey-600"
                            : "text-cocoa-300 hover:bg-cocoa-100 hover:text-honey-500"
                        }`}
                      >
                        <Star
                          className={`size-3.5 ${
                            b.is_featured ? "fill-current" : ""
                          }`}
                        />
                      </button>
                    </div>
                    <p className="mt-0.5 text-sm font-bold text-cocoa-600 tabular">
                      {formatIDR(b.price, lang)}
                    </p>
                    {/* Ringkasan isi paket. migration-59: kalau paketnya mode pilihan,
                        yang ditampilkan jumlah pilihan, bukan jumlah rasa. */}
                    <p className="mt-0.5 text-[11px] font-bold text-matcha-700">
                      {modeOf(b) === "choice"
                        ? `${(b.slots ?? []).length} ${t.admin.menu.bundleChoicesTitle.toLowerCase()}`
                        : b.is_fixed
                          ? t.admin.menu.bundleFixedContents
                          : `${b.required_qty}× ${t.menu.flavors}`}
                    </p>
                    {catName ? (
                      <p className="mt-0.5 truncate text-[10px] text-cocoa-400">
                        {catName}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center gap-1 border-t border-cocoa-100 bg-cocoa-50/60 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => openEditBundle(b)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100"
                  >
                    <Pencil className="size-3.5" />
                    {t.common.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleBundleActive(b)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-100 disabled:opacity-40"
                  >
                    {busy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : b.is_active ? (
                      <Eye className="size-3.5" />
                    ) : (
                      <EyeOff className="size-3.5" />
                    )}
                    {b.is_active ? t.admin.menu.active : t.admin.menu.hideToast}
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeBundle(b)}
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
  );
}

/* ===========================================================================
 *  Form fields
 * =========================================================================*/

function CategoryForm({
  category,
  setCategory,
  t,
}: {
  category: Category;
  setCategory: (next: Category | null) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name-id" className="label">
            {t.admin.menu.nameId}
          </label>
          <input
            id="c-name-id"
            className="input"
            value={category.name_id}
            onChange={(e) =>
              setCategory({ ...category, name_id: e.target.value })
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
            value={category.name_en}
            onChange={(e) =>
              setCategory({ ...category, name_en: e.target.value })
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
            value={category.desc_id}
            onChange={(e) =>
              setCategory({ ...category, desc_id: e.target.value })
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
            value={category.desc_en}
            onChange={(e) =>
              setCategory({ ...category, desc_en: e.target.value })
            }
          />
        </div>
      </div>

      <div>
        <span className="label">{t.admin.menu.image}</span>
        <ImageField
          url={category.image_url ?? ""}
          onChange={(url) =>
            setCategory({ ...category, image_url: url || null })
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
            value={category.sort_order}
            onChange={(e) =>
              setCategory({
                ...category,
                sort_order: Number(e.target.value.replace(/\D/g, "")) || 0,
              })
            }
          />
        </div>
        <div className="flex flex-col justify-end gap-3 pb-1">
          <Toggle
            checked={category.is_active}
            onChange={(v) => setCategory({ ...category, is_active: v })}
            label={t.admin.menu.active}
          />
          <Toggle
            checked={category.is_featured}
            onChange={(v) => setCategory({ ...category, is_featured: v })}
            label={t.admin.menu.favorite}
          />
        </div>
      </div>
    </div>
  );
}

function FlavorForm({
  flavor,
  setFlavor,
  t,
}: {
  flavor: FlavorDraft;
  setFlavor: (next: FlavorDraft | null) => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="f-name-id" className="label">
            {t.admin.menu.nameId}
          </label>
          <input
            id="f-name-id"
            className="input"
            value={flavor.name_id}
            onChange={(e) => setFlavor({ ...flavor, name_id: e.target.value })}
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
            value={flavor.name_en}
            onChange={(e) => setFlavor({ ...flavor, name_en: e.target.value })}
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
            value={flavor.price}
            onChange={(e) =>
              setFlavor({ ...flavor, price: e.target.value.replace(/\D/g, "") })
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
            value={flavor.desc_id}
            onChange={(e) =>
              setFlavor({ ...flavor, desc_id: e.target.value })
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
            value={flavor.desc_en}
            onChange={(e) =>
              setFlavor({ ...flavor, desc_en: e.target.value })
            }
          />
        </div>
      </div>

      <div>
        <span className="label">{t.admin.menu.image}</span>
        <ImageField
          url={flavor.image_url ?? ""}
          onChange={(url) =>
            setFlavor({ ...flavor, image_url: url || null })
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
          <label htmlFor="f-sort" className="label">
            {t.admin.menu.sortOrder}
          </label>
          <input
            id="f-sort"
            inputMode="numeric"
            className="input tabular"
            value={flavor.sort_order}
            onChange={(e) =>
              setFlavor({
                ...flavor,
                sort_order: e.target.value.replace(/\D/g, ""),
              })
            }
          />
        </div>
        <div className="flex flex-col justify-end gap-3 pb-1">
          <Toggle
            checked={flavor.is_active}
            onChange={(v) => setFlavor({ ...flavor, is_active: v })}
            label={t.admin.menu.active}
          />
          <Toggle
            checked={flavor.is_featured}
            onChange={(v) => setFlavor({ ...flavor, is_featured: v })}
            label={t.admin.menu.favorite}
          />
          {/* Label "New" untuk produk baru. Section "Menu Baru" di beranda
              diambil dari sini — dipilih PENJUAL, bukan ditebak dari tanggal. */}
          <Toggle
            checked={flavor.is_new}
            onChange={(v) => setFlavor({ ...flavor, is_new: v })}
            label={t.admin.menu.newFlag}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Tiga mode paket (Steven 15-10-2026).
 *
 *   choose  pembeli bebas pilih `required_qty` rasa dari satu daftar rata.
 *           Ini mode migration-45, paket hemat biasa.
 *   fixed   isi paket sudah ditentukan penjual (migration-54), pembeli tidak
 *           memilih apa-apa.
 *   choice  migration-59: beberapa pilihan, tiap pilihan punya daftar rasa
 *           sendiri. Pembeli ambil satu rasa per pilihan.
 *
 * Mode TIDAK disimpan sebagai boolean terpisah. `choice` aktif tepat ketika
 * `slots` tidak kosong — sama seperti di database, jadi tidak bisa meleset
 * antara apa yang tampil dan apa yang tersimpan.
 */
type BundleMode = "choose" | "fixed" | "choice";

/**
 * Mode paket, dibaca dari bentuk yang sama persis di `Bundle` dan
 * `BundleDraft`, jadi tidak perlu bikin draft cuma untuk menanyakannya.
 */
function modeOf(b: {
  slots?: BundleChoiceSlot[] | BundleChoiceDraft[];
  is_fixed?: boolean;
}): BundleMode {
  if ((b.slots?.length ?? 0) > 0) return "choice";
  return b.is_fixed ? "fixed" : "choose";
}

/** Daftar rasa baru untuk satu pilihan. Kosong = admin yang memilih. */
function pilihanBaru(nomor: number): BundleChoiceDraft {
  return {
    label_id: `Pilihan ${nomor}`,
    label_en: `Choice ${nomor}`,
    flavor_ids: [],
  };
}

/**
 * Editor kelompok pilihan (migration-59).
 *
 * Tiap baris = satu pilihan, isinya daftar rasa yang boleh dipilih untuk
 * pilihan itu. Urutan baris menentukan `slot_index` di database dan urutan
 * yang dilihat pembeli, jadi menukar urutan berarti menukar isi slot.
 */
function BundleChoicesEditor({
  bundle,
  setBundle,
  categories,
  flavors,
  t,
}: {
  bundle: BundleDraft;
  setBundle: (next: BundleDraft | null) => void;
  categories: Category[];
  flavors: Flavor[];
  t: ReturnType<typeof useI18n>["t"];
}) {
  const aktif = flavors.filter((f) => f.is_active);

  /** Ganti daftar pilihan lalu samakan jumlah slot-nya dalam satu langkah. */
  const setSlots = (slots: BundleChoiceDraft[]) =>
    setBundle({
      ...bundle,
      slots,
      // Jumlah slot selalu mengikuti jumlah pilihan. Server juga memaksa
      // ini, tapi menyinkronkan di sini supaya field "jumlah slot" langsung
      // benar tanpa harus menunggu reload.
      required_qty: Math.max(1, slots.length),
    });

  const ubahPilihan = (i: number, ubah: Partial<BundleChoiceDraft>) =>
    setSlots(bundle.slots.map((s, k) => (k === i ? { ...s, ...ubah } : s)));

  const toggleRasa = (i: number, rasaId: number) => {
    const sekarang = bundle.slots[i].flavor_ids;
    const ada = sekarang.includes(rasaId);
    ubahPilihan(i, {
      flavor_ids: ada
        ? sekarang.filter((x) => x !== rasaId)
        : [...sekarang, rasaId].sort((a, b) => a - b),
    });
  };

  return (
    <div className="rounded-xl border border-cocoa-200 bg-cocoa-50/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="label">{t.admin.menu.bundleChoicesTitle}</span>
        <button
          type="button"
          disabled={bundle.slots.length >= MAKS_PILIHAN}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-cocoa-700 underline underline-offset-2 hover:text-cocoa-900 disabled:cursor-not-allowed disabled:text-cocoa-300 disabled:no-underline"
          onClick={() => setSlots([...bundle.slots, pilihanBaru(bundle.slots.length + 1)])}
        >
          <Plus className="size-3" />
          {t.admin.menu.bundleChoiceAdd}
        </button>
      </div>

      {bundle.slots.length === 0 ? (
        <p className="text-[11px] text-cocoa-400">{t.admin.menu.bundleChoiceEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {bundle.slots.map((s, i) => {
            const dipilih = new Set(s.flavor_ids);
            const nomor = i + 1;
            return (
              <li
                key={nomor}
                className="rounded-lg border border-cocoa-200 bg-white p-3"
              >
                <div className="flex items-end gap-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[11px] font-bold text-cream-50 tabular">
                    {nomor}
                  </span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`b-choice-${nomor}`} className="label">
                      {t.admin.menu.bundleChoiceLabel}
                    </label>
                    <input
                      id={`b-choice-${nomor}`}
                      className="input"
                      maxLength={40}
                      value={s.label_id}
                      placeholder={t.admin.menu.bundleChoiceLabelDefault.replace("{n}", String(nomor))}
                      onChange={(e) => ubahPilihan(i, { label_id: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={t.admin.menu.bundleChoiceRemove}
                    title={t.admin.menu.bundleChoiceRemove}
                    disabled={bundle.slots.length <= 1}
                    className="grid size-9 shrink-0 place-items-center rounded-lg border border-cocoa-200 text-cocoa-500 transition hover:border-berry-300 hover:text-berry-600 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => setSlots(bundle.slots.filter((_, k) => k !== i))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                <div className="mt-2">
                  <label htmlFor={`b-choice-en-${nomor}`} className="label">
                    {t.admin.menu.bundleChoiceLabelEn}
                  </label>
                  <input
                    id={`b-choice-en-${nomor}`}
                    className="input"
                    maxLength={40}
                    value={s.label_en}
                    placeholder={t.admin.menu.bundleChoiceLabelDefault.replace("{n}", String(nomor))}
                    onChange={(e) => ubahPilihan(i, { label_en: e.target.value })}
                  />
                </div>

                <p className="mt-3 mb-1.5 text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {t.admin.menu.bundleChoiceFlavors}
                </p>
                {aktif.length === 0 || s.flavor_ids.length === 0 ? (
                  <p className="text-[11px] text-cocoa-400">
                    {aktif.length === 0
                      ? t.admin.menu.bundleFlavorsEmpty
                      : t.admin.menu.bundleChoiceFlavorsEmpty}
                  </p>
                ) : (
                  <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg bg-cocoa-50/60 p-2">
                    {categories.map((c) => {
                      const dalam = aktif.filter((f) => f.category_id === c.id);
                      if (dalam.length === 0) return null;
                      return (
                        <div key={c.id}>
                          <p className="mb-1 text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                            {c.name_id}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {dalam.map((f) => (
                              <button
                                key={f.id}
                                type="button"
                                aria-pressed={dipilih.has(f.id)}
                                onClick={() => toggleRasa(i, f.id)}
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                                  dipilih.has(f.id)
                                    ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                                    : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-300"
                                }`}
                              >
                                {f.name_id}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-2 text-[11px] text-cocoa-400">
        {t.admin.menu.bundleChoiceHint}
      </p>
      {bundle.slots.some((s) => s.flavor_ids.length === 0) ? (
        <p className="mt-1 text-[11px] font-semibold text-berry-600">
          {t.admin.menu.bundleChoiceMismatch}
        </p>
      ) : null}
      {bundle.slots.length >= MAKS_PILIHAN ? (
        <p className="mt-1 text-[11px] font-semibold text-berry-600">
          {t.admin.menu.bundleChoiceMax}
        </p>
      ) : null}
    </div>
  );
}

function BundleForm({
  bundle,
  setBundle,
  categories,
  flavors,
  canBundleChoices,
  t,
}: {
  bundle: BundleDraft;
  setBundle: (next: BundleDraft | null) => void;
  categories: Category[];
  flavors: Flavor[];
  /** migration-59 sudah terpasang? Kalau tidak, mode "pilihan" disembunyikan. */
  canBundleChoices: boolean;
  t: ReturnType<typeof useI18n>["t"];
}) {
  // Isi bundle = pilihan PENJUAL. Daftar kosong = semua rasa aktif boleh
  // dipakai, jadi bundle tidak lagi terkunci ke kategori tertentu.
  const picked = new Set(bundle.flavor_ids);
  const activeFlavors = flavors.filter((f) => f.is_active);
  const mode = modeOf(bundle);

  function toggleFlavor(id: number) {
    const next = new Set(bundle.flavor_ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const flavor_ids = [...next].sort((a, b) => a - b);
    setBundle({
      ...bundle,
      flavor_ids,
      // Mode combo: isi paket = daftar rasa yang dicentang, jadi jumlah slot
      // harus selalu sama dengannya. Disinkronkan di sini supaya admin tidak
      // pernah bisa menyimpan paket yang tidak bisa dibeli.
      required_qty: bundle.is_fixed ? Math.max(1, flavor_ids.length) : bundle.required_qty,
    });
  }

  /** Pindah mode paket, termasuk tiga hal yang mengikutinya. */
  function setMode(next: BundleMode) {
    if (next === mode) return;
    if (next === "choice") {
      // Mulai dari dua pilihan kosong supaya perbedaannya jelas kelihatan:
      // pembeli mengambil satu rasa dari tiap kelompok.
      const jumlah = 2;
      setBundle({
        ...bundle,
        is_fixed: false,
        slots: Array.from({ length: jumlah }, (_, i) => pilihanBaru(i + 1)),
        required_qty: jumlah,
      });
      return;
    }
    // Kembali ke mode lama: pilihan dibuang, tapi whitelist rata yang sudah
    // disimpan UTUH. Jadi Steven bisa ganti mode tanpa kehilangan pekerjaan.
    setBundle({
      ...bundle,
      is_fixed: next === "fixed",
      slots: [],
      required_qty:
        next === "fixed"
          ? Math.max(1, bundle.flavor_ids.length)
          : Math.max(1, bundle.required_qty),
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="b-name-id" className="label">
            {t.admin.menu.nameId}
          </label>
          <input
            id="b-name-id"
            className="input"
            value={bundle.name_id}
            onChange={(e) => setBundle({ ...bundle, name_id: e.target.value })}
            placeholder="Bundle 2 Sando Sandwich"
          />
        </div>
        <div>
          <label htmlFor="b-name-en" className="label">
            {t.admin.menu.nameEn}
          </label>
          <input
            id="b-name-en"
            className="input"
            value={bundle.name_en}
            onChange={(e) => setBundle({ ...bundle, name_en: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="b-price" className="label">
            {t.admin.menu.priceLabel}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-cocoa-400">
              Rp
            </span>
            <input
              id="b-price"
              inputMode="numeric"
              className="input pl-11 tabular"
              value={bundle.price}
              onChange={(e) =>
                setBundle({
                  ...bundle,
                  price: e.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="35000"
            />
          </div>
        </div>
        {/* Harga coret (opsional) — kalau diisi harus lebih besar dari harga
            jual, nanti tampil dicoret + badge diskon di kartu bundle. */}
        <div>
          <label htmlFor="b-compare-price" className="label">
            {t.admin.menu.comparePriceLabel}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-cocoa-400">
              Rp
            </span>
            <input
              id="b-compare-price"
              inputMode="numeric"
              className="input pl-11 tabular"
              value={bundle.compare_price_str}
              onChange={(e) =>
                setBundle({
                  ...bundle,
                  compare_price_str: e.target.value.replace(/\D/g, ""),
                })
              }
              placeholder="50000"
            />
          </div>
          <p className="mt-1 text-[11px] text-cocoa-400">
            {t.admin.menu.comparePriceHint}
          </p>
        </div>
        <div>
          <label htmlFor="b-qty" className="label">
            {mode === "fixed" ? t.admin.menu.bundleFixedCount : t.admin.menu.bundleSlots}
          </label>
          <input
            id="b-qty"
            inputMode="numeric"
            className="input tabular"
            // (migration-54) Mode combo: jumlah slot = jumlah rasa yang
            // dicentang. (migration-59) Mode pilihan: jumlah slot = jumlah
            // pilihan. Dua-duanya hanya menampilkan, bukan mengetik, jadi
            // angka yang tampil tidak mungkin berbeda dengan yang tersimpan.
            readOnly={mode !== "choose"}
            value={bundle.required_qty}
            onChange={(e) =>
              setBundle({
                ...bundle,
                required_qty: Math.max(
                  1,
                  Number(e.target.value.replace(/\D/g, "")) || 1
                ),
              })
            }
          />
          {mode === "fixed" ? (
            <p className="mt-1 text-[11px] text-cocoa-400">
              {t.admin.menu.bundleFixedCountHint}
            </p>
          ) : mode === "choice" ? (
            <p className="mt-1 text-[11px] text-cocoa-400">
              {t.admin.menu.bundleChoiceCountHint}
            </p>
          ) : null}
        </div>
      </div>

      {/* Tiga mode paket. Steven 15-10-2026:
          "bundle combo strawberry dan choco matcha, maka langsung itu yang
          terpilih" (fixed) vs "beli 2 lebih gratis dan mereka bisa pilih
          rasanya sendiri" (choose) vs "pilihan 1 antara apa aja lalu pilihan 2
          apa aja" (choice). */}
      <div className="rounded-xl border border-cocoa-200 bg-cocoa-50/40 p-3">
        <p className="mb-2 text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
          {t.admin.menu.bundleModeLabel}
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { key: "choose", title: t.admin.menu.bundleModeChoose, desc: t.admin.menu.bundleModeChooseDesc },
              { key: "choice", title: t.admin.menu.bundleModeChoice, desc: t.admin.menu.bundleModeChoiceDesc },
              { key: "fixed", title: t.admin.menu.bundleModeFixed, desc: t.admin.menu.bundleModeFixedDesc },
            ] as const
          )
            // Mode "pilihan" hanya ditampilkan kalau migration-59 sudah
            // terpasang. Kalau tidak, RPC lama diam-diam membuang kunci
            // `slots` dan Steven akan mengira pilihannya tersimpan.
            .filter((opt) => opt.key !== "choice" || canBundleChoices)
            .map((opt) => {
            const active = mode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => setMode(opt.key)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                    : "border-cocoa-200 bg-white hover:border-cocoa-300"
                }`}
              >
                <p className="text-[13px] font-bold">{opt.title}</p>
                <p className={`mt-0.5 text-[11px] ${active ? "text-cream-200" : "text-cocoa-500"}`}>
                  {opt.desc}
                </p>
              </button>
            );
          })}
        </div>
        {mode === "fixed" && bundle.flavor_ids.length !== bundle.required_qty ? (
          <p className="mt-2 text-[11px] font-semibold text-berry-600">
            {t.admin.menu.bundleFixedMismatch}
          </p>
        ) : null}
      </div>

      {/* (migration-59) Mode PILIHAN. Daftar rasa rata di bawah disembunyikan
          sepenuhnya: yang berlaku cuma daftar per pilihan. */}
      {mode === "choice" ? (
        <BundleChoicesEditor
          bundle={bundle}
          setBundle={setBundle}
          categories={categories}
          flavors={flavors}
          t={t}
        />
      ) : (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="label">
              {mode === "fixed" ? t.admin.menu.bundleFixedContents : t.admin.menu.bundleFlavors}
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                className="text-[11px] font-semibold text-cocoa-600 underline underline-offset-2 hover:text-cocoa-900"
                onClick={() =>
                  setBundle({
                    ...bundle,
                    flavor_ids: activeFlavors.map((f) => f.id),
                    required_qty: mode === "fixed"
                      ? Math.max(1, activeFlavors.length)
                      : bundle.required_qty,
                  })
                }
              >
                {t.admin.menu.bundleFlavorsAll}
              </button>
              <button
                type="button"
                className="text-[11px] font-semibold text-cocoa-600 underline underline-offset-2 hover:text-cocoa-900"
                onClick={() =>
                  setBundle({
                    ...bundle,
                    flavor_ids: [],
                    // Mode combo tidak boleh kosong: daftar rasa adalah isi
                    // paket, jadi minimal satu rasa wajib dicentang.
                    required_qty: mode === "fixed" ? 1 : bundle.required_qty,
                  })
                }
              >
                {t.admin.menu.bundleFlavorsClear}
              </button>
            </div>
          </div>

          {activeFlavors.length === 0 ? (
            <p className="text-[11px] text-cocoa-400">{t.admin.menu.bundleFlavorsEmpty}</p>
          ) : (
            <div className="mt-2 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-cocoa-200 bg-cocoa-50/40 p-3">
              {categories.map((c) => {
                const inCat = activeFlavors.filter((f) => f.category_id === c.id);
                if (inCat.length === 0) return null;
                return (
                  <div key={c.id}>
                    <p className="mb-1.5 text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {c.name_id}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {inCat.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          aria-pressed={picked.has(f.id)}
                          onClick={() => toggleFlavor(f.id)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            picked.has(f.id)
                              ? "border-cocoa-800 bg-cocoa-800 text-cream-50"
                              : "border-cocoa-200 bg-white text-cocoa-600 hover:border-cocoa-300"
                          }`}
                        >
                          {f.name_id}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <p className="mt-1 text-[11px] text-cocoa-400">
            {mode === "fixed"
              ? bundle.flavor_ids.length === 0
                ? t.admin.menu.bundleFixedEmpty
                : t.admin.menu.bundleFixedHint
              : bundle.flavor_ids.length === 0
                ? t.admin.menu.bundleFlavorsHintAll
                : t.admin.menu.bundleFlavorsHint}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="b-desc-id" className="label">
            {t.admin.menu.descId}
          </label>
          <textarea
            id="b-desc-id"
            rows={2}
            className="input resize-none"
            value={bundle.desc_id}
            onChange={(e) =>
              setBundle({ ...bundle, desc_id: e.target.value })
            }
          />
        </div>
        <div>
          <label htmlFor="b-desc-en" className="label">
            {t.admin.menu.descEn}
          </label>
          <textarea
            id="b-desc-en"
            rows={2}
            className="input resize-none"
            value={bundle.desc_en}
            onChange={(e) =>
              setBundle({ ...bundle, desc_en: e.target.value })
            }
          />
        </div>
      </div>

      <div>
        <span className="label">{t.admin.menu.image}</span>
        <ImageField
          url={bundle.image_url ?? ""}
          onChange={(url) => setBundle({ ...bundle, image_url: url || null })}
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
          <label htmlFor="b-sort" className="label">
            {t.admin.menu.sortOrder}
          </label>
          <input
            id="b-sort"
            inputMode="numeric"
            className="input tabular"
            value={bundle.sort_order}
            onChange={(e) =>
              setBundle({
                ...bundle,
                sort_order: e.target.value.replace(/\D/g, ""),
              })
            }
          />
        </div>
        <div className="flex flex-col justify-end gap-3 pb-1">
          <Toggle
            checked={bundle.is_active}
            onChange={(v) => setBundle({ ...bundle, is_active: v })}
            label={t.admin.menu.active}
          />
          <Toggle
            checked={bundle.is_featured}
            onChange={(v) => setBundle({ ...bundle, is_featured: v })}
            label={t.admin.menu.favorite}
          />
        </div>
      </div>
    </div>
  );
}

/* ---------- komponen kecil ---------- */

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