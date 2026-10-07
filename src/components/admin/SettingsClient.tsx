"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Building2,
  Clock,
  CreditCard,
  ImagePlus,
  Info,
  Loader2,
  MapPin,
  MessageCircle,
  Plus,
  Save,
  Store,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import type { AdminUser, BankAccount, StoreSettings } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";
import { saveSettingsAction } from "@/app/admin/actions";
import {
  createAdminAction,
  getAdminAccountsAction,
  revokeAdminAction,
} from "@/app/admin/actions";
import { formatDateTime, formatIDR, waLink } from "@/lib/utils";

type Draft = Omit<StoreSettings, "id" | "updated_at" | "bank_accounts"> & {
  bank_accounts: BankAccount[];
};

function toDraft(s: StoreSettings | null): Draft {
  return {
    store_name: s?.store_name ?? "Japanese Sando",
    tagline_id: s?.tagline_id ?? "",
    tagline_en: s?.tagline_en ?? "",
    description_id: s?.description_id ?? "",
    description_en: s?.description_en ?? "",
    whatsapp: s?.whatsapp ?? "",
    address: s?.address ?? "",
    maps_url: s?.maps_url ?? "",
    instagram: s?.instagram ?? "",
    tiktok: s?.tiktok ?? "",
    hours_id: s?.hours_id ?? "",
    hours_en: s?.hours_en ?? "",
    deadline_id: s?.deadline_id ?? "",
    deadline_en: s?.deadline_en ?? "",
    min_order: s?.min_order ?? 1,
    max_per_order: s?.max_per_order ?? 20,
    delivery_fee: s?.delivery_fee ?? 0,
    free_shipping_min: s?.free_shipping_min ?? 0,
    bank_accounts: s?.bank_accounts ?? [],
    qris_enabled: s?.qris_enabled ?? false,
    qris_image_url: s?.qris_image_url ?? null,
    announcement_id: s?.announcement_id ?? "",
    announcement_en: s?.announcement_en ?? "",
    is_preorder_open: s?.is_preorder_open ?? true,
    hero_image_url: s?.hero_image_url ?? null,
    hero_image_mobile_url: s?.hero_image_mobile_url ?? null,
    pickup_note_id: s?.pickup_note_id ?? "",
    pickup_note_en: s?.pickup_note_en ?? "",
    delivery_note_id: s?.delivery_note_id ?? "",
    delivery_note_en: s?.delivery_note_en ?? "",
    delivery_zones: s?.delivery_zones ?? [
      { id: "pickup", name_id: "Ambil di toko", name_en: "Pickup", fee: 0 },
      {
        id: "vihara",
        name_id: "Vihara Tian En",
        name_en: "Vihara Tian En",
        fee: 10000,
      },
      { id: "uvers", name_id: "UVERS", name_en: "UVERS", fee: 10000 },
      {
        id: "other",
        name_id: "Luar itu",
        name_en: "Other areas",
        fee: 15000,
      },
    ],
    logo_url: s?.logo_url ?? null,
    brand_line: s?.brand_line ?? "Japanese Bake & Pastry",
  };
}

