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
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  Truck,
  User,
  Wallet,
} from "lucide-react";
import type { DeliveryMethod, Flavor, PaymentMethod, StoreSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { ProofUploader } from "@/components/customer/ProofUploader";
import { FlavorCard } from "@/components/customer/FlavorCard";
import { calcBundle, formatIDR, formatPhone } from "@/lib/utils";

const STEPS = ["identity", "menu", "payment", "review"] as const;
export type Step = (typeof STEPS)[number];

export function OrderFlow({
  flavors,
  settings,
  initialStep = "identity",
}: {
  flavors: Flavor[];
  settings: StoreSettings;
  initialStep?: Step;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const {
    quantities,
    draft,
    add,
    setQuantity,
    remove,
    totalItems,
    updateDraft,
    reset,
    clearIdentity,
  } = useCart();

  // Jangan biarkan nama & nomor telepon tertinggal di browser kalau pembeli
  // meninggalkan halaman ini — baik lewat navigasi dalam aplikasi (komponen
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

  // Langkah awal diberikan oleh Server Component (dari ?step=), supaya
  // halaman ini tetap bisa di-render di server tanpa membaca `window`.
  const [step, setStep] = useState<Step>(initialStep);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const maxQty = Math.max(1, settings.max_per_order);
  const stockEnabled = settings.stock_enabled;
  const stockLeft = settings.total_stock;
  const flavorById = useMemo(() => new Map(flavors.map((f) => [f.id, f])), [flavors]);

  const cartLines = useMemo(
    () =>
      (Object.entries(quantities) as [string, number][])
        .map(([id, qty]) => ({ flavor: flavorById.get(Number(id)), qty }))
        .filter((l): l is { flavor: Flavor; qty: number } => Boolean(l.flavor)),
    [quantities, flavorById]
  );

  const rawTotal = cartLines.reduce((sum, l) => sum + l.flavor.price * l.qty, 0);
  // Harga satuan rata-rata, dipakai untuk sisa pcs di luar paket.
  const avgUnitPrice =
    totalItems > 0 ? Math.round(rawTotal / totalItems) : (flavors[0]?.price ?? 0);

  const bundle = calcBundle(totalItems, avgUnitPrice, {
    enabled: settings.bundle_enabled,
    size: settings.bundle_size,
    price: settings.bundle_price,
  });
  const subtotal = bundle.total;

  // Ongkir hanya untuk pengiriman; ambil di tempat gratis.
  const deliveryFee =
    draft.deliveryMethod === "delivery" ? settings.delivery_fee : 0;
  const total = subtotal + deliveryFee;

  const pickupNote = lang === "en" ? settings.pickup_note_en : settings.pickup_note_id;
  const deliveryNote = lang === "en" ? settings.delivery_note_en : settings.delivery_note_id;

  // Contoh: "Beli 2 = Rp35.000" — dibuat dari pengaturan supaya tidak perlu
  // diubah manual kalau harga paket-nya diganti.
  const bundleOffer = t.order.review.bundleOffer
    .replace("{n}", String(settings.bundle_size))
    .replace("{price}", formatIDR(settings.bundle_price, lang));

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
    // Stok global: total pesanan tidak boleh melebihi sisa stok.
    if (settings.stock_enabled && totalItems > settings.total_stock) {
      toast.error(t.errors.insufficient_stock);
      return false;
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
    if (draft.paymentMethod === "transfer" && !draft.proofPath) {
      toast.warning(t.order.payment.proofRequired);
      return false;
    }
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
        p_phone: draft.phone.trim(),
        p_payment_method: draft.paymentMethod,
        p_delivery_method: draft.deliveryMethod,
        p_address: draft.deliveryMethod === "delivery" ? draft.address.trim() : null,
        p_transfer_method: draft.transferMethod || null,
        p_payment_proof: draft.proofPath,
        p_note: draft.note.trim(),
        p_language: lang,
        p_items: cartLines.map((l) => ({ flavor_id: l.flavor.id, quantity: l.qty })),
      });

      if (error) {
        const key = error.message as keyof typeof t.errors;
        const message =
          t.errors[key as keyof typeof t.errors] ?? t.errors.generic;
        toast.error(message, error.message);
        return;
      }

      const code = (data as { order_code: string }).order_code;
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
          · {stepTitles[step]}
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
                {settings.stock_enabled ? (
                  <p
                    className={`mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold ${
                      stockLeft > 0
                        ? stockLeft <= 5
                          ? "bg-honey-300/20 text-honey-500"
                          : "bg-matcha-50 text-matcha-700"
                        : "bg-berry-500/10 text-berry-600"
                    }`}
                  >
                    {stockLeft > 0
                      ? t.order.menu.stockLeft.replace("{n}", String(stockLeft))
                      : t.menu.soldOut}
                  </p>
                ) : null}

                {/* Info harga paket */}
                {settings.bundle_enabled ? (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-xl bg-berry-500/10 px-3.5 py-2 text-sm font-bold text-berry-600">
                    <Sparkles className="size-4" />
                    {bundleOffer}
                  </p>
                ) : null}
              </div>

              {flavors.length === 0 ? (
                <p className="card p-10 text-center text-cocoa-400">{t.menu.empty}</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {flavors.map((f) => {
                    const inCart = quantities[f.id] ?? 0;
                    // Batas per rasa: maksimum pesanan, atau sisa stok global.
                    const limit = stockEnabled
                      ? Math.max(0, Math.min(maxQty, stockLeft))
                      : maxQty;
                    return (
                      <div key={f.id} className="flex flex-col gap-3">
                        <FlavorCard
                          flavor={f}
                          compact
                          inCart={inCart}
                          remainingStock={stockEnabled ? stockLeft : null}
                          onAdd={inCart >= limit || limit === 0 ? undefined : add}
                        />
                        {inCart > 0 ? (
                          <div className="flex items-center justify-between rounded-2xl border border-cocoa-200 bg-white p-2.5 shadow-sm">
                            <span className="min-w-0 flex-1 truncate pl-1 text-sm font-bold text-cocoa-800">
                              {lang === "en" ? f.name_en : f.name_id}
                            </span>
                            <div className="flex items-center gap-1">
                              <QtyButton
                                onClick={() => setQuantity(f.id, inCart - 1)}
                                label={`- ${lang === "en" ? f.name_en : f.name_id}`}
                              >
                                <Minus className="size-4" />
                              </QtyButton>
                              <span className="w-9 text-center text-sm font-extrabold tabular text-cocoa-900">
                                {inCart}
                              </span>
                              <QtyButton
                                onClick={() => setQuantity(f.id, inCart + 1)}
                                disabled={inCart >= limit}
                                label={`+ ${lang === "en" ? f.name_en : f.name_id}`}
                              >
                                <Plus className="size-4" />
                              </QtyButton>
                              <button
                                type="button"
                                onClick={() => remove(f.id)}
                                className="ml-0.5 rounded-lg p-2 text-cocoa-300 transition hover:bg-berry-500/10 hover:text-berry-500"
                                aria-label={t.order.menu.remove}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
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

              {/* Metode pembayaran — hanya cara bayar, tanpa pilihan terima */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  selected={draft.paymentMethod === "transfer"}
                  onClick={() => updateDraft({ paymentMethod: "transfer" as PaymentMethod })}
                  icon={<Building2 className="size-5" />}
                  title={t.order.payment.transfer}
                  desc={t.order.payment.transferDesc}
                />
                <ChoiceCard
                  selected={draft.paymentMethod === "cash"}
                  onClick={() => updateDraft({ paymentMethod: "cash" as PaymentMethod })}
                  icon={<Wallet className="size-5" />}
                  title={t.order.payment.cash}
                  desc={t.order.payment.cashDesc}
                />
              </div>

              {/* Cara pengambilan — dengan catatan yang bisa diatur di dashboard */}
              <h3 className="mt-8 text-base font-bold text-cocoa-800">
                {t.order.payment.deliveryTitle}
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  selected={draft.deliveryMethod === "pickup"}
                  onClick={() => updateDraft({ deliveryMethod: "pickup" as DeliveryMethod })}
                  icon={<Store className="size-5" />}
                  title={t.order.payment.pickup}
                  desc={t.order.payment.pickupDesc}
                  note={pickupNote}
                />
                <ChoiceCard
                  selected={draft.deliveryMethod === "delivery"}
                  onClick={() => updateDraft({ deliveryMethod: "delivery" as DeliveryMethod })}
                  icon={<Truck className="size-5" />}
                  title={t.order.payment.delivery}
                  desc={t.order.payment.deliveryDesc}
                  note={deliveryNote}
                />
              </div>

              {/* Alamat hanya diminta kalau dikirim */}
              {draft.deliveryMethod === "delivery" ? (
                <div className="mt-4">
                  <label htmlFor="address" className="label">
                    {t.order.payment.address}
                  </label>
                  <textarea
                    id="address"
                    rows={3}
                    className="input resize-none"
                    placeholder={t.order.payment.addressPlaceholder}
                    value={draft.address}
                    onChange={(e) => updateDraft({ address: e.target.value })}
                  />
                  {settings.delivery_fee > 0 ? (
                    <p className="mt-1.5 text-xs text-cocoa-400 tabular">
                      {t.order.review.deliveryFee}: {formatIDR(settings.delivery_fee, lang)}
                    </p>
                  ) : null}
                </div>
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

                  <div>
                    <h3 className="mb-3 text-base font-bold text-cocoa-800">
                      {t.order.payment.proofTitle}
                    </h3>
                    <ProofUploader
                      path={draft.proofPath}
                      required
                      onChange={(p) => updateDraft({ proofPath: p })}
                    />
                  </div>
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
                  {draft.paymentMethod === "cash"
                    ? t.order.payment.cash
                    : `${t.order.payment.transfer}${
                        draft.transferMethod ? ` · ${draft.transferMethod}` : ""
                      }`}
                </ReviewRow>
                <ReviewRow label={t.order.review.deliveryLabel} onEdit={() => goTo("payment")} editLabel={t.order.review.editPayment}>
                  {draft.deliveryMethod === "delivery"
                    ? `${t.order.payment.delivery} — ${draft.address}`
                    : `${t.order.payment.pickup}${settings.address ? ` — ${settings.address}` : ""}`}
                </ReviewRow>
                <ReviewRow
                  label={t.order.review.itemsLabel}
                  onEdit={() => goTo("menu")}
                  editLabel={t.order.review.editItems}
                >
                  <ul className="space-y-1.5">
                    {cartLines.map((l) => (
                      <li key={l.flavor.id} className="flex justify-between gap-4">
                        <span>
                          {l.qty}× {lang === "en" ? l.flavor.name_en : l.flavor.name_id}
                        </span>
                        <span className="tabular text-cocoa-500">
                          {formatIDR(l.flavor.price * l.qty, lang)}
                        </span>
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
                {bundle.bundles > 0 ? (
                  <>
                    <div className="flex justify-between text-sm text-cocoa-600">
                      <span>
                        {bundle.bundles} {t.order.review.bundle}
                      </span>
                      <span className="tabular">
                        {formatIDR(bundle.bundles * settings.bundle_price, lang)}
                      </span>
                    </div>
                    {bundle.leftover > 0 ? (
                      <div className="mt-2 flex justify-between text-sm text-cocoa-600">
                        <span>
                          {bundle.leftover} {t.common.qty.toLowerCase()}
                        </span>
                        <span className="tabular">
                          {formatIDR(bundle.leftover * avgUnitPrice, lang)}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex justify-between text-sm text-cocoa-600">
                    <span>{t.common.subtotal}</span>
                    <span className="tabular">{formatIDR(subtotal, lang)}</span>
                  </div>
                )}

                {bundle.saving > 0 ? (
                  <div className="mt-2 flex justify-between text-sm font-bold text-matcha-600">
                    <span>{t.order.review.saving}</span>
                    <span className="tabular">-{formatIDR(bundle.saving, lang)}</span>
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
                {cartLines.map((l) => (
                  <li key={l.flavor.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-cocoa-800">
                        {lang === "en" ? l.flavor.name_en : l.flavor.name_id}
                      </p>
                      <p className="text-[11px] text-cocoa-400 tabular">
                        {l.qty} × {formatIDR(l.flavor.price, lang)}
                      </p>
                    </div>
                    <p className="text-[13px] font-bold text-cocoa-800 tabular">
                      {formatIDR(l.flavor.price * l.qty, lang)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-2 border-t border-cocoa-100 bg-cocoa-50 px-4 py-3.5 text-sm">
              {/* Rincian paket */}
              {bundle.bundles > 0 ? (
                <>
                  <div className="flex justify-between text-cocoa-600">
                    <span>
                      {bundle.bundles} {t.order.review.bundle}
                    </span>
                    <span className="tabular">
                      {formatIDR(bundle.bundles * settings.bundle_price, lang)}
                    </span>
                  </div>
                  {bundle.leftover > 0 ? (
                    <div className="flex justify-between text-cocoa-600">
                      <span>
                        {bundle.leftover} {t.common.qty.toLowerCase()}
                      </span>
                      <span className="tabular">
                        {formatIDR(bundle.leftover * avgUnitPrice, lang)}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex justify-between text-cocoa-600">
                  <span>{t.common.subtotal}</span>
                  <span className="tabular">{formatIDR(subtotal, lang)}</span>
                </div>
              )}

              {bundle.saving > 0 ? (
                <div className="flex justify-between text-matcha-600">
                  <span>{t.order.review.saving}</span>
                <span className="tabular">-{formatIDR(bundle.saving, lang)}</span>
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

function QtyButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg border border-cocoa-200 text-cocoa-700 transition hover:bg-cocoa-100 disabled:opacity-40"
    >
      {children}
    </button>
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
