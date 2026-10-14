"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bike,
  Building2,
  CalendarDays,
  Check,
  Copy,
  Loader2,
  MapPin,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import type {
  Bundle,
  CartLine,
  Category,
  CustomerProfile,
  DeliveryZone,
  Language,
  StoreSettings,
} from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { ProofUploader } from "@/components/customer/ProofUploader";
import { OrderMenuBrowser } from "@/components/customer/MenuBrowser";
import { AddressPicker } from "@/components/customer/AddressPicker";
import { QrisPaymentModal } from "@/components/customer/QrisPaymentModal";
import { useCustomerAuth } from "@/components/customer/CustomerAuthProvider";
import {
  formatIDR,
  formatPhone,
  formatPickupDate,
  resolveShipping,
  saveInvoice,
} from "@/lib/utils";
import type { ShippingQuote } from "@/lib/utils";
import { fetchBatchForDate, type PoBatchStock, type PoPickupDate } from "@/lib/po";

/**
 * Batch PO menentukan tanggal ambil, jadi langkah "pilih tanggal" harus
 * ada SEBELUM pembeli isi identitas — begitu begitu tanggal dipilih, stok
 * yang tampil di langkah "Pilih Rasa" langsung mengikuti batch tanggal itu.
 *
 * Kalau admin belum membuat batch yang sedang dibuka, langkah tanggal
 * DIHILANGKAN dan pembeli tetap bisa memesan dengan mode lama (stok dari
 * `categories.stock`). Ini yang membuat migrasi tidak membrikkan toko.
 */
const FULL_STEPS = ["date", "identity", "menu", "payment", "review"] as const;
const LOGGED_IN_STEPS = ["date", "menu", "payment", "review"] as const;
const NO_PO_FULL_STEPS = ["identity", "menu", "payment", "review"] as const;
const NO_PO_LOGGED_IN_STEPS = ["menu", "payment", "review"] as const;
type Step = (typeof FULL_STEPS)[number];

/**
 * Lebar kolom harga di langkah konfirmasi.
 *
 * Steven 14-10-2026 (gambar bill): semua nominal harus rata di tepi kanan
 * yang SAMA — dari item, subtotal, ongkir, sampai total. Kalau price-nya cuma
 * `shrink-0` di dalam `justify-between`, tepi kanannya ikut berubah-ubah
 * sesuai panjang teks ("Rp 36.000" lebih lebar dari "Rp 8.000").
 *
 * Karena itu semua harga memakai kelas yang sama: lebar tetap + rata kanan +
 * angka tabular. Satu kelas = satu kolom = struk yang rapi.
 */
const PRICE_COL = "w-28 shrink-0 text-right tabular";
/** Step list untuk user yang sudah login + profile lengkap — skip identity.
 *  Guest (= tanpa profile) tetap melewati identity dulu.
 *  `hasPo` = ada batch yang sedang dibuka, jadi langkah tanggal ditampilkan. */
function stepsFor(profileComplete: boolean, hasPo: boolean): readonly Step[] {
  if (hasPo) return profileComplete ? LOGGED_IN_STEPS : FULL_STEPS;
  return profileComplete ? NO_PO_LOGGED_IN_STEPS : NO_PO_FULL_STEPS;
}

/**
 * Baca langkah tersimpan dari sessionStorage.
 *
 * Dipisah sebagai fungsi modul-level supaya `getSnapshot` mengembalikan
 * nilai primitif yang stabil — `useSyncExternalStore` akan loop takFinite
 * kalau snapshot-nya objek baru setiap panggilan.
 */
function readOrderStep(steps: readonly Step[]): Step {
  if (typeof window === "undefined") return steps[0];
  try {
    const saved = sessionStorage.getItem("js_order_step") as Step | null;
    if (saved && steps.includes(saved)) return saved;
  } catch {
    // Mode privat / storage diblokir — pakai langkah pertama.
  }
  return steps[0];
}

/**
 * Subscribe no-op: sessionStorage hanya dibaca satu kali saat mount, tidak
 * ada sumber daya eksternal yang perlu dipantau. Yang penting dari argumen
 * subscribe ini adalah mengembalikan fungsi unsubscribe.
 */
function subscribeOrderStep(): () => void {
  return () => {};
}

/**
 * Tanggal ambil yang dipilih, disimpan di sessionStorage.
 *
 * Tanpa ini, refresh di tengah alur menghapus pilihan tanggal — pembeli
 * yang sudah jauh di langkah "Pilih Rasa" tiba-tiba diminta memilih ulang,
 * dan `poBatch` ikut jadi null sehingga angka stok yang tampil balik ke
 * `categories.stock`. Kuncinya dihapus hanya setelah pesanan berhasil dikirim
 * (lihat `clearOrderSession`) — bukan saat halaman ditinggalkan, supaya
 * pindah halaman tidak menghapus apa pun.
 */
const PO_DATE_KEY = "js_po_pickup_date";

function readPoDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(PO_DATE_KEY);
    return saved && /^\d{4}-\d{2}-\d{2}$/.test(saved) ? saved : null;
  } catch {
    return null;
  }
}

function writePoDate(value: string | null) {
  try {
    if (value) sessionStorage.setItem(PO_DATE_KEY, value);
    else sessionStorage.removeItem(PO_DATE_KEY);
  } catch {
    // Mode privat / storage diblokir — pilihan tetap jalan di state.
  }
}

/**
 * Bersihkan seluruh sisa alur pre-order di sessionStorage.
 *
 * Dipanggil HANYA setelah pesanan berhasil dikirim. Efek unmout yang dulu
 * membersihkannya saat pindah halaman sudah dihapus (permintaan Steven), jadi
 * tanpa fungsi ini `js_order_step` akan tetap menunjuk ke langkah terakhir —
 * pembeli yang balik ke /order setelah pesanannya masuk akan menemukan
 * keranjang kosong tapi sudah di langkah "Konfirmasi", dan tidak bisa mundur
 * karena `goTo` hanya maju dari langkah saat ini.
 */
function clearOrderSession() {
  try {
    sessionStorage.removeItem("js_order_step");
    sessionStorage.removeItem(PO_DATE_KEY);
  } catch {
    // Mode privat / storage diblokir — tidak ada yang perlu dibersihkan.
  }
}

/**
 * Subscribe no-op: sessionStorage hanya dibaca, tidak ada sumber daya
 * eksternal yang perlu dipantau. Yang penting dari argumen ini adalah
 * mengembalikan fungsi unsubscribe.
 */
function subscribePoDate(): () => void {
  return () => {};
}

/**
 * Tanggal ambil tersimpan, atau `null`.
 *
 * Snapshot server sengaja `null`: kalau server membaca sessionStorage,
 * render pertama di server dan di browser berbeda dan React membuang
 * seluruh tree (hydration error). Pola `useSyncExternalStore` yang sama
 * dipakai `readOrderStep` aman karena React memakai `getServerSnapshot`
 * saat render server maupun hydration, dan baru membandingkan dengan
 * snapshot klien SETELAH selesai.
 *
 * Tanggal yang tersimpan tapi sudah tidak ada di `poDates` (admin menutup
 * batch-nya) dianggap tidak ada — jangan Offer pilihan yang tak bisa
 * dipesan.
 */
function readPoDateSnapshot(active: readonly PoPickupDate[]): () => string | null {
  return () => {
    const saved = readPoDate();
    if (!saved) return null;
    return active.some((d) => d.pickupDate === saved) ? saved : null;
  };
}
function serverPoDateSnapshot(): string | null {
  return null;
}

/** True kalau customer sudah punya profile lengkap (boleh skip identity).
 *  profile lengkap = user_id + full_name + phone. Saat signup via /register
 *  ketiga field ini wajib diisi, jadi user yang berhasil register = profile
 *  lengkap = bisa skip identity di OrderFlow. */
const isProfileComplete = (p: CustomerProfile | null | undefined) =>
  !!(p?.user_id && p.full_name && p.phone);



/**
 * Baris Potongan ongkir + petunjuk tier berikutnya.
 *
 * Hanya dirender kalau zona yang dipilih punya aturan diskon (lihat
 * `DeliveryZone.shipping_discounts`, migration-46). Kalau belum ada tier yang
 * terlampaui, yang muncul cuma petunjuk supaya pembeli tahu kalau belanja
 * sedikit lagi bisa gratis ongkir.
 */
function ShippingDiscountRows({
  shipping,
  subtotal,
  t,
  lang,
}: {
  shipping: ShippingQuote;
  subtotal: number;
  t: ReturnType<typeof useI18n>["t"];
  lang: Language;
}) {
  const { percent, discount, hitMin, next } = shipping;
  const hasTier = percent > 0 || Boolean(next);

  if (!hasTier) return null;

  return (
    <>
      {percent > 0 ? (
        <div className="mt-1 flex justify-between text-sm font-bold text-matcha-600">
          <span>{t.order.review.shippingDiscount}</span>
          <span className="tabular">−{formatIDR(discount, lang)}</span>
        </div>
      ) : null}
      {percent > 0 && hitMin ? (
        <p className="mt-0.5 text-right text-[11px] text-matcha-600/80">
          {t.order.review.shippingDiscountNote
            .replace("{pct}", String(percent))
            .replace("{min}", formatIDR(hitMin, lang))}
        </p>
      ) : null}
      {next ? (
        <p className="mt-0.5 text-right text-[11px] text-cocoa-500">
          {t.order.review.shippingTierHint.replace(
            "{amount}",
            formatIDR(Math.max(0, next.min - subtotal), lang)
          )}
        </p>
      ) : null}
    </>
  );
}