export function SettingsClient({
  initialSettings,
}: {
  initialSettings: StoreSettings | null;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<Draft>(() => toDraft(initialSettings));
  const [saving, startSaving] = useTransition();

  function patch(next: Partial<Draft>) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function save() {
    startSaving(async () => {
      const res = await saveSettingsAction({
        ...form,
        whatsapp: form.whatsapp.replace(/\D/g, ""),
        min_order: Number(form.min_order) || 1,
        max_per_order: Number(form.max_per_order) || 1,
        delivery_fee: Number(form.delivery_fee) || 0,
        free_shipping_min: Number(form.free_shipping_min) || 0,
        bank_accounts: form.bank_accounts.filter((b) => b.number.trim()),
      });

      if (res.ok) toast.success(t.admin.settings.saved);
      else toast.error(t.errors.generic);
    });
  }

  const waDigits = form.whatsapp.replace(/\D/g, "");

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-cocoa-900 sm:text-3xl">
            {t.admin.settings.title}
          </h1>
          <p className="mt-1 text-sm text-cocoa-500">{t.admin.settings.subtitle}</p>
        </div>
        <button type="button" onClick={save} disabled={saving} className="btn-primary shrink-0">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? t.common.saving : t.common.save}
        </button>
      </div>

      {/* ============ Identitas toko ============ */}
      <Section icon={<Store className="size-4.5" />} title={t.admin.settings.identity}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.admin.settings.storeName} className="sm:col-span-2">
            <input
              className="input"
              value={form.store_name}
              onChange={(e) => patch({ store_name: e.target.value })}
            />
          </Field>
          <Field label={t.admin.settings.taglineId}>
            <input
              className="input"
              value={form.tagline_id}
              onChange={(e) => patch({ tagline_id: e.target.value })}
            />
          </Field>
          <Field label={t.admin.settings.taglineEn}>
            <input
              className="input"
              value={form.tagline_en}
              onChange={(e) => patch({ tagline_en: e.target.value })}
            />
          </Field>
          <Field label={t.admin.settings.descId}>
            <textarea
              rows={3}
              className="input resize-none"
              value={form.description_id}
              onChange={(e) => patch({ description_id: e.target.value })}
            />
          </Field>
          <Field label={t.admin.settings.descEn}>
            <textarea
              rows={3}
              className="input resize-none"
              value={form.description_en}
              onChange={(e) => patch({ description_en: e.target.value })}
            />
          </Field>
          <Field label={t.admin.settings.announcement} hint={t.admin.settings.announcementHint} className="sm:col-span-2">
            <input
              className="input"
              value={form.announcement_id}
              onChange={(e) => patch({ announcement_id: e.target.value })}
              placeholder="Liburan: harga khusus 15k!"
            />
            <input
              className="input mt-2"
              value={form.announcement_en}
              onChange={(e) => patch({ announcement_en: e.target.value })}
              placeholder="Holiday special: 15k!"
            />
          </Field>

          {/* Logo & tagline di bawah nama toko */}
          <div className="sm:col-span-2">
            <span className="label">{t.admin.settings.brandIdentity}</span>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {t.admin.settings.logo}
                </p>
                <HeroImageField
                  url={form.logo_url}
                  onChange={(url) => patch({ logo_url: url })}
                  labels={{
                    upload: t.admin.menu.uploadImage,
                    remove: t.admin.menu.removeImage,
                  }}
                  round
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {t.admin.settings.brandLine}
                </p>
                <input
                  className="input"
                  value={form.brand_line}
                  onChange={(e) => patch({ brand_line: e.target.value })}
                  placeholder="Japanese Bake & Pastry"
                />
                <p className="mt-1.5 text-xs text-cocoa-400">
                  {t.admin.settings.brandLineHint}
                </p>
              </div>
            </div>
          </div>

          {/* Foto background halaman depan */}
          <Field
            label={t.admin.settings.heroImage}
            hint={t.admin.settings.heroImageHint}
            className="sm:col-span-2"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  Desktop
                </p>
                <HeroImageField
                  url={form.hero_image_url}
                  onChange={(url) => patch({ hero_image_url: url })}
                  labels={{
                    upload: t.admin.menu.uploadImage,
                    remove: t.admin.menu.removeImage,
                  }}
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  Mobile
                </p>
                <HeroImageField
                  url={form.hero_image_mobile_url}
                  onChange={(url) => patch({ hero_image_mobile_url: url })}
                  labels={{
                    upload: t.admin.menu.uploadImage,
                    remove: t.admin.menu.removeImage,
                  }}
                />
              </div>
            </div>
          </Field>
        </div>
      </Section>

      {/* ============ Kontak ============ */}
      <Section icon={<MapPin className="size-4.5" />} title={t.admin.settings.contact}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t.admin.settings.whatsapp}
            hint={t.admin.settings.whatsappHint}
            className="sm:col-span-2"
          >
            <div className="flex gap-2">
              <input
                className="input tabular"
                dir="ltr"
                inputMode="tel"
                value={form.whatsapp}
                onChange={(e) => patch({ whatsapp: e.target.value.replace(/\D/g, "") })}
                placeholder="6281234567890"
              />
              {waDigits ? (
                <a
                  href={waLink(waDigits, form.store_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-outline shrink-0 !px-3.5"
                  title={t.admin.settings.testWa}
                  aria-label={t.admin.settings.testWa}
                >
                  <MessageCircle className="size-4" />
                </a>
              ) : null}
            </div>
          </Field>

          <Field label={t.admin.settings.address} className="sm:col-span-2">
            <textarea
              rows={2}
              className="input resize-none"
              value={form.address}
              onChange={(e) => patch({ address: e.target.value })}
            />
          </Field>

          <Field label={t.admin.settings.mapsUrl}>
            <input
              className="input"
              value={form.maps_url}
              onChange={(e) => patch({ maps_url: e.target.value })}
              placeholder="https://maps.app.goo.gl/..."
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={t.admin.settings.instagram}>
              <input
                className="input"
                value={form.instagram}
                onChange={(e) => patch({ instagram: e.target.value.replace(/^@/, "") })}
                placeholder="japanesesando"
              />
            </Field>
            <Field label="TikTok">
              <input
                className="input"
                value={form.tiktok}
                onChange={(e) => patch({ tiktok: e.target.value.replace(/^@/, "") })}
                placeholder="japanesesando"
              />
            </Field>
          </div>
        </div>
      </Section>

      {/* ============ Jam & batas pesanan ============ */}
      <Section icon={<Clock className="size-4.5" />} title={t.admin.settings.orderRules}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.admin.settings.hoursId}>
            <input
              className="input"
              value={form.hours_id}
              onChange={(e) => patch({ hours_id: e.target.value })}
              placeholder="Setiap hari, 10.00 - 20.00 WIB"
            />
          </Field>
          <Field label={t.admin.settings.hoursEn}>
            <input
              className="input"
              value={form.hours_en}
              onChange={(e) => patch({ hours_en: e.target.value })}
              placeholder="Every day, 10:00 AM - 8:00 PM (GMT+7)"
            />
          </Field>
          <Field label={t.admin.settings.deadlineId}>
            <input
              className="input"
              value={form.deadline_id}
              onChange={(e) => patch({ deadline_id: e.target.value })}
            />
          </Field>
          <Field label={t.admin.settings.deadlineEn}>
            <input
              className="input"
              value={form.deadline_en}
              onChange={(e) => patch({ deadline_en: e.target.value })}
            />
          </Field>
        </div>
      </Section>

      {/* ============ Pembayaran ============ */}
      <Section icon={<CreditCard className="size-4.5" />} title={t.admin.settings.payments}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-cocoa-800">
                {t.admin.settings.bankAccounts}
              </h3>
              <button
                type="button"
                onClick={() =>
                  patch({
                    bank_accounts: [
                      ...form.bank_accounts,
                      { bank: "", number: "", holder: "" },
                    ],
                  })
                }
                className="btn-ghost !px-3 !py-1.5 !text-[12px]"
              >
                <Plus className="size-3.5" />
                {t.admin.settings.addBankAccount}
              </button>
            </div>

            {form.bank_accounts.length === 0 ? (
              <p className="mt-2.5 rounded-xl bg-cocoa-50 p-3.5 text-sm text-cocoa-400">
                {t.order.payment.qrisUnavailable}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {form.bank_accounts.map((acc, i) => (
                  <li key={i} className="rounded-2xl border border-cocoa-200 bg-cocoa-50/50 p-3.5">
                    <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr_1.2fr_auto]">
                      <input
                        className="input !py-2.5"
                        placeholder={t.admin.settings.bankName}
                        value={acc.bank}
                        onChange={(e) => {
                          const next = [...form.bank_accounts];
                          next[i] = { ...acc, bank: e.target.value };
                          patch({ bank_accounts: next });
                        }}
                      />
                      <input
                        className="input !py-2.5 tabular"
                        dir="ltr"
                        inputMode="numeric"
                        placeholder={t.admin.settings.accountNumber}
                        value={acc.number}
                        onChange={(e) => {
                          const next = [...form.bank_accounts];
                          next[i] = { ...acc, number: e.target.value.replace(/\D/g, "") };
                          patch({ bank_accounts: next });
                        }}
                      />
                      <input
                        className="input !py-2.5"
                        placeholder={t.admin.settings.accountHolder}
                        value={acc.holder}
                        onChange={(e) => {
                          const next = [...form.bank_accounts];
                          next[i] = { ...acc, holder: e.target.value };
                          patch({ bank_accounts: next });
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patch({
                            bank_accounts: form.bank_accounts.filter((_, idx) => idx !== i),
                          })
                        }
                        className="rounded-lg p-2.5 text-berry-500 transition hover:bg-berry-500/10"
                        aria-label={t.common.delete}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          </div>
      </Section>

      {/* ============ Aturan & ongkir ============ */}
      <Section icon={<Info className="size-4.5" />} title={t.admin.settings.orderRules}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            label={t.admin.settings.minOrder}
            value={form.min_order}
            min={1}
            onChange={(v) => patch({ min_order: v })}
          />
          <NumberField
            label={t.admin.settings.maxPerOrder}
            value={form.max_per_order}
            min={1}
            onChange={(v) => patch({ max_per_order: v })}
          />
          <NumberField
            label={t.admin.settings.deliveryFee}
            value={form.delivery_fee}
            min={0}
            onChange={(v) => patch({ delivery_fee: v })}
            prefix={formatIDR(0, lang)}
          />
        </div>
        <p className="mt-2 text-xs text-cocoa-400">{t.admin.settings.stockHint}</p>
      </Section>

      {/* ============ Account admin ============ */}
      <Section icon={<Users className="size-4.5" />} title={t.admin.settings.accountTitle}>
        <AccountManager />
      </Section>

      {/* ============ Catatan cara pengambilan ============ */}
      <Section icon={<Truck className="size-4.5" />} title={t.admin.settings.pickupDeliveryTitle}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="label">{t.order.payment.pickup}</span>
            <textarea
              rows={3}
              className="input resize-none"
              value={form.pickup_note_id}
              onChange={(e) => patch({ pickup_note_id: e.target.value })}
              placeholder="Hanya untuk Vihara Tian En dan UVERS, gratis ongkir. Pengambilan jam 18.00 - 20.00."
            />
            <p className="mt-1.5 text-xs text-cocoa-400">
              {t.admin.settings.pickupNoteHint}
            </p>
            <textarea
              rows={2}
              className="input mt-2 resize-none"
              value={form.pickup_note_en}
              onChange={(e) => patch({ pickup_note_en: e.target.value })}
              placeholder="English version (optional)"
            />
          </div>

          <div>
            <span className="label">{t.order.payment.delivery}</span>
            <textarea
              rows={3}
              className="input resize-none"
              value={form.delivery_note_id}
              onChange={(e) => patch({ delivery_note_id: e.target.value })}
              placeholder="Ongkir ditanggung sendiri oleh pembeli."
            />
            <p className="mt-1.5 text-xs text-cocoa-400">
              {t.admin.settings.deliveryNoteHint}
            </p>
            <textarea
              rows={2}
              className="input mt-2 resize-none"
              value={form.delivery_note_en}
              onChange={(e) => patch({ delivery_note_en: e.target.value })}
              placeholder="English version (optional)"
            />
          </div>
        </div>
      </Section>

      {/* ============ Status pre-order ============ */}
      <Section icon={<Building2 className="size-4.5" />} title={t.admin.settings.availability}>
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-cocoa-200 p-4">
          <div>
            <p className="text-sm font-bold text-cocoa-800">
              {form.is_preorder_open
                ? t.admin.settings.preorderOpen
                : t.admin.settings.preorderClosed}
            </p>
            <p className="mt-0.5 text-xs text-cocoa-400">
              {t.admin.settings.preorderHint}
            </p>
          </div>
          <Switch
            checked={form.is_preorder_open}
            onChange={(v) => patch({ is_preorder_open: v })}
          />
        </div>
      </Section>

      {/* Tombol simpan di akhir (bukan fixed, supaya tidak menutupi section lain). */}
      <div className="flex items-center justify-end gap-3 border-t border-cocoa-200 pt-4">
        <p className="text-xs text-cocoa-400">{t.admin.settings.subtitle}</p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="btn-primary shrink-0"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {saving ? t.common.saving : t.common.save}
        </button>
      </div>
    </div>
  );
}

/* ---------- komponen ---------- */

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex items-center gap-2.5 border-b border-cocoa-100 px-5 py-4">
        <span className="grid size-8 place-items-center rounded-xl bg-cocoa-100 text-cocoa-600">
          {icon}
        </span>
        <h2 className="text-base font-bold text-cocoa-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-cocoa-400">{hint}</p> : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
  prefix,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
  prefix?: string;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-xs font-bold text-cocoa-400">
            {prefix}
          </span>
        ) : null}
        <input
          inputMode="numeric"
          className={`input tabular ${prefix ? "pl-12" : ""}`}
          value={value}
          min={min}
          onChange={(e) => {
            const n = Number(e.target.value.replace(/\D/g, ""));
            onChange(Number.isFinite(n) ? n : min);
          }}
        />
      </div>
    </div>
  );
}

