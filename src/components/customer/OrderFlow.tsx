"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Copy,
  Loader2,
  ShoppingBag,
  Store,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import type {
  CartLine,
  Category,
  StoreSettings,
} from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { ProofUploader } from "@/components/customer/ProofUploader";
import { OrderMenuBrowser } from "@/components/customer/MenuBrowser";
import { AddressPicker } from "@/components/customer/AddressPicker";
import { formatIDR, formatPhone, saveInvoice } from "@/lib/utils";

const STEPS = ["identity", "menu", "payment", "review"] as const;
type Step = (typeof STEPS)[number];

export function OrderFlow({
  categories,
  settings,
}: {
  categories: Category[];
  settings: StoreSettings;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const {
    quantities,
    notes,
    draft,
    totalItems,
    updateDraft,
    reset,
    clearIdentity,
  } = useCart();

  // Jangan biarkan nama & nomor telepon tertinggal di browser kalau pembeli
  // meninggalkan halaman ini Ã¢â‚¬â€ baik lewat navigasi dalam aplikasi (komponen
  // di-unmount) maupun menutup / memuat ulang tab.
  //
  // `clearIdentity` disimpan di ref supaya listener tidak dibuat ulang tiap
  // kali keranjang berubah; tanpa ini data akan terhapus saat pembeli masih
  // sedang mengetik.
  const clearIdentityRef = useRef(clearIdentity);
  useEffect(() => {
    clearIdentityRef.current = clearIdentity;
  }, [clearIdentity]);

  useEffect(() => {
    const onLeave = () => clearIdentityRef.current();
    // Saat komponen di-unmount (pindah halaman)
    const onUnmount = () => clearIdentityRef.current();
    // Saat tab ditutup atau dimuat ulang
    window.addEventListener("pagehide", onLeave);
    return () => {
      window.removeEventListener("pagehide", onLeave);
      onUnmount();
    };
  }, []);

  // Selalu mulai dari langkah identitas (nama + telepon).
  const [step, setStep] = useState<Step>("identity");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Stok per-kategori — total pcs dari kategori ini tidak boleh
  // melebihi sisa stok kategori. Bundle (iterasi berikut) akan
  // mengurangi stok kategori-nya sendiri.
  const stockByCategory = useMemo(() => {
    const m = new Map<number, { enabled: boolean; left: number }>();
    for (const c of categories) {
      m.set(c.id, {
        enabled: c.stock_enabled,
        left: Math.max(0, c.stock ?? 0),
      });
    }
    return m;
  }, [categories]);

  // Semua rasa dikumpulkan dari kategori yang tampil.
  const flavors = useMemo(
    () => categories.flatMap((c) => c.flavors ?? []),
    [categories]
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
  // Subtotal = harga satuan * qty (tanpa paket otomatis).
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

  const subtotal = groups.reduce((sum, g) => sum + g.total, 0);
  const saving = 0;

  // Daftar zona delivery dari settings — selalu ada 1+ (fallback ke pickup).
  const deliveryZones =
    settings.delivery_zones && settings.delivery_zones.length > 0
      ? settings.delivery_zones
      : [
          {
            id: "pickup",
            name_id: "Ambil di toko",
            name_en: "Pickup in store",
            fee: 0,
            note_id: "",
            note_en: "",
          },
        ];

  // Ongkir dari zona delivery (kalau pickup = 0). Ambil dari settings.delivery_zones.
  const currentZone = deliveryZones.find((z) => z.id === draft.deliveryZone);
  const deliveryFee =
    draft.deliveryMethod === "delivery" && currentZone ? currentZone.fee : 0;
  const total = subtotal + deliveryFee;

  const pickupNote = lang === "en" ? settings.pickup_note_en : settings.pickup_note_id;

  const stepIndex = STEPS.indexOf(step);

  function goTo(target: Step) {
    setErrors({});
    setStep(target);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateIdentity(): boolean {
    const next: Record<string, string> = {};
    if (draft.name.trim().length < 2) next.name = t.order.identity.nameError;
    const digits = draft.phone.replace(/\D/g, "");
    if (digits.length < 9) next.phone = t.order.identity.phoneError;
    // Email wajib (format sederhana).
    const email = draft.email.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = t.order.identity.emailError;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateMenu(): boolean {
    if (cartLines.length === 0 || totalItems < settings.min_order) {
      toast.warning(
        t.order.menu.cartEmpty,
        t.order.menu.minOrderWarning.replace("{n}", String(settings.min_order))
      );
      return false;
    }
    // Stok per-kategori: total pcs tiap kategori tidak boleh melebihi
    // sisa stok kategori itu. Bundle menyusul di iterasi berikut.
    for (const g of groups) {
      const catId = g.category?.id;
      if (!catId) continue;
      const s = stockByCategory.get(catId);
      if (s?.enabled && g.qty > s.left) {
        toast.error(t.errors.insufficient_stock);
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
    // Bukti transfer TIDAK wajib saat submit — pembeli boleh transfer
    // dulu, baru upload bukti di langkah review, atau kirim via WA
    // belakangan. Penjual akan follow up via WhatsApp.
    return true;
  }

  function handleNext() {
    if (step === "identity" && !validateIdentity()) return;
    if (step === "menu" && !validateMenu()) return;
    if (step === "payment" && !validatePayment()) return;
    const next = STEPS[Math.min(stepIndex + 1, STEPS.length - 1)];
    goTo(next);
  }

  async function handleSubmit() {
    if (!validateIdentity() || !validateMenu() || !validatePayment()) {
      toast.error(t.errors.generic);
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_order", {
        p_customer_name: draft.name.trim(),
        p_customer_email: draft.email.trim(),
        p_instagram: draft.instagram.trim(),
        p_phone: draft.phone.trim(),
        p_payment_method: "transfer",
        p_delivery_method: draft.deliveryMethod,
        p_delivery_zone: draft.deliveryZone,
        p_address:
          draft.deliveryMethod === "delivery" ? draft.address.trim() : null,
        p_address_note:
          draft.deliveryMethod === "delivery" ? draft.addressNote.trim() : null,
        p_lat: draft.lat,
        p_lng: draft.lng,
        p_transfer_method: draft.transferMethod || null,
        p_payment_proof: draft.proofPath,
        p_note: draft.note.trim(),
        p_language: lang,
        p_items: cartLines.map((l) => ({
          flavor_id: l.flavor.id,
          quantity: l.qty,
          note: notes[String(l.flavor.id)] || null,
        })),
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
        payment_method: "transfer" as const,
        transfer_method: draft.transferMethod || null,
        delivery_method: draft.deliveryMethod,
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
        subtotal,
        delivery_fee: deliveryFee,
        saving,
        total,
      };
      saveInvoice(invoice);
      // Kosongkan keranjang + data pengirim supaya pesanan berikutnya
      // dimulai dari form yang bersih.
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
    identity: t.order.stepIdentity,
    menu: t.order.stepMenu,
    payment: t.order.stepPayment,
    review: t.order.stepReview,
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* ---------- Progress ---------- */}
      <div className="mb-8">
        <ol className="flex items-center gap-1.5 sm:gap-3">
          {STEPS.map((s, i) => {
            const done = i < stepIndex;
            const active = i === stepIndex;
            return (
              <li key={s} className="flex flex-1 flex-col gap-2">
                <span
                  className={`h-1.5 rounded-full transition-colors ${
                    done ? "bg-matcha-500" : active ? "bg-cocoa-800" : "bg-cocoa-200"
                  }`}
                />
                <span
                  className={`hidden text-[11px] font-bold tracking-wide uppercase sm:block ${
                    active ? "text-cocoa-800" : done ? "text-matcha-600" : "text-cocoa-300"
                  }`}
                >
                  {stepTitles[s]}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs font-bold text-cocoa-400 sm:hidden">
          {t.order.stepOf
            .replace("{n}", String(stepIndex + 1))
            .replace("{total}", String(STEPS.length))}{" "}
          Ã‚Â· {stepTitles[step]}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="min-w-0">
          {/* ============ LANGKAH 1: IDENTITAS ============ */}
          {step === "identity" ? (
            <section className="card p-6 sm:p-8">
              <StepHeading
                icon={<User className="size-5" />}
                title={t.order.identity.title}
                subtitle={t.order.identity.subtitle}
              />
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
                      <span className="ml-1 text-berry-500">*</span>
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
                      <span className="ml-1 text-cocoa-400 text-[10px] font-semibold">
                        ({t.common.optional})
                      </span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm font-bold text-cocoa-400">
                        @
                      </span>
                      <input
                        id="instagram"
                        dir="ltr"
                        className="input pl-9"
                        placeholder="username"
                        value={draft.instagram}
                        autoComplete="off"
                        onChange={(e) =>
                          updateDraft({
                            instagram: e.target.value.replace(/^@/, "").replace(/\s/g, ""),
                          })
                        }
                      />
                    </div>
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
            <section>
              <div className="card mb-6 p-6 sm:p-8">
                <StepHeading
                  icon={<ShoppingBag className="size-5" />}
                  title={t.order.menu.title}
                  subtitle={t.order.menu.subtitle}
                />
                {/* Info stok per kategori — total pcs yang masih tersedia */}
                <StockBadge categories={categories} t={t} />
              </div>

              {/* Rincian item: klik kategori dulu, lalu rasa-rasanya */}
              {categories.length === 0 ? (
                <p className="card p-8 text-center text-cocoa-400 sm:p-10">{t.menu.empty}</p>
              ) : (
                <OrderMenuBrowser
                  categories={categories}
                  remainingStock={null}
                />
              )}

              <StepNav
                onBack={() => goTo("identity")}
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

              {/* Pembayaran: hanya transfer (cash dihapus) */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  selected
                  onClick={() => updateDraft({ paymentMethod: "transfer" })}
                  icon={<Building2 className="size-5" />}
                  title={t.order.payment.transfer}
                  desc={t.order.payment.transferDesc}
                />
              </div>

              {/* Cara pengambilan — dengan catatan yang bisa diatur di dashboard */}
              <h3 className="mt-8 text-base font-bold text-cocoa-800">
                {t.order.payment.deliveryTitle}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {deliveryZones.map((z) => {
                  const zName = lang === "en" ? z.name_en : z.name_id;
                  const zNote =
                    (lang === "en" ? z.note_en : z.note_id) ?? "";
                  const isPickup = z.id === "pickup";
                  return (
                    <ChoiceCard
                      key={z.id}
                      selected={draft.deliveryZone === z.id}
                      onClick={() => {
                        updateDraft({
                          deliveryZone: z.id,
                          deliveryMethod: isPickup ? "pickup" : "delivery",
                        });
                      }}
                      icon={isPickup ? <Store className="size-5" /> : <Truck className="size-5" />}
                      title={zName}
                      desc={
                        z.fee > 0
                          ? `${formatIDR(z.fee, lang)}`
                          : lang === "en"
                            ? "Free"
                            : "Gratis"
                      }
                      note={zNote || (isPickup ? pickupNote : "")}
                    />
                  );
                })}
              </div>

              {/* Alamat + map picker — hanya untuk delivery (zone != 'pickup') */}
              {draft.deliveryZone !== "pickup" ? (
                <AddressPicker
                  draft={draft}
                  updateDraft={updateDraft}
                  dict={t.order.payment}
                />
              ) : settings.address ? (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-cocoa-200 bg-cocoa-50 p-4">
                  <Store className="mt-0.5 size-5 shrink-0 text-cocoa-400" />
                  <div>
                    <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                      {t.order.payment.address}
                    </p>
                    <p className="mt-0.5 text-[13px] text-cocoa-600">{settings.address}</p>
                    {settings.hours_id ? (
                      <p className="mt-1 text-xs text-cocoa-400">
                        {t.contact.hours}: {settings.hours_id}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

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
                        {settings.qris_enabled ? <option value="QRIS">QRIS</option> : null}
                      </select>
                    </div>
                  ) : null}

                  {settings.qris_enabled && settings.qris_image_url ? (
                    <div>
                      <h3 className="text-base font-bold text-cocoa-800">
                        {t.order.payment.qris}
                      </h3>
                      <QrImage src={settings.qris_image_url} />
                    </div>
                  ) : null}

                  {settings.bank_accounts.length === 0 && !settings.qris_enabled ? (
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
          {step === "review" ? (
            <section className="card p-6 sm:p-8">
              <StepHeading
                icon={<Check className="size-5" />}
                title={t.order.review.title}
                subtitle={t.order.review.subtitle}
              />

              <div className="mt-6 divide-y divide-cocoa-100">
                <ReviewRow
                  label={t.order.review.nameLabel}
                  onEdit={() => goTo("identity")}
                  editLabel={t.order.review.editDetails}
                >
                  {draft.name}
                </ReviewRow>
                <ReviewRow
                  label={t.order.review.phoneLabel}
                  onEdit={() => goTo("identity")}
                  editLabel={t.order.review.editDetails}
                >
                  <span dir="ltr">{formatPhone(draft.phone)}</span>
                </ReviewRow>
                <ReviewRow label={t.order.review.paymentLabel} onEdit={() => goTo("payment")} editLabel={t.order.review.editPayment}>
                  {`${t.order.payment.transfer}${
                    draft.transferMethod ? ` · ${draft.transferMethod}` : ""
                  }`}
                </ReviewRow>
                <ReviewRow label={t.order.review.deliveryLabel} onEdit={() => goTo("payment")} editLabel={t.order.review.editPayment}>
                  {draft.deliveryMethod === "delivery"
                    ? `${t.order.payment.delivery} Ã¢â‚¬â€ ${draft.address}`
                    : `${t.order.payment.pickup}${settings.address ? ` Ã¢â‚¬â€ ${settings.address}` : ""}`}
                </ReviewRow>
                <ReviewRow
                  label={t.order.review.itemsLabel}
                  onEdit={() => goTo("menu")}
                  editLabel={t.order.review.editItems}
                >
                  <ul className="space-y-2.5">
                    {groups.map((g) => (
                      <li key={g.category?.id ?? `solo-${g.lines[0]?.flavor.id}`}>
                        {g.category ? (
                          <p className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                            {lang === "en" ? g.category.name_en : g.category.name_id}
                          </p>
                        ) : null}
                        {g.lines.map((l) => (
                          <div key={l.flavor.id} className="flex justify-between gap-4">
                            <span>
                              {l.qty}× {lang === "en" ? l.flavor.name_en : l.flavor.name_id}
                            </span>
                            <span className="tabular text-cocoa-500">
                              {formatIDR(l.flavor.price * l.qty, lang)}
                            </span>
                          </div>
                        ))}
                        <div className="flex justify-between gap-4 font-bold text-cocoa-800">
                          <span>
                            {g.qty} {t.common.qty.toLowerCase()}
                          </span>
                          <span className="tabular">{formatIDR(g.total, lang)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ReviewRow>
              </div>

              {/* Catatan */}
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

              {/* Ringkasan biaya */}
              <div className="mt-6 rounded-2xl bg-cocoa-50 p-4">
                <div className="flex justify-between text-sm text-cocoa-600">
                  <span>{t.common.subtotal}</span>
                  <span className="tabular">{formatIDR(subtotal, lang)}</span>
                </div>

                {saving > 0 ? (
                  <div className="mt-2 flex justify-between text-sm font-bold text-matcha-600">
                    <span>{t.order.review.saving}</span>
                    <span className="tabular">−{formatIDR(saving, lang)}</span>
                  </div>
                ) : null}

                {draft.deliveryMethod === "delivery" ? (
                  <div className="mt-2 flex justify-between text-sm text-cocoa-600">
                    <span>{t.order.review.deliveryFee}</span>
                    <span className="tabular">
                      {deliveryFee === 0
                        ? t.order.review.freeShipping
                        : formatIDR(deliveryFee, lang)}
                    </span>
                  </div>
                ) : null}
                <div className="mt-3 flex justify-between border-t border-cocoa-200 pt-3 text-lg font-extrabold text-cocoa-900">
                  <span>{t.order.review.totalLabel}</span>
                  <span className="tabular">{formatIDR(total, lang)}</span>
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
          ) : null}
        </div>

        {/* ---------- Ringkasan_order (sidebar) ---------- */}
        <aside className="lg:sticky lg:top-24">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-cocoa-100 bg-cocoa-50 px-4 py-3">
              <h2 className="text-sm font-bold text-cocoa-800">{t.order.menu.cartTitle}</h2>
              <span className="chip bg-cocoa-200/70 text-cocoa-700 tabular">
                {totalItems} {t.common.qty.toLowerCase()}
              </span>
            </div>

            {cartLines.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-cocoa-400">
                {t.order.menu.cartEmpty}
              </p>
            ) : (
              <ul className="divide-y divide-cocoa-100">
                {groups.map((g) => (
                  <li key={g.category?.id ?? `solo-${g.lines[0]?.flavor.id}`} className="px-4 py-3">
                    {/* Nama jenis makanan — paket dihitung per jenis */}
                    {g.category ? (
                      <p className="mb-1.5 text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                        {lang === "en" ? g.category.name_en : g.category.name_id}
                      </p>
                    ) : null}

                    {g.lines.map((l) => (
                      <div key={l.flavor.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-cocoa-800">
                            {lang === "en" ? l.flavor.name_en : l.flavor.name_id}
                          </p>
                          <p className="text-[11px] text-cocoa-400 tabular">
                            {l.qty} × {formatIDR(l.flavor.price, lang)}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Subtotal untuk jenis makanan ini */}
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <p className="text-[12px] font-semibold text-cocoa-600 tabular">
                        {g.qty} {t.common.qty.toLowerCase()}
                      </p>
                      <p className="text-[13px] font-bold text-cocoa-800 tabular">
                        {formatIDR(g.total, lang)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-cocoa-100 bg-cocoa-50 px-4 py-3.5 text-sm">
              <div className="flex justify-between text-cocoa-600">
                <span>{t.common.subtotal}</span>
                <span className="tabular">{formatIDR(subtotal, lang)}</span>
              </div>

              {saving > 0 ? (
                <div className="flex justify-between font-bold text-matcha-600">
                  <span>{t.order.review.saving}</span>
                  <span className="tabular">−{formatIDR(saving, lang)}</span>
                </div>
              ) : null}

              {draft.deliveryMethod === "delivery" ? (
                <div className="flex justify-between text-cocoa-600">
                  <span>{t.order.review.deliveryFee}</span>
                  <span className="tabular">
                    {deliveryFee === 0
                      ? t.order.review.freeShipping
                      : formatIDR(deliveryFee, lang)}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-cocoa-200 pt-2 text-base font-extrabold text-cocoa-900">
                <span>{t.common.total}</span>
                <span className="tabular">{formatIDR(total, lang)}</span>
              </div>
            </div>

            {totalItems > 0 && totalItems < settings.min_order ? (
              <p className="border-t border-honey-300/40 bg-honey-300/15 px-4 py-2.5 text-center text-xs font-bold text-honey-500">
                {t.order.menu.minOrderWarning.replace("{n}", String(settings.min_order))}
              </p>
            ) : null}
          </div>

          {settings.whatsapp ? (
            <a
              href={`https://wa.me/${settings.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline mt-4 w-full"
            >
              <MessageIcon />
              {t.track.waSeller}
            </a>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/* ---------- komponen kecil ---------- */

function MessageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
    </svg>
  );
}

/**
 * Badge kecil di header langkah menu: total pcs dari semua kategori yang
 * membatasi stok. Hanya dirender bila ada kategori dengan `stock_enabled`.
 */
function StockBadge({
  categories,
  t,
}: {
  categories: Category[];
  t: ReturnType<typeof useI18n>["t"];
}) {
  // Akumulasi total pcs tersisa untuk kategori yang membatasi stok.
  const tracked = categories.filter((c) => c.stock_enabled);
  if (tracked.length === 0) return null;
  const total = tracked.reduce((s, c) => s + Math.max(0, c.stock ?? 0), 0);
  const low = total > 0 && total <= 5;

  return (
    <p
      className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ${
        total > 0
          ? low
            ? "bg-honey-300/20 text-honey-500"
            : "bg-matcha-50 text-matcha-700"
          : "bg-berry-500/10 text-berry-600"
      }`}
    >
      {total > 0
        ? t.order.menu.stockLeft.replace("{n}", String(total))
        : t.menu.soldOut}
    </p>
  );
}

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
  desc: string;
  note?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
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
          <span className="mt-0.5 block text-xs leading-relaxed text-cocoa-500">
            {desc}
          </span>
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

function QrImage({ src }: { src: string }) {
  return (
    <div className="mt-3 inline-flex rounded-2xl border border-cocoa-200 bg-white p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="QRIS" className="size-40 object-contain" />
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