export function OrderFlow({
  categories,
  bundles = [],
  settings,
  deliveryZones,
  midtransReady = false,
  poDates,
}: {
  categories: Category[];
  /** Bundle berdiri sendiri / per-kategori yang dijual. */
  bundles?: Bundle[];
  settings: StoreSettings;
  /** Daftar zona delivery (server-fetched). */
  deliveryZones: DeliveryZone[];
  /** True kalau MIDTRANS_SERVER_KEY sudah di-set. Dikirim dari server
   *  component (page.tsx) supaya kita tidak perlu expose env ke client. */
  midtransReady?: boolean;
  /** Tanggal pengambilan yang sedang dibuka (server-fetched). Kosong =
   *  belum ada batch, pembeli pesan dengan mode lama. */
  poDates: PoPickupDate[];
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const { profile } = useCustomerAuth();
  const {
    quantities,
    notes,
    bundles: cartBundles,
    draft,
    totalItems,
    updateDraft,
    reset,
  } = useCart();

  // CATATAN: dulu ada efek `pagehide` + unmount yang memanggil
  // `clearIdentity()` supaya nama/telepon tidak tertinggal di browser. Efek itu
  // sekarang DIHAPUS, karena bertentangan dengan permintaan Steven (pindah
  // halaman tidak boleh menghapus apa pun).
  //
  // Kalau tetap ada, hasilnya setengah-setengah dan membingungkan: langkah dan
  // keranjang balik ke posisi sebelumnya, tapi kolom nama/telepon kosong — jadi
  // pembeli harus isi ulang padahal ia cuma mampir ke beranda sebentar.
  //
  // Data identitas sekarang ikut bertahan bersama draft sampai pesanan berhasil
  // dikirim, saat `reset()` mengosongkan `draft` sekaligus (lihat
  // `handleSubmit`). Kalau nanti Steven mau identitas dihapus tapi keranjang
  // tetap, itu cukup panggil `clearIdentity()` di `handleSubmit` sebelum
  // `reset()` — bukan di sini.

  // Profil lengkap? Skip identity step — auto-fill dari profil, langsung
  // ke menu. Kalau belum lengkap (guest / OAuth tanpa phone), tetap
  // melalui identity dulu.
  const profileComplete = isProfileComplete(profile);
  const hasPo = poDates.length > 0;
  const steps = useMemo(
    () => stepsFor(profileComplete, hasPo),
    [profileComplete, hasPo]
  );

  // Catatan: useState initial hanya jalan sekali, jadi user yang logout
  // setelah halaman dimuat akan tetap di step dia sekarang sampai dia
  // refresh. Itu acceptable — Guest UX di tengah flow = friction.
  //
  // PENTING: langkah TIDAK boleh dibaca dari sessionStorage saat render
  // pertama. Server selalu render `steps[0]`, sementara klien akan me-restore
  // langkah tersimpan (mis. "menu") — dua render itu beda dan memicu:
  //   "Hydration failed because the server rendered text didn't match the
  //    client" → React buang seluruh tree & render ulang (kedip + lambat).
  // Itu terjadi setiap kali pembeli me-refresh di tengah alur pesanan.
  //
  // `useSyncExternalStore` (pola yang sama dipakai `CartProvider`) aman untuk
  // ini: React memakai `getServerSnapshot` baik saat render server maupun saat
  // hydration, dan HANYA membandingkan dengan `getSnapshot` sisi klien
  // SETELAH hydration selesai. Jadi tidak ada mismatch, dan langkah
  // tersimpan tetap dipulihkan.
  const stepFromStorage = useSyncExternalStore(
    subscribeOrderStep,
    () => readOrderStep(steps),
    () => steps[0]
  );

  // Navigasi manual menimpa nilai yang dibaca dari storage. Sekali user
  // menekan tombol, storage bukan lagi sumber kebenaran untuk sesi ini.
  const [stepOverride, setStepOverride] = useState<Step | null>(null);
  // `steps` bisa berubah saat komponen hidup (mis. batch PO ditutup admin),
  // jadi langkah yang tersimpan harus divalidasi lagi. Tanpa ini
  // `steps.indexOf(step)` = -1 dan seluruh progress bar salah.
  const stepCandidate = (stepOverride ?? stepFromStorage) as Step;
  const step = steps.includes(stepCandidate) ? stepCandidate : steps[0];
  const setStep = useCallback((target: Step) => {
    setStepOverride(target);
  }, []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [soldCounts, setSoldCounts] = useState<Record<number, number>>({});
  /** Payload untuk QrisPaymentModal — diset saat user submit dengan
   *  paymentMethod=qris_midtrans. Modal akan generate QR via Midtrans. */
  const [qrisPayload, setQrisPayload] = useState<Record<string, unknown> | null>(null);
  const [qrisModalOpen, setQrisModalOpen] = useState(false);

  /* ---------------- Batch pre-order (PO) ---------------- */
  // Tanggal yang dipilih pembeli (`YYYY-MM-DD`) + batch yang dipakai untuk
  // tanggal itu. Batch diambil ulang setiap kali tanggal berubah, jadi
  // `stokPerBatch` selalu sesuai tanggal aktif — bukan batch lama yang
  // sudah ditutup admin.
  // Hanya baca yang sudah pernah dipilih DAN masih ada di daftar tanggal
  // aktif. Kalau admin menutup batch-nya, tanggal lama diabaikan.
  //
  // `restoredPoDate` = hasil baca sessionStorage (null saat render server,
  // nilai sebenarnya setelah hydration). `chosenDate` = pilihan yang
  // dibuat pembeli di sesi ini, yang lebih baru kalau ada.
  const restoredPoDate = useSyncExternalStore(
    subscribePoDate,
    readPoDateSnapshot(poDates),
    serverPoDateSnapshot
  );
  const [chosenDate, setChosenDate] = useState<string | null>(null);
  const pickupDate = chosenDate ?? restoredPoDate;
  const [poBatch, setPoBatch] = useState<PoBatchStock | null>(null);
  const [poLoading, setPoLoading] = useState(false);
  /* Popup detail lokasi. Steven 13-10-2026: baik "Ambil di Toko" maupun
     "Diantar" harus membuka popup lokasi, karena titik dan jam ambil
     ditentukan admin dan pembeli perlu tahu sebelum konfirmasi. */
  const [locationPopup, setLocationPopup] = useState<DeliveryZone | null>(null);
  // Popup PEMILIHAN toko untuk metode "Ambil di toko" (Steven 14-10-2026).
  const [pickupPickerOpen, setPickupPickerOpen] = useState(false);

  // Mengganti tanggal membuang batch lama seketika, supaya selama RPC
  // berjalan tidak ada satu frame pun yang memakai stok batch yang salah.
  const selectPickupDate = useCallback((date: string | null) => {
    setPoBatch(null);
    setPoLoading(date !== null);
    setChosenDate(date);
    writePoDate(date);
  }, []);

  useEffect(() => {
    if (!pickupDate) return;
    let cancelled = false;
    void (async () => {
      const batch = await fetchBatchForDate(pickupDate);
      if (cancelled) return;
      setPoLoading(false);
      if (!batch) {
        // Batch-nya sudah tidak berlaku (ditutup admin di tengah pembeli
        // memilih). Paksa pilih ulang daripada lanjut dengan stok yang
        // sudah tidak bisa dipesan.
        selectPickupDate(null);
        toast.error(t.order.date.unavailable);
        goTo("date");
        return;
      }
      setPoBatch(batch);
    })();
    return () => {
      cancelled = true;
    };
    // `toast` & `goTo` sengaja tidak masuk dependencies: keduanya dibuat
    // ulang tiap render, dan `goTo` menulis sessionStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupDate, selectPickupDate]);

  // Tarik counter 'terjual' per-flavor saat halaman dibuka.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("public_flavor_sold_counts");
      if (cancelled || !Array.isArray(data)) return;
      const m: Record<number, number> = {};
      for (const row of data as Array<{ flavor_id: number; qty: number }>) {
        m[row.flavor_id] = row.qty;
      }
      setSoldCounts(m);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-fill identitas dari profil customer (kalau login). Hanya jalan
  // sekali — kalau user sudah sempat ganti value di form, kita hormati
  // inputnya. Ref `autoFilledFrom` menandai sudah auto-fill di-this-account
  // supaya tidak overwrite perubahan manual.
  const autoFilledFromRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profile) return;
    if (autoFilledFromRef.current === profile.user_id) return;
    // Hanya auto-fill field yang masih kosong — biar perubahan manual
    // dari user (mis. update nomor telepon di akun yang sama) tidak hilang.
    const patch: Partial<typeof draft> = {};
    if (!draft.name.trim() && profile.full_name) patch.name = profile.full_name;
    if (!draft.phone.trim() && profile.phone) patch.phone = profile.phone;
    if (!draft.email.trim() && profile.email) patch.email = profile.email;
    if (!draft.instagram.trim() && profile.instagram) {
      patch.instagram = profile.instagram;
    }
    if (Object.keys(patch).length > 0) {
      updateDraft(patch);
    }
    autoFilledFromRef.current = profile.user_id;
  }, [profile, draft.name, draft.phone, draft.email, draft.instagram, updateDraft]);

  // Stok per-kategori — total pcs dari kategori ini tidak boleh
  // melebihi sisa stok kategori. Bundle dihitung dari slot yang dipilih
  // (tiap slot = 1 pcs fisik, dari kategori bundle atau bebas kalau
  // bundle berdiri sendiri).
  //
  // Kalau pembeli sudah memilih tanggal ambil, sumber stoknya adalah batch
  // PO tanggal itu — bukan `categories.stock`. Fallback ke `categories.stock`
  // kalau batch belum selesai dimuat atau kategori tidak ada di batch.
  const stockByCategory = useMemo(() => {
    const m = new Map<number, { enabled: boolean; left: number }>();
    const override = poBatch?.stockByCategory ?? null;
    for (const c of categories) {
      const fromBatch = override?.has(c.id) ? override.get(c.id)! : null;
      m.set(c.id, {
        enabled: fromBatch != null ? true : c.stock_enabled,
        left: Math.max(0, fromBatch ?? c.stock ?? 0),
      });
    }
    return m;
  }, [categories, poBatch]);

  // Bundle yang boleh dibeli di batch yang dipilih (migration-52).
  //
  // `poBatch.bundles === null` berarti Steven belum pernah menyet bundle untuk
  // batch ini, jadi semua bundle aktif tetap boleh (mode lama). Kalau sudah
  // diset, hanya bundle di daftar itu yang muncul — dan harganya pakai harga
  // batch kalau Steven mengisinya.
  const visibleBundles = useMemo(() => {
    const allowed = poBatch?.bundles ?? null;
    if (allowed === null) return bundles;
    const priceById = new Map(allowed.map((b) => [b.bundleId, b.price]));
    return bundles
      .filter((b) => priceById.has(b.id))
      .map((b) => ({ ...b, price: priceById.get(b.id) ?? b.price }));
  }, [bundles, poBatch]);

  // Rasa yang boleh dibeli di batch yang dipilih (migration-53).
  //
  // `poBatch.flavors === null` berarti Steven belum pernah menyaring rasa,
  // jadi semua rasa aktif tetap tampil (mode lama, sama seperti bundle). Kalau
  // sudah diset, HANYA rasa di daftar itu yang terlihat.
  //
  // Kategori yang filters-nya kosong DIHILANGKAN juga — kategori dengan nol rasa
  // tidak akan menampilkan apa-apa dan cuma bikin pembeli bingung.
  const batchFlavorAllowlist = poBatch?.flavors ?? null;
  const visibleCategories = useMemo(() => {
    if (batchFlavorAllowlist === null) return categories;
    return categories
      .map((c) => ({
        ...c,
        flavors: (c.flavors ?? []).filter((f) => batchFlavorAllowlist.has(f.id)),
      }))
      .filter((c) => (c.flavors?.length ?? 0) > 0);
  }, [categories, batchFlavorAllowlist]);

  // Semua rasa dikumpulkan dari kategori yang TAMPIL (setelah penyaringan).
  const flavors = useMemo(
    () => visibleCategories.flatMap((c) => c.flavors ?? []),
    [visibleCategories]
  );
  const flavorById = useMemo(() => new Map(flavors.map((f) => [f.id, f])), [flavors]);

  const cartLines = useMemo<CartLine[]>(() => {
    const out: CartLine[] = [];
    for (const [id, qty] of Object.entries(quantities)) {
      const flavor = flavorById.get(Number(id));
      if (flavor && qty > 0) out.push({ flavor, qty });
    }
    return out;
  }, [quantities, flavorById]);

  // Kelompokkan baris keranjang per JENIS MAKANAN untuk tampilan ringkasan.
  // Subtotal = harga satuan * qty (tanpa paket otomatis). Bundle dihitung
  // sebagai 1 baris di kategori bundle (kalau terkait kategori) atau di
  // grup khusus "Bundle berdiri sendiri".
  const groups = useMemo(() => {
    const byCategory = new Map<number, { category: Category | null; lines: CartLine[] }>();

    for (const line of cartLines) {
      const cat = categories.find((c) => c.id === line.flavor.category_id) ?? null;
      const key = cat?.id ?? -line.flavor.id;
      const prev = byCategory.get(key);
      byCategory.set(key, {
        category: cat,
        lines: prev ? [...prev.lines, line] : [line],
      });
    }

    return [...byCategory.values()].map(({ category, lines: ls }) => {
      const qty = ls.reduce((s, l) => s + l.qty, 0);
      const total = ls.reduce((s, l) => s + l.flavor.price * l.qty, 0);
      return { category, lines: ls, qty, total };
    });
  }, [cartLines, categories]);

  // Group khusus bundle — dikelompokkan per bundle.id (bukan kategori)
  // supaya di review step kita bisa menampilkan "Bundle A x 2, Bundle B x 1".
  const bundleGroups = useMemo(() => {
    const m = new Map<number, { bundle: Bundle; entries: typeof cartBundles; count: number }>();
    for (const entry of cartBundles) {
      const prev = m.get(entry.bundle.id);
      if (prev) {
        prev.entries.push(entry);
        prev.count += 1;
      } else {
        m.set(entry.bundle.id, { bundle: entry.bundle, entries: [entry], count: 1 });
      }
    }
    return [...m.values()];
  }, [cartBundles]);

  // Subtotal item satuan + bundle.
  const subtotalFromItems = groups.reduce((sum, g) => sum + g.total, 0);
  const subtotalFromBundles = bundleGroups.reduce(
    (sum, bg) => sum + bg.bundle.price * bg.count,
    0
  );
  const subtotal = subtotalFromItems + subtotalFromBundles;
  const saving = 0;

  // Total pcs yang dihitung terhadap stok per-kategori: item satuan + slot
  // bundle (tiap slot = 1 pcs). Bundle berdiri sendiri dengan flavor
  // dari kategori tertentu akan menambah ke kategori flavor tsb.
  const stockContribution = useMemo(() => {
    // key: categoryId -> total pcs
    const m = new Map<number, number>();
    for (const line of cartLines) {
      if (line.flavor.category_id == null) continue;
      m.set(line.flavor.category_id, (m.get(line.flavor.category_id) ?? 0) + line.qty);
    }
    for (const entry of cartBundles) {
      // Tentukan kategori tiap slot dari flavor. Bundle terkait kategori
      // memaksa semua slot dari kategori itu; bundle berdiri sendiri
      // mengikuti flavor masing-masing.
      for (const flavorId of entry.slots) {
        if (flavorId == null) continue;
        const line = cartLines.find((l) => l.flavor.id === flavorId);
        // Kita tidak tahu flavor di sini (cuma id), ambil dari categories.
        // Cari di categories[].flavors[].
        let foundCategoryId: number | null = null;
        for (const c of categories) {
          if ((c.flavors ?? []).some((f) => f.id === flavorId)) {
            foundCategoryId = c.id;
            break;
          }
        }
        if (foundCategoryId == null) continue;
        m.set(foundCategoryId, (m.get(foundCategoryId) ?? 0) + 1);
        // line sengaja tidak dipakai — hanya untuk men-suppress unused warning.
        void line;
      }
    }
    return m;
  }, [cartLines, cartBundles, categories]);

  // Ongkir dari zona delivery (kalau pickup / kurir = 0).
  //
  // "Pesan Kurir" = pembeli sendiri yang memesan armada (GoSend/Grab),
  // jadi ongkir ditanggung pembeli dan tidak ada ongkir yang kita tagih.
  /* Steven 14-10-2026 (gambar 3): "sbnrnya maksud saya pop up bukan begitu,
       tapi misal saat mereka pilih ambil ditoko ada baru pilihan popup untuk
       memilih mau ambilnya di toko mana".

       Popup yang dulu muncul cuma DETAIL toko yang otomatis terpilih — jadi
       pembeli tidak pernah bisa memilih. Sekarang: klik "Ambil di toko" ->
       muncul popup DAFTAR toko, pembeli yang memilih. Kalau admin belum
       menandai titik pengambilan sama sekali, popup menjelaskan itu (tidak
       diam-diam crashes atau selecting "pickup" palsu).

       Titik pengambilan ini bersumber dari `delivery_zones` yang kind-nya
       'pickup' — datanya sudah ada, ditata dari admin "Ambil & Kirim", jadi
       tidak perlu tabel toko baru untuk sekarang. Nanti kalau daftar toko
       tumbuh jadi datastore sendiri, tinggal ganti sumber `pickupZones`. */
  const onPickupClick = () => {
    updateDraft({ deliveryMethod: "pickup", address: "", addressNote: "", lat: null, lng: null });
    // Kalau cuma ada satu titik pengambilan, langsung dipakai supaya pembeli
    // tidak perlu popup untuk pilihan yang tidak ada artinya. Kalau ada
    // beberapa, popup pilihannya yang muncul.
    const zones = deliveryZones.filter((z) => z.kind === "pickup");
    if (zones.length === 1) {
      updateDraft({ deliveryZone: zones[0].id });
      setPickupPickerOpen(false);
      return;
    }
    setPickupPickerOpen(true);
  };

  const pickupZones = deliveryZones.filter((z) => z.kind === "pickup");
  const chosenPickup = pickupZones.find((z) => z.id === draft.deliveryZone) ?? null;

  const currentZone = deliveryZones.find((z) => z.id === draft.deliveryZone);
  const rawDeliveryFee =
    draft.deliveryMethod === "delivery" && currentZone ? currentZone.fee : 0;
  // Potongan ongkir bertingkat per zona (migration-46). `finalFee` yang dipakai
  // di total, karena `create_order` menerapkan aturan yang sama persis di
  // database — jadi yang dilihat pembeli sama dengan yang ditagih.
  const shipping = useMemo(
    () =>
      resolveShipping(
        draft.deliveryMethod === "delivery"
          ? currentZone?.shipping_discounts
          : undefined,
        subtotal,
        rawDeliveryFee
      ),
    [draft.deliveryMethod, currentZone, subtotal, rawDeliveryFee]
  );
  const deliveryFee = shipping.finalFee;
  const total = subtotal + deliveryFee;
  // Label metode untuk sticky bar + kartu konfirmasi.
  const deliveryLabel =
    draft.deliveryMethod === "delivery"
      ? t.order.payment.delivery
      : draft.deliveryMethod === "courier"
        ? t.order.payment.courier
        : t.order.payment.pickup;

  const pickupNote = lang === "en" ? settings.pickup_note_en : settings.pickup_note_id;

  const stepIndex = steps.indexOf(step);

  // Simpan langkah ke sessionStorage TIDAK lagi lewat effect yang depends on
  // `step`. Effect seperti itu akan menimpa nilai yang tersimpan dengan
  // `steps[0]` SEBELUM `useSyncExternalStore` sempat membacanya, sehingga
  // restore selalu gagal. Karena `setStep` hanya dipanggil dari `goTo()`,
  // menulis storage di sana sudah menutup semua perpindahan langkah.

  // Reset keranjang HANYA terjadi kalau pesanan benar-benar berhasil dikirim
  // (lihat `handleSubmit` -> `reset()` sebelum `router.push` ke halaman sukses).
  //
  // Steven 14-10-2026: "kalau misal di pre-order udah sampai step 3 atau 4
  // misal tapi kita back ke home, semua langsung kereset. kecuali cuma refresh
  // tetap stay di web itu".
  //
  // Sebelumnya ada effect unmount yang menghapus `js_order_step`, tanggal PO,
  // dan seluruh keranjang setiap kali komponen lepas dari layar — jadi begitu
  // pembeli mampir ke beranda, seluruh pesanan yang sudah halfway hilang. Efek
  // itu sekarang DIHAPUS: pindah halaman tidak lagi menghapus apa pun, sama
  // seperti yang sudah terjadi saat refresh. Yang tersisa reset setelah submit,
  // sehingga pesanan berikutnya selalu mulai dari keranjang kosong.
  //
  // Catatan: data identitas (nama/telepon/IG) juga ikut bertahan karena ada di
  // draft yang sama. Itu konsekuensi dari permintaan Steven — isi form tidak
  // hilang kalau ia bolak-balik ke beranda. Kalau nanti ingin identitas saja
  // yang dibersihkan, itu cukup dilakukan di `reset()` pada `CartProvider`
  // tanpa menyentuh keranjang maupun langkah.

  function goTo(target: Step) {
    setErrors({});
    setStep(target);
    // Simpan di sini (bukan effect) supaya tidak menimpa nilai yang
    // tersimpan sebelum `useSyncExternalStore` sempat membacanya.
    try {
      sessionStorage.setItem("js_order_step", target);
    } catch {
      // Mode privat / storage penuh — langkah tetap jalan di state.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateDate(): boolean {
    // Kalau belum ada batch, tidak ada tanggal yang wajib dipilih.
    if (!hasPo) return true;
    if (!pickupDate) {
      toast.warning(t.order.date.chooseFirst);
      return false;
    }
    if (!poBatch) {
      toast.warning(t.order.date.loading);
      return false;
    }
    return true;
  }

  function validateIdentity(): boolean {
    const next: Record<string, string> = {};
    if (draft.name.trim().length < 2) next.name = t.order.identity.nameError;
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 9) next.phone = t.order.identity.phoneError;
    // Email & Instagram OPTIONAL untuk guest — kalau diisi, validasi format.
    // Kalau kosong, OK. Kalau format salah, error. Tujuannya: gak halangi
    // guest checkout cuma karena lupa email/IG.
    const email = draft.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t.order.identity.emailError;
    }
    // Instagram dibiarkan bebas (username apa pun → tanpa "@"). Validasi
    // format tidak ketat supaya guest gak terblokir.
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateMenu(): boolean {
    if (cartLines.length === 0 && cartBundles.length === 0) {
      toast.warning(t.order.menu.cartEmpty);
      return false;
    }
    // Stok per-kategori: total pcs tiap kategori (item + slot bundle) tidak
    // boleh melebihi sisa stok kategori itu.
    for (const [catId, pcs] of stockContribution.entries()) {
      const s = stockByCategory.get(catId);
      if (s?.enabled && pcs > s.left) {
        toast.error(t.errors.insufficient_stock);
        return false;
      }
    }
    // Bundle yang Steven hapus dari batch ini tidak boleh ikut terkirim —
    // kalau tidak, server akan menolak dengan pesan yang membingungkan.
    if (poBatch?.bundles) {
      const boleh = new Set(poBatch.bundles.map((b) => b.bundleId));
      const ada = cartBundles.some((e) => !boleh.has(e.bundle.id));
      if (ada) {
        toast.warning(t.order.menu.bundleGone);
        return false;
      }
    }
    return true;
  }

  function validatePayment(): boolean {
    if (!draft.paymentMethod) {
      toast.warning(t.order.payment.title);
      return false;
    }
    if (draft.deliveryMethod === "delivery" && draft.address.trim().length < 5) {
      toast.warning(t.order.payment.addressError);
      return false;
    }
    /* Steven 14-10-2026: sekarang toko dipilih lewat popup. Kalau pembeli
       menutup popup tanpa memilih, `deliveryZone` masih nilai lama
       ("pickup" bawaan) yang TIDAK ada di tabel — `create_order` akan
       menolaknya dengan error yang membingungkan. Jadi:tahan di sini
       dengan pesan yang jelas, dan buka lagi popupnya. */
    if (draft.deliveryMethod === "pickup") {
      const validPickup = pickupZones.some((z) => z.id === draft.deliveryZone);
      if (!validPickup) {
        toast.warning(
          pickupZones.length > 0
            ? t.order.payment.pickupChooseTitle
            : t.order.payment.pickupEmpty
        );
        if (pickupZones.length > 0) setPickupPickerOpen(true);
        return false;
      }
    }
    // Bukti transfer TIDAK wajib saat submit — pembeli boleh transfer
    // dulu, baru upload bukti di langkah review, atau kirim via WA
    // belakangan. Penjual akan follow up via WhatsApp.
    return true;
  }

  function handleNext() {
    if (step === "date" && !validateDate()) return;
    if (step === "identity" && !validateIdentity()) return;
    if (step === "menu" && !validateMenu()) return;
    if (step === "payment" && !validatePayment()) return;
    const next = steps[Math.min(stepIndex + 1, steps.length - 1)];
    goTo(next);
  }

  async function handleSubmit() {
    if (!validateIdentity() || !validateMenu() || !validatePayment() || !validateDate()) {
      toast.error(t.errors.generic);
      return;
    }

    // Bentuk payload sekali — dipakai untuk kedua cabang (transfer &
    // qris_midtrans) supaya tidak perlu kode dobel.
    const payload = {
      pCustomerName: draft.name.trim(),
      pCustomerEmail: draft.email.trim(),
      pInstagram: draft.instagram.trim(),
      pPhone: draft.phone.trim(),
      pPaymentMethod: draft.paymentMethod,
      pDeliveryMethod: draft.deliveryMethod,
      pDeliveryZone: draft.deliveryZone,
      pAddress:
        draft.deliveryMethod === "delivery" ? draft.address.trim() : null,
      pAddressNote:
        draft.deliveryMethod === "delivery" ? draft.addressNote.trim() : null,
      pLat: draft.lat,
      pLng: draft.lng,
      pTransferMethod: draft.transferMethod || null,
      pPaymentProof: draft.proofPath,
      pNote: draft.note.trim(),
      pLanguage: lang,
      pItems: cartLines.map((l) => ({
        flavor_id: l.flavor.id,
        quantity: l.qty,
        note: notes[String(l.flavor.id)] || null,
      })),
      pBundles: cartBundles.map((entry) => ({
        bundle_id: entry.bundle.id,
        slots: entry.slots.map((flavorId) => ({ flavor_id: flavorId })),
        note: entry.note ?? null,
      })),
      pUserId: profile?.user_id ?? null,
      // Batch PO. Kalau pembeli tidak memilih tanggal (belum ada batch
      // yang dibuka), keduanya null dan `create_order` memotong stok dari
      // `categories.stock` seperti mode lama.
      pPoBatchId: poBatch?.batchId ?? null,
      pPickupDate: poBatch ? poBatch.pickupDate : null,
    };

    // ===== Cabang QRIS Midtrans =====
    // Modal QrisPaymentModal yang akan panggil createQrisOrderAction,
    // generate QR via Midtrans, polling status, redirect saat paid.
    if (draft.paymentMethod === "qris_midtrans") {
      // Payload untuk QrisPaymentModal pakai struktur yang diharapkan
      // server action `createQrisOrderAction` (lihat qris-actions.ts).
      setQrisPayload({
        customerName: payload.pCustomerName,
        customerEmail: payload.pCustomerEmail || null,
        instagram: payload.pInstagram,
        phone: payload.pPhone,
        deliveryMethod: payload.pDeliveryMethod,
        deliveryZone: payload.pDeliveryZone,
        address: payload.pAddress,
        addressNote: payload.pAddressNote,
        lat: payload.pLat,
        lng: payload.pLng,
        note: payload.pNote,
        items: payload.pItems,
        bundles: payload.pBundles,
        language: payload.pLanguage,
        pUserId: payload.pUserId,
        poBatchId: payload.pPoBatchId,
        pickupDate: payload.pPickupDate,
      });
      setQrisModalOpen(true);
      return;
    }

    // ===== Cabang transfer (qris_midtrans sudah di-handle di atas) =====
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_order", {
        p_customer_name: payload.pCustomerName,
        p_customer_email: payload.pCustomerEmail,
        p_instagram: payload.pInstagram,
        p_phone: payload.pPhone,
        p_payment_method: payload.pPaymentMethod,
        p_delivery_method: payload.pDeliveryMethod,
        p_delivery_zone: payload.pDeliveryZone,
        p_address: payload.pAddress,
        p_address_note: payload.pAddressNote,
        p_lat: payload.pLat,
        p_lng: payload.pLng,
        p_transfer_method: payload.pTransferMethod,
        p_payment_proof: payload.pPaymentProof,
        p_note: payload.pNote,
        p_language: payload.pLanguage,
        p_items: payload.pItems,
        p_bundles: payload.pBundles,
        p_user_id: payload.pUserId,
        p_po_batch_id: payload.pPoBatchId,
        p_pickup_date: payload.pPickupDate,
      });

      if (error) {
        const key = error.message as keyof typeof t.errors;
        const message =
          t.errors[key as keyof typeof t.errors] ?? t.errors.generic;
        toast.error(message, error.message);
        return;
      }

      const code = (data as { order_code: string }).order_code;
      // Simpan snapshot invoice ke sessionStorage supaya halaman sukses bisa
      // menampilkannya (termasuk tombol cetak/unduh). Data ini hanya hidup di
      // tab ini — kalau user menutup tab, invoice tetap bisa dilacak via
      // halaman /track dengan kode + nomor telepon.
      // `paymentMethod` pasti terisi setelah validatePayment() lulus.
      const invoice = {
        order_code: code,
        customer_name: draft.name.trim(),
        phone: draft.phone.trim(),
        address: draft.deliveryMethod === "delivery" ? draft.address.trim() : null,
        note: draft.note.trim(),
        payment_method: (draft.paymentMethod ?? "transfer") as
          | "transfer"
          | "qris_midtrans",
        transfer_method: draft.transferMethod || null,
        qris_status: null,
        qris_paid_at: null,
        delivery_method: draft.deliveryMethod,
        pickup_date: poBatch ? poBatch.pickupDate : null,
        created_at: new Date().toISOString(),
        language: lang,
        items: groups.map((g) => ({
          category:
            (lang === "en" ? g.category?.name_en : g.category?.name_id) ?? "",
          qty: g.qty,
          unit_price: Math.round(g.total / Math.max(g.qty, 1)),
          line_total: g.total,
          flavors: g.lines.map((l) => ({
            name: lang === "en" ? l.flavor.name_en : l.flavor.name_id,
            qty: l.qty,
            unit_price: l.flavor.price,
            line_total: l.flavor.price * l.qty,
          })),
        })),
        bundles: bundleGroups.map((bg) => ({
          bundle_id: bg.bundle.id,
          bundle_name: lang === "en" ? bg.bundle.name_en : bg.bundle.name_id,
          // Untuk snapshot lokal, satukan semua slot dari semua entri
          // bundle yang sama, plus info flavor-nya supaya halaman sukses
          // bisa menampilkan tanpa lookup lagi. Backend hanya menerima
          // entry yang semua slot-nya terisi, jadi null seharusnya tidak
          // sampai di sini — kita filter keluar untuk type safety.
          slots: bg.entries
            .flatMap((entry, entryIdx) =>
              entry.slots.map((flavorId, slotIdx) => {
                if (flavorId == null) return null;
                // Cari nama flavor dari categories.
                let flavorName = "";
                for (const c of categories) {
                  const f = (c.flavors ?? []).find((x) => x.id === flavorId);
                  if (f) {
                    flavorName = lang === "en" ? f.name_en : f.name_id;
                    break;
                  }
                }
                return {
                  slot: entryIdx * bg.bundle.required_qty + slotIdx + 1,
                  flavor_id: flavorId,
                  flavor_name: flavorName,
                };
              })
            )
            .filter(
              (s): s is { slot: number; flavor_id: number; flavor_name: string } =>
                s !== null
            ),
        })),
        subtotal,
        delivery_fee: deliveryFee,
        saving,
        total,
      };
      saveInvoice(invoice);
      // Kosongkan keranjang + data pengirim supaya pesanan berikutnya
      // dimulai dari form yang bersih. Ini satu-satunya titik reset, dan
      // hanya reached kalau pesanan benar-benar tersimpan.
      clearOrderSession();
      reset();
      router.push(`/order/success/${code}`);
    } catch {
      toast.error(t.errors.generic);
    } finally {
      setSubmitting(false);
    }
  }

  const closed = !settings.is_preorder_open;

  if (closed) {
    return (
      <div className="card mx-auto max-w-lg p-10 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-cocoa-100">
          <Store className="mx-auto size-7 text-cocoa-500" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-cocoa-900">{t.order.closed.title}</h1>
        <p className="mt-3 text-sm font-semibold text-cocoa-500">{t.order.closed.desc}</p>
        <Link href="/" className="btn-primary mt-6">
          {t.success.home}
        </Link>
      </div>
    );
  }

  const stepTitles: Record<Step, string> = {
    date: t.order.stepDate,
    identity: t.order.stepIdentity,
    menu: t.order.stepMenu,
    payment: t.order.stepPayment,
    review: t.order.stepReview,
  };

  // Langkah sebelumnya, untuk tombol "back". Pembeli perlu bisa naik lagi ke
  // langkah identitas buat cek ulang data yang sudah diketik, jadi navigasi
  // mundur ini harus ada di SETIAP langkah, bukan cuma di payment & review.
  const prevStep: Step | null = stepIndex > 0 ? steps[stepIndex - 1] : null;

  // Steven 13-10-2026 -> 14-10-2026: panel keranjang di sisi kanan SUDAH
  // DIHAPUS (gambar 4: "keranjangnya dihilangkan aja, karena terlalu bawah
  // juga orang gaChamp"), begitu juga sticky bar bawah dan drawernya. Yang
  // masih hidup cuma keranjang di memori CartProvider — pembeli tetap bisa
  // menambah/mengurangi rasa seperti biasa lewat kartu Flavor, dan menekan
  // "Lanjut" lewat StepNav di bawah daftar rasa.

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---------- Progress ---------- */}
      <div className="mb-8">
        {/* Mobile: tombol back + pill step + bar progres */}
        <div className="flex items-center justify-between gap-2 sm:hidden">
          <div className="flex min-w-0 items-center gap-2">
            {prevStep ? (
              <button
                type="button"
                onClick={() => goTo(prevStep)}
                aria-label={t.order.goBackTo.replace("{step}", stepTitles[prevStep])}
                className="grid size-8 shrink-0 place-items-center rounded-full bg-cocoa-100 text-cocoa-700 transition active:bg-cocoa-200"
              >
                <ArrowLeft className="size-4" />
              </button>
            ) : null}
            <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-cocoa-100 px-2.5 text-[11px] font-extrabold tracking-wider text-cocoa-700 uppercase tabular-nums">
              {String(stepIndex + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
            <span className="truncate font-display text-base font-bold text-cocoa-900">
              {stepTitles[step]}
            </span>
          </div>
          {stepIndex < steps.length - 1 ? (
            <span className="shrink-0 text-[10px] font-bold tracking-wider text-cocoa-400 uppercase">
              {stepTitles[steps[stepIndex + 1]]} →
            </span>
          ) : null}
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cocoa-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-matcha-500 to-cocoa-700 transition-all duration-500 ease-out"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
        {/* Desktop: numbered stepper dengan connector */}
        <ol className="mt-6 hidden items-start gap-3 sm:flex">
          {steps.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            const label = (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={`grid size-7 place-items-center rounded-full text-xs font-extrabold transition ${
                      done
                        ? "bg-matcha-500 text-white"
                        : active
                          ? "bg-cocoa-900 text-cream-50 ring-4 ring-cocoa-100"
                          : "bg-cocoa-100 text-cocoa-400"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  {i < steps.length - 1 ? (
                    <span
                      className={`h-px flex-1 transition-colors ${
                        done ? "bg-matcha-500" : "bg-cocoa-200"
                      }`}
                    />
                  ) : null}
                </div>
                <span
                  className={`text-[11px] font-bold tracking-wide uppercase ${
                    active
                      ? "text-cocoa-900"
                      : done
                        ? "text-matcha-700"
                        : "text-cocoa-400"
                  }`}
                >
                  {stepTitles[s]}
                </span>
              </>
            );
            // Langkah yang sudah dilewati bisa diklik untuk cek ulang isinya.
            // Yang belum dilewati atau sedang aktif tidak bisa, supaya tidak
            // ada langkah yang terlewat.
            return (
              <li key={s} className="flex flex-1 flex-col gap-2">
                {done ? (
                  <button
                    type="button"
                    onClick={() => goTo(s)}
                    aria-label={t.order.goBackTo.replace("{step}", stepTitles[s])}
                    className="flex w-full cursor-pointer flex-col gap-2 text-left transition hover:opacity-70"
                  >
                    {label}
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">{label}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
<div className="grid gap-6">
        <div className="min-w-0">
          {/* ============ LANGKAH 1: TANGGAL AMBIL ============ */}
          {step === "date" ? (
            <section className="card p-6 sm:p-8">
              <StepHeading
                icon={<CalendarDays className="size-5" />}
                title={t.order.date.title}
                subtitle={t.order.date.subtitle}
              />

              {poDates.length === 0 ? (
                <p className="mt-6 rounded-2xl bg-honey-300/20 p-4 text-sm font-semibold text-honey-500">
                  {t.order.date.empty}
                </p>
              ) : (
                <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
                  {poDates.map((d) => {
                    const selected = pickupDate === d.pickupDate;
                    return (
                      <li key={d.pickupDate}>
                        <button
                          type="button"
                          onClick={() => selectPickupDate(d.pickupDate)}
                          aria-pressed={selected}
                          className={`flex w-full flex-col items-start gap-1 rounded-2xl border-2 p-4 text-left transition ${
                            selected
                              ? "border-matcha-500 bg-matcha-50"
                              : "border-cocoa-200 bg-white hover:border-cocoa-300 hover:bg-cocoa-50/50"
                          }`}
                        >
                          <span className="flex w-full items-center gap-1.5 text-sm font-bold text-cocoa-900">
                            {formatPickupDate(d.pickupDate, lang)}
                            {selected ? (
                              <Check className="size-4 shrink-0 text-matcha-600" />
                            ) : null}
                          </span>
                          <span className="text-xs font-semibold text-cocoa-500 tabular">
                            {lang === "en"
                              ? `${d.sisa} pcs left`
                              : `tersisa ${d.sisa} pcs`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {poLoading ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-cocoa-500">
                  <Loader2 className="size-4 animate-spin" />
                  {t.order.date.loading}
                </p>
              ) : null}

              <StepNav
                onBack={null}
                onNext={handleNext}
                nextLabel={t.common.next}
                nextIcon={<ArrowRight className="size-4" />}
              />
            </section>
          ) : null}

          {/* ============ LANGKAH 2: IDENTITAS ============ */}
          {step === "identity" ? (
            <section className="card p-6 sm:p-8">
              <StepHeading
                icon={<User className="size-5" />}
                title={t.order.identity.title}
                subtitle={t.order.identity.subtitle}
              />

              {/* Kalau customer login, tampilkan salam + identitas otomatis.
                  User tetap boleh mengubah field sebelum submit. */}
              {profile ? (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-matcha-200 bg-matcha-500/5 p-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-matcha-500/15 text-matcha-700">
                    <User className="size-4" />
                  </span>
                  <p className="text-[13px] leading-snug text-cocoa-700">
                    <span className="font-bold text-matcha-700">
                      {lang === "en" ? `Hi, ${profile.full_name}` : `Hai, ${profile.full_name}`}
                    </span>{" "}
                    —{" "}
                    {lang === "en"
                      ? "Your saved details are filled in. You can change anything before sending."
                      : "Data tersimpan sudah terisi. Kamu bisa mengubahnya sebelum kirim."}
                  </p>
                </div>
              ) : null}

              <div className="mt-6 space-y-5">
                <div>
                  <label htmlFor="name" className="label">
                    {t.order.identity.name}
                  </label>
                  <input
                    id="name"
                    className={`input ${errors.name ? "input-error" : ""}`}
                    placeholder={t.order.identity.namePlaceholder}
                    value={draft.name}
                    autoComplete="name"
                    onChange={(e) => {
                      updateDraft({ name: e.target.value });
                      if (errors.name) setErrors((p) => ({ ...p, name: "" }));
                    }}
                  />
                  {errors.name ? (
                    <p className="mt-1.5 text-xs font-semibold text-berry-500">{errors.name}</p>
                  ) : null}
                </div>
                <div>
                  <label htmlFor="phone" className="label">
                    {t.order.identity.phone}
                    <span className="ml-1 text-berry-500">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    dir="ltr"
                    className={`input tabular ${errors.phone ? "input-error" : ""}`}
                    placeholder={t.order.identity.phonePlaceholder}
                    value={draft.phone}
                    autoComplete="tel"
                    onChange={(e) => {
                      updateDraft({ phone: e.target.value });
                      if (errors.phone) setErrors((p) => ({ ...p, phone: "" }));
                    }}
                  />
                  <p className="mt-1.5 text-xs text-cocoa-400">
                    {errors.phone ?? t.order.identity.phoneHint}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="email" className="label">
                      {t.order.identity.email}
                      <span className="ml-1 text-cocoa-400">
                        ({lang === "en" ? "optional" : "opsional"})
                      </span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      dir="ltr"
                      className={`input tabular ${errors.email ? "input-error" : ""}`}
                      placeholder="you@gmail.com"
                      value={draft.email}
                      autoComplete="email"
                      onChange={(e) => {
                        updateDraft({ email: e.target.value });
                        if (errors.email) setErrors((p) => ({ ...p, email: "" }));
                      }}
                    />
                    <p className="mt-1.5 text-xs text-cocoa-400">
                      {errors.email ?? t.order.identity.emailHint}
                    </p>
                  </div>
                  <div>
                    <label htmlFor="instagram" className="label">
                      {t.order.identity.instagram}
                      <span className="ml-1 text-cocoa-400">
                        ({lang === "en" ? "optional" : "opsional"})
                      </span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-cocoa-400">
                        @
                      </span>
                      <input
                        id="instagram"
                        dir="ltr"
                        className={`input pl-9 ${errors.instagram ? "input-error" : ""}`}
                        placeholder="username"
                        value={draft.instagram}
                        autoComplete="off"
                        onChange={(e) => {
                          updateDraft({
                            instagram: e.target.value.replace(/^@/, "").replace(/\s/g, ""),
                          });
                          if (errors.instagram) setErrors((p) => ({ ...p, instagram: "" }));
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-cocoa-400">
                      {errors.instagram ?? t.order.identity.instagramHint}
                    </p>
                  </div>
                </div>
              </div>
              <StepNav
                onBack={null}
                onNext={handleNext}
                nextLabel={t.common.next}
                nextIcon={<ArrowRight className="size-4" />}
              />
            </section>
          ) : null}

          {/* ============ LANGKAH 2: PILIH RASA ============ */}
          {step === "menu" ? (
            /* Steven 14-10-2026 (gambar 4): "itu keranjangnya dihilangkan aja,
               karena terlalu bawah juga orang gaChamp".

               Yang dihapus: panel ringkasan di kanan (aside), sticky bar
               bawah, dan drawer. Ketiganya hanya memberi informasi yang sama
               dengan kartu Flavor (tombolnya sudah
               menunjukkan jumlah), tapi posisinya memaksa pembeli
               menggulir ke bawah halaman.

               KONSEKUENSI PENTING: dulu tombol "Lanjut" hidup DI DALAM
               drawer itu. Kalau drawer dihapus tanpa pamit, pembeli tidak
               punya cara advance ke pembayaran. Jadi di bawah ini StepNav
               dikembalikan ke langkah menu, dengan tombol Lanjut yang
               disabled saat keranjang masih kosong — supaya tidak ada jalan
               buntu. */
            <section>
              <div className="card mb-6 p-6 sm:p-8">
                <StepHeading
                  icon={<ShoppingBag className="size-5" />}
                  title={t.order.menu.title}
                  subtitle={t.order.menu.subtitle}
                />
              </div>

              {/* Rincian item: klik kategori dulu, lalu rasa-rasanya.
                  `visibleCategories` = kategori + rasa yang sudah disaring
                  sesuai allowlist batch (migration-53). */}
              {visibleCategories.length === 0 && visibleBundles.length === 0 ? (
                <p className="card p-8 text-center text-cocoa-400 sm:p-10">{t.menu.empty}</p>
              ) : (
                <OrderMenuBrowser
                  categories={visibleCategories}
                  bundles={visibleBundles}
                  soldCounts={soldCounts}
                  stockOverride={poBatch?.stockByCategory ?? null}
                />
              )}

              {/* Ganti sticky bottom cart bar + drawer jadi navigasi langkah biasa.

                 -"Lanjut" dulu hidup di dalam drawer keranjang; karena
                  drawer dihapus (Steven 14-10-2026), tombolnya dikembalikan
                  ke alur langkah biasa. Disabled kalau keranjang masih kosong
                  supaya pembeli tidak bisa advance tanpa memilih rasa. */}
              {/* Langkah SEBELUM "menu" diambil dari daftar langkah yang aktif
                  (prevStep), bukan ditulis manual: untuk profil lengkap +
                  batch PO sebelumnya "date", untuk tamu "identity", dan kalau
                  tidak ada PO tidak ada tombol back. */}
              <StepNav
                onBack={prevStep ? () => goTo(prevStep) : null}
                onNext={handleNext}
                nextLabel={t.common.next}
                nextIcon={<ArrowRight className="size-4" />}
                disabled={totalItems === 0}
              />
            </section>
          ) : null}

          {/* ============ LANGKAH 3: PEMBAYARAN ============ */}
          {step === "payment" ? (
            <section className="card p-6 sm:p-8">
              <StepHeading
                icon={<Wallet className="size-5" />}
                title={t.order.payment.title}
                subtitle={t.order.payment.subtitle}
              />

              {/* Pembayaran: transfer / qris_midtrans */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  selected={draft.paymentMethod === "transfer"}
                  onClick={() => updateDraft({ paymentMethod: "transfer" })}
                  icon={<Building2 className="size-5" />}
                  title={t.order.payment.transfer}
                  desc={t.order.payment.transferDesc}
                />
                {midtransReady ? (
                  <ChoiceCard
                    selected={draft.paymentMethod === "qris_midtrans"}
                    onClick={() => updateDraft({ paymentMethod: "qris_midtrans" })}
                    icon={<Sparkles className="size-5" />}
                    title={t.order.payment.qrisMidtrans}
                    desc={t.order.payment.qrisMidtransDesc}
                  />
                ) : null}
              </div>

              {/* Cara pengambilan — 3 pilihan (permintaan Steven
                  13-10-2026): Ambil di toko, Diantar, dan Pesan Kurir.
                  Lokasi Ambil & Diantar ditentukan admin di menu "Ambil &
                  Kirim"; setelah metode dipilih, tombol "Lihat lokasi"
                  membuka popup berisi detail titik tersebut. */}
              <h3 className="mt-8 text-base font-bold text-cocoa-800">
                {t.order.payment.deliveryTitle}
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <ChoiceCard
                  selected={draft.deliveryMethod === "pickup"}
                  onClick={onPickupClick}
                  icon={<Store className="size-5" />}
                  title={t.order.payment.pickup}
                  desc={t.order.payment.pickupDesc}
                  note={pickupNote}
                />
                <ChoiceCard
                  selected={draft.deliveryMethod === "delivery"}
                  onClick={() => {
                    // Saat pertama kali pilih 'Diantar', default ke zona
                    // pertama yang bukan pickup.
                    const firstZone = deliveryZones.find(
                      (z) => (z.kind ?? "delivery") === "delivery"
                    );
                    updateDraft({
                      deliveryMethod: "delivery",
                      deliveryZone: firstZone?.id ?? "vihara",
                    });
                    if (firstZone) setLocationPopup(firstZone);
                  }}
                  icon={<Truck className="size-5" />}
                  title={t.order.payment.delivery}
                  desc={t.order.payment.deliveryDesc}
                />
                <ChoiceCard
                  selected={draft.deliveryMethod === "courier"}
                  onClick={() =>
                    // Pesan Kurir = pembeli yang memesan armada sendiri,
                    // jadi tidak ada zona dan tidak ada alamat dari kami.
                    updateDraft({
                      deliveryMethod: "courier",
                      deliveryZone: "courier",
                      address: "",
                      addressNote: "",
                      lat: null,
                      lng: null,
                    })
                  }
                  icon={<Bike className="size-5" />}
                  title={t.order.payment.courier}
                  desc={t.order.payment.courierDesc}
                />
              </div>

              {/* Zona pengantaran (hanya muncul setelah pilih 'Diantar'). */}
              {draft.deliveryMethod === "delivery" ? (
                <div className="mt-4">
                  <p className="text-[11px] font-bold tracking-wide text-cocoa-500 uppercase">
                    {t.order.payment.deliveryZoneTitle}
                  </p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    {deliveryZones
                      .filter((z) => (z.kind ?? "delivery") === "delivery")
                      .map((z) => {
                        const zName =
                          lang === "en" ? z.name_en : z.name_id;
                        const zNote =
                          (lang === "en" ? z.note_en : z.note_id) ?? "";
                        return (
                          <ChoiceCard
                            key={z.id}
                            selected={draft.deliveryZone === z.id}
                            onClick={() => {
                              updateDraft({ deliveryZone: z.id });
                              setLocationPopup(z);
                            }}
                            icon={<MapPin className="size-5" />}
                            title={zName}
                            desc={
                              z.fee > 0
                                ? `${formatIDR(z.fee, lang)}`
                                : lang === "en"
                                  ? "Free"
                                  : "Gratis"
                            }
                            note={zNote}
                          />
                        );
                      })}
                  </div>
                </div>
              ) : null}

              {/* Toko pilihan (metode "Ambil di toko"). Steven 14-10-2026:
                  grid kartu toko yang panjang DIHAPUS dan diganti ringkasan
                  satu baris + tombol "Ganti toko". Alasannya: grid itu bikin
                  halaman panjang, dan tombol "Lihat lokasi" di bawahnya
                  membuka popup DETAIL — bukan popup pilihan. Sekarang ada
                  satu cara saja memilih, lewat popup, dan tempat ini hanya
                  menampilkan hasil pilihannya. */}
              {draft.deliveryMethod === "pickup" && pickupZones.length > 0 ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-matcha-300 bg-matcha-50 p-4">
                  <Store className="size-5 shrink-0 text-matcha-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold tracking-wide text-matcha-700 uppercase">
                      {t.order.payment.pickupSelectedStore}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-bold text-cocoa-800">
                      {chosenPickup
                        ? lang === "en"
                          ? chosenPickup.name_en
                          : chosenPickup.name_id
                        : lang === "en"
                          ? "Not selected yet"
                          : "Belum dipilih"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickupPickerOpen(true)}
                    className="shrink-0 rounded-xl border border-cocoa-200 bg-white px-3.5 py-2.5 text-sm font-bold text-cocoa-700 transition hover:bg-cocoa-50"
                  >
                    {t.order.payment.pickupChangeStore}
                  </button>
                </div>
              ) : null}

              {/* Alamat ketik manual — hanya untuk zona yang requires_address.
                  Peta dihapus 12-10-2026; pembeli cukup menulis alamat +
                  detail secara manual. */}
              {draft.deliveryMethod === "delivery" && currentZone?.requires_address ? (
                <AddressPicker
                  draft={draft}
                  updateDraft={updateDraft}
                  dict={t.order.payment}
                />
              ) : draft.deliveryMethod === "delivery" && currentZone ? (
                /* Zona fix (Vihara/UVERS) — pembeli datang sendiri, jadi tidak
                   perlu menulis alamat. Koordinat ikut disembunyikan karena
                   Steven minta angka tidak ditampilkan. */
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-matcha-300 bg-matcha-50 p-4">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-matcha-700" />
                  <div>
                    <p className="text-[11px] font-bold tracking-wide text-matcha-700 uppercase">
                      {t.order.payment.deliveryZoneTitle}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-cocoa-800">
                      {lang === "en" ? currentZone.name_en : currentZone.name_id}
                    </p>
                  </div>
                </div>
              ) : null}
              {/* Tombol "Lihat lokasi" — muncul kalau metode Ambil/Diantar
                  dan titik yang dipilih punya detail (catatan admin atau
                  alamat toko dari pengaturan). */}
              {draft.deliveryMethod !== "courier" && currentZone ? (
                <button
                  type="button"
                  onClick={() => setLocationPopup(currentZone)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cocoa-200 bg-white px-3.5 py-2.5 text-sm font-bold text-cocoa-700 transition hover:bg-cocoa-50"
                >
                  <MapPin className="size-4" />
                  {t.order.payment.viewLocation}
                </button>
              ) : null}

              {/* Steven 13-10-2026: kartu yang dulu ada di sini DIHAPUS.

                  Kartu itu berlabel "ALAMAT PENGIRIMAN" padahal isinya
                  `settings.address`, yaitu ALAMAT TOKO, bukan alamat
                  pembeli. Salah label itu bikin membingungkan, dan di
                  langkah "Ambil di toko" pembeli jelas tidak perlu alamat
                  pengiriman sama sekali.

                  Alamat toko sendiri tetap hidup di halaman /contact dan di
                  kartu pilihan lokasi pengambilan. */}

              {/* Detail transfer */}
              {draft.paymentMethod === "transfer" ? (
                <div className="mt-8 space-y-5 border-t border-cocoa-100 pt-6">
                  {settings.bank_accounts.length > 0 ? (
                    <div>
                      <h3 className="text-base font-bold text-cocoa-800">
                        {t.order.payment.transferAccount}
                      </h3>
                      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                        {settings.bank_accounts.map((acc, i) => (
                          <AccountCard
                            key={`${acc.bank}-${i}`}
                            bank={acc.bank}
                            number={acc.number}
                            holder={acc.holder}
                            copyLabel={t.order.payment.copyAccount}
                            copiedLabel={t.common.copied}
                            copyFailedLabel={t.common.copyFailed}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {settings.bank_accounts.length > 1 ? (
                    <div>
                      <label htmlFor="transfer-method" className="label">
                        {t.order.payment.transferMethod}
                      </label>
                      <select
                        id="transfer-method"
                        className="input"
                        value={draft.transferMethod}
                        onChange={(e) => updateDraft({ transferMethod: e.target.value })}
                      >
                        <option value="">{t.order.payment.chooseMethod}</option>
                        {settings.bank_accounts.map((acc, i) => (
                          <option key={i} value={acc.bank}>
                            {acc.bank}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {settings.bank_accounts.length === 0 ? (
                    <p className="rounded-xl bg-honey-300/20 p-4 text-sm font-semibold text-honey-500">
                      {t.order.payment.qrisUnavailable}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <StepNav
                onBack={() => goTo("menu")}
                onNext={handleNext}
                nextLabel={t.common.next}
                nextIcon={<ArrowRight className="size-4" />}
              />
            </section>
          ) : null}

          {/* ============ LANGKAH 4: KONFIRMASI ============ */}
          {/* Steven 14-10-2026 (gambar 7): "itu terlalu besar di desktop".
              Tanpa batas lebar, kartu ini melar sampai ~1100px di monitor
              admin/pembeli — baris "Nama / Telepon" jadi jauh dan harga
              menyingkir ke tengah. Sekarang langkah konfirmasi dikunci
              max-w-2xl supaya isinya terbaca seperti struk di kertas. */}
          {step === "review" ? (
            <div className="mx-auto w-full max-w-2xl">
            <section className="card p-6 sm:p-8">
              <StepHeading
                icon={<Check className="size-5" />}
                title={t.order.review.title}
                subtitle={t.order.review.subtitle}
              />

              <div className="mt-6 divide-y divide-cocoa-100">
                <ReviewRow
                  label={t.order.review.nameLabel}
                  onEdit={profileComplete ? () => router.push("/account") : () => goTo("identity")}
                  editLabel={t.order.review.editDetails}
                >
                  {draft.name}
                </ReviewRow>
                <ReviewRow
                  label={t.order.review.phoneLabel}
                  onEdit={profileComplete ? () => router.push("/account") : () => goTo("identity")}
                  editLabel={t.order.review.editDetails}
                >
                  <span dir="ltr">{formatPhone(draft.phone)}</span>
                </ReviewRow>
                <ReviewRow label={t.order.review.paymentLabel} onEdit={() => goTo("payment")} editLabel={t.order.review.editPayment}>
                  {draft.paymentMethod === "qris_midtrans"
                    ? t.order.payment.qrisMidtrans
                    : `${t.order.payment.transfer}${
                        draft.transferMethod ? ` · ${draft.transferMethod}` : ""
                      }`}
                </ReviewRow>
                <ReviewRow label={t.order.review.deliveryLabel} onEdit={() => goTo("payment")} editLabel={t.order.review.editPayment}>
                  {deliveryLabel}
                  {currentZone ? ` — ${lang === "en" ? currentZone.name_en : currentZone.name_id}` : ""}
                  {draft.deliveryMethod === "delivery" && draft.address
                    ? ` — ${draft.address}`
                    : ""}
                </ReviewRow>
                {poBatch ? (
                  <ReviewRow
                    label={t.order.review.pickupDateLabel}
                    onEdit={() => goTo("date")}
                    editLabel={t.order.review.editDetails}
                  >
                    {formatPickupDate(poBatch.pickupDate, lang)}
                  </ReviewRow>
                ) : null}
                {/* ---------- Blok item: struk ---------- */}
                {/* Steven 14-10-2026 (gambar 5): "costnya buat ke kanan aja,
                    agak kanan dan semua harus sejajar sampai sub total,
                    n=buat dia kyk bnrn seperti gambar bill".

                    Penyebab misalignment-nya: blok item tadinya hidup DI DALAM
                    `ReviewRow`, dan kolom konten `ReviewRow` selalu menyempit
                    oleh tombol "Ubah" di kanan. Jadi harga item berhenti lebih
                    kiri daripada Subtotal/Total yang ada di blok bill bawahnya.

                    Perbaikannya: item jadi blok penuh sendiri dengan kolom
                    harga berukuran TETAP (`PRICE_COL`) — dan nilai yang sama
                    dipakai subtotal, ongkir, dan total. Satu ukuran = satu tepi
                    kanan = kelihatan seperti struk beneran. */}
                <div className="border-t border-cocoa-100 py-3.5 first:border-t-0">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {t.order.review.itemsLabel}
                    </p>
                    <button
                      type="button"
                      onClick={() => goTo("menu")}
                      className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold text-matcha-600 transition hover:bg-matcha-50"
                    >
                      {t.order.review.editItems}
                    </button>
                  </div>

                  <ul className="mt-2 space-y-2.5">
                    {groups.map((g) => (
                      <li key={g.category?.id ?? `solo-${g.lines[0]?.flavor.id}`}>
                        {g.category ? (
                          <p className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                            {lang === "en" ? g.category.name_en : g.category.name_id}
                          </p>
                        ) : null}
                        {g.lines.map((l) => (
                          <div
                            key={l.flavor.id}
                            className="flex items-baseline justify-between gap-4"
                          >
                            <span className="min-w-0">
                              {l.qty}× {lang === "en" ? l.flavor.name_en : l.flavor.name_id}
                            </span>
                            <span className={`${PRICE_COL} text-cocoa-500`}>
                              {formatIDR(l.flavor.price * l.qty, lang)}
                            </span>
                          </div>
                        ))}
                        <div className="flex items-baseline justify-between gap-4 font-bold text-cocoa-800">
                          <span>
                            {g.qty} {t.common.qty.toLowerCase()}
                          </span>
                          <span className={PRICE_COL}>{formatIDR(g.total, lang)}</span>
                        </div>
                      </li>
                    ))}
                    {bundleGroups.map((bg) => {
                      const bundleName = lang === "en" ? bg.bundle.name_en : bg.bundle.name_id;
                      return (
                        <li key={`bundle-${bg.bundle.id}`}>
                          <p className="text-[10px] font-bold tracking-wide text-berry-600 uppercase">
                            {t.menu.bundleLabel}
                          </p>
                          <div className="flex items-baseline justify-between gap-4">
                            <span className="min-w-0">
                              <span className="font-bold text-cocoa-800">{bundleName}</span>
                              <span className="ml-1.5 text-cocoa-400">× {bg.count}</span>
                            </span>
                            <span className={`${PRICE_COL} text-cocoa-500`}>
                              {formatIDR(bg.bundle.price * bg.count, lang)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-cocoa-500">
                            {t.menu.bundleIncludes.replace("{n}", String(bg.bundle.required_qty))}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* ---------- Bill: subtotal + total bayar ---------- */}
              {/* Steven 14-10-2026 (gambar 8): "sub total dan total bayar
                  di atas, catatan di akhir, yang untuk terakhir ini buat jadi
                  seperti bill bener" + "harga itu buat di agak ujung kanan".

                  Jadi: (1) blok biaya dipindah ke ATAS kolom catatan,
                  (2) blok ini digambar seperti struk — garis putus-putus
                  pemisah, semua nominal rata di kolom kanan, total ditebalkan,
                  (3) field catatan turun ke paling akhir. */}
              <div className="mt-6 rounded-2xl border border-cocoa-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-cocoa-300 pb-2">
                  <span className="text-sm text-cocoa-600">{t.common.subtotal}</span>
                  <span className={`${PRICE_COL} text-sm font-semibold text-cocoa-800`}>
                    {formatIDR(subtotal, lang)}
                  </span>
                </div>

                {saving > 0 ? (
                  <div className="mt-2 flex items-baseline justify-between gap-4">
                    <span className="text-sm font-bold text-matcha-600">
                      {t.order.review.saving}
                    </span>
                    <span className={`${PRICE_COL} text-sm font-bold text-matcha-600`}>
                      −{formatIDR(saving, lang)}
                    </span>
                  </div>
                ) : null}

                {draft.deliveryMethod === "delivery" ? (
                  <>
                    <div className="mt-2 flex items-baseline justify-between gap-4 text-sm text-cocoa-600">
                      <span>{t.order.review.deliveryFee}</span>
                      <span className={PRICE_COL}>
                        {deliveryFee === 0
                          ? t.order.review.freeShipping
                          : formatIDR(deliveryFee, lang)}
                      </span>
                    </div>
                    <ShippingDiscountRows
                      shipping={shipping}
                      subtotal={subtotal}
                      t={t}
                      lang={lang}
                    />
                  </>
                ) : null}

                {/* Baris total penutup — garis putus-putus + nominal besar,
                    persis seperti bagian "TOTAL BAYAR" di struk. */}
                <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-dashed border-cocoa-300 pt-3">
                  <span className="text-base font-extrabold text-cocoa-900">
                    {t.order.review.totalLabel}
                  </span>
                  <span
                    className={`${PRICE_COL} font-display text-xl font-extrabold text-cocoa-900`}
                  >
                    {formatIDR(total, lang)}
                  </span>
                </div>
              </div>

              {/* Upload bukti transfer — hanya untuk metode transfer.
                  Diletakkan SETELAH total supaya pembeli bisa lihat
                  nominal dulu sebelum transfer & upload. Tidak wajib;
                  boleh di-skip dan kirim lewat WA. */}
              {draft.paymentMethod === "transfer" ? (
                <div className="mt-6 rounded-2xl border border-cocoa-200 bg-cream-50 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-matcha-100 text-matcha-700">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-cocoa-900">
                        {t.order.payment.proofTitle}
                      </h3>
                      <p className="mt-1 text-[13px] leading-relaxed text-cocoa-500">
                        {t.order.review.proofHint}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <ProofUploader
                      path={draft.proofPath}
                      required={false}
                      onChange={(p) => updateDraft({ proofPath: p })}
                    />
                  </div>
                </div>
              ) : null}

              {/* ---------- Catatan (PALING AKHIR) ---------- */}
              {/* Steven 14-10-2026: "catatan di akhir" — field ini sekarang
                  jadi isian terakhir sebelum persetujuan + tombol kirim. */}
              <div className="mt-6">
                <label htmlFor="note" className="label">
                  {t.common.notes}{" "}
                  <span className="font-normal text-cocoa-400">({t.common.optional})</span>
                </label>
                <textarea
                  id="note"
                  rows={2}
                  className="input resize-none"
                  placeholder={t.common.note}
                  value={draft.note}
                  maxLength={500}
                  onChange={(e) => updateDraft({ note: e.target.value })}
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-cocoa-400">{t.order.review.consent}</p>

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={() => goTo("payment")}
                  className="btn-ghost"
                  disabled={submitting}
                >
                  <ArrowLeft className="size-4" />
                  {t.common.back}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-matcha sm:min-w-56"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t.order.review.submitting}
                    </>
                  ) : (
                    <>
                      <Check className="size-4" />
                      {t.order.review.submit}
                    </>
                  )}
                </button>
              </div>
            </section>
            </div>
          ) : null}
        </div>

      </div>


      <LocationPopup
        zone={locationPopup}
        storeAddress={settings.address ?? null}
        onClose={() => setLocationPopup(null)}
      />

      <PickupStorePicker
        open={pickupPickerOpen}
        zones={pickupZones}
        selectedId={draft.deliveryZone}
        onPick={(z) => {
          updateDraft({ deliveryZone: z.id });
          setPickupPickerOpen(false);
        }}
        onClose={() => setPickupPickerOpen(false)}
      />

      {qrisPayload ? (
        <QrisPaymentModal
          payload={qrisPayload}
          open={qrisModalOpen}
          onClose={() => {
            setQrisModalOpen(false);
            // Kalau user menutup modal sebelum paid, redirect ke /track
            // supaya mereka bisa cek status order.
            router.push("/track");
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- komponen kecil ---------- */

function StepHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
        {icon}
      </span>
      <div className="min-w-0">
        <h1 className="text-xl leading-tight font-extrabold text-cocoa-900">{title}</h1>
        <p className="mt-1 text-[13px] text-cocoa-500">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * Popup PEMILIHAN toko untuk metode "Ambil di toko".
 *
 * Steven 14-10-2026 (gambar 3): "sbnrnya maksud saya pop up bukan begitu,
 * tapi misal saat mereka pilih ambil ditoko ada baru pilihan popup untuk
 * memilih mau ambilnya di toko mana".
 *
 * Bedanya dengan `LocationPopup`: yang ini MEMILIH (satu klik langsung
 * menutup dan memakai toko itu), sedangkan `LocationPopup` cuma MEMBACA
 * detail dari toko yang sudah terpilih.
 *
 * Sumber datanya `delivery_zones` dengan `kind = 'pickup'`, jadi tidak ada
 * tabel toko baru: admin sudah mobilizing titik ini dari menu "Ambil &
 * Kirim". Kalau nanti daftar toko tumbuh jadi datastore sendiri, cukup ganti
 * isi prop `zones`.
 */
function PickupStorePicker({
  open,
  zones,
  selectedId,
  onPick,
  onClose,
}: {
  open: boolean;
  zones: DeliveryZone[];
  selectedId: string;
  onPick: (zone: DeliveryZone) => void;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-cocoa-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.order.payment.pickupChooseTitle}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-cocoa-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-cocoa-900">
            <Store className="size-5 text-matcha-600" />
            {t.order.payment.pickupChooseTitle}
          </h2>
          <p className="mt-0.5 text-[13px] text-cocoa-500">
            {t.order.payment.pickupChooseHint}
          </p>
        </div>

        {zones.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-cocoa-400">
            {t.order.payment.pickupEmpty}
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-cocoa-100 overflow-y-auto">
            {zones.map((z) => {
              const name = lang === "en" ? z.name_en : z.name_id;
              const note = (lang === "en" ? z.note_en : z.note_id) ?? "";
              const on = selectedId === z.id;
              return (
                <li key={z.id}>
                  <button
                    type="button"
                    onClick={() => onPick(z)}
                    className={`flex w-full items-center gap-3 px-5 py-4 text-left transition ${
                      on ? "bg-matcha-50" : "hover:bg-cocoa-50"
                    }`}
                  >
                    <span
                      className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                        on ? "bg-matcha-500 text-white" : "bg-cocoa-100 text-cocoa-600"
                      }`}
                    >
                      <Store className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-cocoa-900">
                        {name}
                      </span>
                      {note ? (
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-cocoa-500">
                          {note}
                        </span>
                      ) : null}
                    </span>
                    {on ? <Check className="size-5 shrink-0 text-matcha-600" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t border-cocoa-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-primary w-full"
          >
            {t.order.payment.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Popup detail lokasi pengambilan / pengantaran.
 *
 * Steven 13-10-2026: popup muncul untuk KEDUA metode — "Ambil di Toko"
 * maupun "Diantar". Titik dan jamnya ditentukan admin, jadi pembeli perlu
 * tahu sebelum menekan lanjut. Isinya sengaja memakai data yang sudah ada
 * (nama + catatan zona dari "Ambil & Kirim", alamat toko dari Pengaturan)
 * — tidak ada data komersial yang dikarang di sini.
 */
function LocationPopup({
  zone,
  storeAddress,
  onClose,
}: {
  zone: DeliveryZone | null;
  storeAddress: string | null;
  onClose: () => void;
}) {
  const { t, lang } = useI18n();

  useEffect(() => {
    if (!zone) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zone, onClose]);

  if (!zone) return null;

  const isPickup = zone.kind === "pickup";
  const name = lang === "en" ? zone.name_en : zone.name_id;
  const note = (lang === "en" ? zone.note_en : zone.note_id) ?? "";
  // Alamat toko hanya relevan untuk ambil di toko. Untuk antar, alamat
  // tujuan itu milik pembeli dan sudah ditulis di form.
  const address = isPickup ? storeAddress : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-cocoa-900/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={t.order.payment.locationPopup}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cocoa-800 text-cream-50">
            {isPickup ? <Store className="size-5" /> : <MapPin className="size-5" />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg leading-tight font-extrabold text-cocoa-900">{name}</h2>
            <p className="mt-1 text-[13px] text-cocoa-500">
              {isPickup ? t.order.payment.pickup : t.order.payment.delivery}
            </p>
          </div>
        </div>

        {note ? (
          <p className="mt-4 rounded-xl bg-cream-50 px-3.5 py-3 text-sm leading-relaxed font-semibold text-cocoa-700">
            {note}
          </p>
        ) : null}

        {address ? (
          <p className="mt-3 text-sm leading-relaxed text-cocoa-600">{address}</p>
        ) : null}

        {!note && !address ? (
          <p className="mt-4 text-sm text-cocoa-500">
            {t.order.payment.locationEmpty}
          </p>
        ) : null}

        <button type="button" onClick={onClose} className="btn-primary mt-6 w-full">
          {t.common.close}
        </button>
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextIcon,
  disabled,
}: {
  onBack: (() => void) | null;
  onNext: () => void;
  nextLabel: string;
  nextIcon?: React.ReactNode;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
      {onBack ? (
        <button type="button" onClick={onBack} className="btn-ghost">
          <ArrowLeft className="size-4" />
          {t.common.back}
        </button>
      ) : (
        <span />
      )}
      <button type="button" onClick={onNext} disabled={disabled} className="btn-primary sm:min-w-44">
        {nextLabel}
        {nextIcon}
      </button>
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  icon,
  title,
  desc,
  note,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc?: string;
  note?: string;
}) {
  /* Steven 14-10-2026 (screenshot kartu QRIS): "yang QRIS coba dirapikan
     lagi buat lebih center dari jarak atas ke bawah".

     Penyebabnya BUKAN isi kartu QRIS — kartu itu memang cuma berisi ikon +
     judul. Masalahnya grid metode pembayaran menyamakan tinggi semua kartu,
     sedangkan kartu "Transfer bank" lebih tinggi karena punya deskripsi +
     catatan. Efeknya isi QRIS nempel di atas dan menyisakan rongga kosong
     di bawah.

     Perbaikannya `justify-center` pada wrapper button: kartu tetap setinggi
     kartu tertinggi, tapi isinya jadi rata tengah. */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start justify-center gap-3 rounded-2xl border-2 p-4 text-left transition ${
        selected
          ? "border-matcha-500 bg-matcha-50"
          : "border-cocoa-200 bg-white hover:border-cocoa-300 hover:bg-cocoa-50/50"
      }`}
    >
      <span className="flex w-full items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-xl transition ${
            selected ? "bg-matcha-500 text-white" : "bg-cocoa-100 text-cocoa-600"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-bold text-cocoa-900">
            {title}
            {selected ? <Check className="size-4 shrink-0 text-matcha-600" /> : null}
          </span>
          {/* `desc` boleh kosong. Steven 13-10-2026 meminta deskripsi QRIS
              dihapus, dan beberapa kartu lain memang lebih baik tanpa teks
              tambahan. Kalau kosong, blok deskripsi tidak dirender sama sekali
              supaya tidak menyisakan jarak kosong di dalam kartu. */}
          {desc ? (
            <span className="mt-0.5 block text-xs leading-relaxed text-cocoa-500">
              {desc}
            </span>
          ) : null}
        </span>
      </span>

      {/* Catatan dari pengaturan dashboard */}
      {note ? (
        <span
          className={`block w-full rounded-xl px-3 py-2 text-[12px] leading-relaxed font-semibold ${
            selected
              ? "bg-white/70 text-cocoa-700"
              : "bg-cocoa-50 text-cocoa-500"
          }`}
        >
          {note}
        </span>
      ) : null}
    </button>
  );
}

function AccountCard({
  bank,
  number,
  holder,
  copyLabel,
  copiedLabel,
  copyFailedLabel,
}: {
  bank: string;
  number: string;
  holder: string;
  copyLabel: string;
  copiedLabel: string;
  copyFailedLabel: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(copyFailedLabel);
    }
  }

  return (
    <div className="rounded-2xl border border-cocoa-200 bg-white p-3.5">
      <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">{bank}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-cocoa-900 tabular" dir="ltr">
          {number}
        </p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-cocoa-200 p-1.5 text-cocoa-500 transition hover:bg-cocoa-50 hover:text-cocoa-800"
          aria-label={copyLabel}
          title={copyLabel}
        >
          {copied ? <Check className="size-3.5 text-matcha-600" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      {holder ? (
        <p className="mt-0.5 truncate text-[11px] text-cocoa-400">{holder}</p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ""}
      </span>
    </div>
  );
}

function ReviewRow({
  label,
  children,
  onEdit,
  editLabel,
}: {
  label: string;
  children: React.ReactNode;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="flex items-start gap-4 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">{label}</p>
        <div className="mt-1 text-sm leading-relaxed text-cocoa-800">{children}</div>
      </div>
      {onEdit && editLabel ? (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold text-matcha-600 transition hover:bg-matcha-50"
        >
          {editLabel}
        </button>
      ) : null}
    </div>
  );
}