function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="h-6 w-11 rounded-full bg-cocoa-200 transition peer-checked:bg-matcha-500" />
      <span className="absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
    </label>
  );
}

/**
 * Kelola akun yang boleh masuk dashboard. Akun dibuat dari sini:
 * user didaftarkan di Supabase lalu langsung diberi akses admin.
 */
function AccountManager() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [accounts, setAccounts] = useState<AdminUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, startBusy] = useTransition();
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });

  const load = useCallback(async () => {
    const res = await getAdminAccountsAction();
    if (res.ok && res.data) setAccounts(res.data);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getAdminAccountsAction();
      if (cancelled) return;
      if (res.ok && res.data) setAccounts(res.data);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    fd.set("fullName", form.fullName);
    fd.set("email", form.email);
    fd.set("password", form.password);

    startBusy(async () => {
      const res = await createAdminAction(null, fd);
      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_email: t.errors.invalid_email,
          weak_password: t.admin.login.passwordTooShort,
          invalid_name: t.admin.login.fullNameRequired,
          not_authorized: t.errors.not_authorized,
          email_taken: t.admin.settings.emailTaken,
          signup_failed: t.admin.login.signupFailed,
        };
        toast.error(messages[res.error ?? ""] ?? t.errors.generic);
        return;
      }
      toast.success(t.admin.settings.accountCreated);
      setForm({ fullName: "", email: "", password: "" });
      setOpen(false);
      await load();
      router.refresh();
    });
  }

  function revoke(u: AdminUser) {
    if (!window.confirm(t.admin.settings.revokeConfirm)) return;
    startBusy(async () => {
      const res = await revokeAdminAction(u.user_id);
      if (!res.ok) {
        toast.error(
          res.error === "last_admin" ? t.admin.settings.lastAdmin : t.errors.generic
        );
        return;
      }
      toast.success(t.admin.settings.accountRevoked);
      await load();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!loaded ? (
        <p className="flex items-center gap-2 py-4 text-sm text-cocoa-400">
          <Loader2 className="size-4 animate-spin" />
          {t.common.loading}
        </p>
      ) : (
        <ul className="divide-y divide-cocoa-100 rounded-2xl border border-cocoa-200">
          {accounts.map((u) => (
            <li key={u.user_id} className="flex items-center gap-3 px-4 py-3">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                  u.is_active
                    ? "bg-matcha-100 text-matcha-700"
                    : "bg-cocoa-100 text-cocoa-400"
                }`}
              >
                <Users className="size-4" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-cocoa-800">
                  {u.full_name || u.email}
                </p>
                <p className="truncate text-[11px] text-cocoa-400">{u.email}</p>
                <p className="mt-0.5 text-[10px] font-bold tracking-wide uppercase">
                  <span className={u.is_active ? "text-matcha-600" : "text-cocoa-400"}>
                    {u.is_active ? t.admin.settings.accountActive : t.admin.settings.accessRevoked}
                  </span>
                  <span className="text-cocoa-300"> · {u.role}</span>
                  {u.confirmed === false ? (
                    <span className="text-berry-500">
                      {" "}
                      · {t.admin.settings.notConfirmed}
                    </span>
                  ) : null}
                </p>
              </div>

              {u.is_active ? (
                <button
                  type="button"
                  onClick={() => revoke(u)}
                  disabled={busy}
                  className="shrink-0 rounded-lg border border-berry-500/30 px-2.5 py-1.5 text-[12px] font-bold text-berry-500 transition hover:bg-berry-500/10 disabled:opacity-40"
                >
                  {t.admin.settings.revoke}
                </button>
              ) : (
                <span className="shrink-0 text-[11px] text-cocoa-400">
                  {u.last_sign_in
                    ? `${t.admin.settings.lastLogin} ${formatDateTime(u.last_sign_in, lang)}`
                    : t.admin.settings.neverLogin}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-cocoa-200 bg-cocoa-50/50 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="acc-name" className="label">
                {t.admin.login.fullName}
              </label>
              <input
                id="acc-name"
                required
                minLength={2}
                className="input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor="acc-email" className="label">
                {t.admin.login.email}
              </label>
              <input
                id="acc-email"
                type="email"
                required
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nama@email.com"
              />
            </div>
          </div>
          <div>
            <label htmlFor="acc-pass" className="label">
              {t.admin.login.password}
            </label>
            <input
              id="acc-pass"
              type="password"
              required
              minLength={8}
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
            <p className="mt-1.5 text-xs text-cocoa-400">{t.admin.settings.accountHint}</p>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="btn-primary !py-2.5 !text-[13px]">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t.admin.settings.createAccount}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn-ghost !py-2.5 !text-[13px]"
            >
              {t.common.cancel}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="btn-outline w-full !py-2.5 !text-[13px]">
          <Plus className="size-4" />
          {t.admin.settings.addAccount}
        </button>
      )}
    </div>
  );
}

/** Unggah foto (background halaman depan atau logo) ke bucket publik. */
function HeroImageField({
  url,
  onChange,
  labels,
  round = false,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
  labels: { upload: string; remove: string };
  round?: boolean;
}) {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const fail = t.errors.proof_upload_failed;

  async function upload(file: File) {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
      toast.error(fail);
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const folder = round ? "logo" : "hero";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error } = await supabase.storage
        .from("flavor-images")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("flavor-images").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch {
      toast.error(fail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {url ? (
        <div className="flex items-center gap-3">
          <div
            className={`relative h-16 w-24 shrink-0 overflow-hidden bg-cocoa-100 ${
              round ? "rounded-full" : "rounded-lg"
            }`}
          >
            <Image src={url} alt="" fill sizes="96px" className="object-cover" />
          </div>          <div className="flex gap-1.5">
            <label className="cursor-pointer rounded-lg border border-cocoa-200 px-2.5 py-1.5 text-[12px] font-bold text-cocoa-600 transition hover:bg-cocoa-50">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {labels.upload}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold text-berry-500 transition hover:bg-berry-500/10"
            >
              <X className="size-3.5" />
              {labels.remove}
            </button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-cocoa-200 bg-cocoa-50/50 px-4 py-6 text-center transition hover:border-matcha-400">
          {busy ? (
            <Loader2 className="size-5 animate-spin text-matcha-500" />
          ) : (
            <ImagePlus className="size-5 text-cocoa-400" />
          )}
          <span className="text-xs font-bold text-cocoa-700">{labels.upload}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
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

