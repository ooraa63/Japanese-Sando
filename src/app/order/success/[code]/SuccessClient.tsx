"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  Download,
  Home,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  PackageCheck,
  Search,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { toPng } from "html-to-image";
import { useI18n } from "@/lib/i18n";
import type {
  Dict,
  InvoiceSnapshot,
  Language,
  StoreSettings,
} from "@/lib/types";

type SuccessDict = Dict["success"];
import {
  deliveryLabel,
  formatDateTime,
  formatIDR,
  formatPhone,
  getInvoiceSnapshot,
  loadInvoiceFromApi,
  paymentLabel,
  subscribeInvoice,
  waLink,
} from "@/lib/utils";
import type { InvoiceLineItem } from "@/lib/types";

/**
 * Helper yang merender children langsung (no wrapper element) sehingga
 * bisa menyisipkan beberapa <tr> ke dalam <tbody> tanpa menambah level
 * DOM yang tidak valid (mis. nested <tbody>).
 */
function FragmentTable({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

/**
 * RPC publik mengembalikan item flat (satu baris per rasa). Helper ini
 * membungkusnya jadi format `InvoiceLineItem[]` (satu blok per kategori)
 * yang dipakai oleh InvoiceSummary & InvoiceDocument. Karena RPC publik
 * tidak menyimpan nama kategori, semua item dikumpulkan dalam satu blok
 * tanpa label kategori — tampilan invoice tetap rapi.
 */
function resolveItems(invoice: InvoiceSnapshot): InvoiceLineItem[] {
  if (invoice.items && invoice.items.length > 0) return invoice.items;
  const flat = invoice.flat_items ?? [];
  if (flat.length === 0) return [];
  // Kelompokkan semua item flat dalam satu blok tanpa nama kategori.
  const totalQty = flat.reduce((s, it) => s + it.quantity, 0);
  const baseSum = flat.reduce((s, it) => s + it.unit_price * it.quantity, 0);
  const avg = totalQty > 0 ? Math.round(baseSum / totalQty) : 0;
  return [
    {
      category: "",
      qty: totalQty,
      unit_price: avg,
      line_total: invoice.subtotal,
      flavors: flat.map((it) => ({
        name: it.flavor_name,
        qty: it.quantity,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
    },
  ];
}

export function SuccessClient({
  settings,
  code,
}: {
  settings: StoreSettings | null;
  code: string;
}) {
  // Invoice sumber utama: snapshot sessionStorage (lebih lengkap — sudah
  // mengelompokkan item per kategori). Fallback: RPC publik `public_invoice`
  // untuk kasus halaman di-refresh / dibuka dari history browser.
  // `null` di server agar render konsisten (anti hydration mismatch).
  const invoice = useSyncExternalStore<InvoiceSnapshot | null>(
    subscribeInvoice,
    () => getInvoiceSnapshot(code),
    () => null
  );

  // Setelah mount, kalau invoice belum ada (sessionStorage kosong),
  // coba ambil dari RPC publik. Pakai useEffect (bukan setState) — RPC
  // ini async, jadi listener di subscribeInvoice yang akan men-trigger
  // re-render saat data siap.
  useEffect(() => {
    if (invoice) return;
    void loadInvoiceFromApi(code);
    // `code` stabil dari URL — tidak perlu jadi dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { t, lang } = useI18n();

  const storeName = settings?.store_name ?? "Rumakomugi";
  const dict = t.success;
  const docRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (!docRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(docRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `invoice-${code}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Gagal generate invoice:", err);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      {/* Kontrol di layar — sembunyi saat dicetak. */}
      <div className="print:hidden">
        <SuccessScreen
          invoice={invoice}
          code={code}
          storeName={storeName}
          settings={settings}
          dict={dict}
          lang={lang}
          onDownload={handleDownload}
          downloading={downloading}
        />
      </div>

      {/* Invoice disembunyikan dari layar, tapi tetap di DOM untuk toPng.
        Posisi absolute + off-screen — gambar akan di-capture. */}
      {invoice ? (
        <div
          aria-hidden
          className="pointer-events-none fixed left-[-9999px] top-0 w-[720px]"
        >
          <div ref={docRef}>
            <InvoiceDocument
              invoice={invoice}
              storeName={storeName}
              settings={settings}
              lang={lang}
              dict={dict}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}

function SuccessScreen({
  invoice,
  code,
  storeName,
  settings,
  dict,
  lang,
  onDownload,
  downloading,
}: {
  invoice: InvoiceSnapshot | null;
  code: string;
  storeName: string;
  settings: StoreSettings | null;
  dict: SuccessDict;
  lang: Language;
  onDownload: () => void;
  downloading: boolean;
}) {
  const { t } = useI18n();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="card overflow-hidden">
        <div className="relative bg-matcha-500 px-6 py-10 text-center text-white">
          <div className="absolute inset-0 bg-seigaha opacity-40" />
          <div className="relative">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/20 backdrop-blur-sm">
              <CheckCircle2 className="size-9" />
            </span>
            <h1 className="mt-5 text-2xl font-extrabold sm:text-3xl">
              {t.success.title}
            </h1>
            <p className="mt-2 text-sm text-white/85">{t.success.subtitle}</p>
          </div>
        </div>

        <div className="px-6 py-8 sm:px-10">
          <div className="rounded-2xl border-2 border-dashed border-cocoa-200 bg-cocoa-50 px-5 py-6 text-center">
            <p className="text-[11px] font-bold tracking-[0.18em] text-cocoa-400 uppercase">
              {t.success.codeLabel}
            </p>
            <p className="mt-1.5 font-display text-3xl font-extrabold tracking-wide text-cocoa-900 sm:text-4xl">
              {code}
            </p>
            <p className="mt-3 text-xs text-cocoa-500">{t.success.saveCode}</p>
          </div>

          {invoice ? (
            <div className="mt-6 space-y-5">
              <InvoiceSummary invoice={invoice} lang={lang} dict={dict} />

              <button
                type="button"
                onClick={onDownload}
                disabled={downloading}
                className="btn-matcha w-full"
              >
                {downloading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                {dict.downloadTitle}
              </button>
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-cocoa-400">
                <ImageIcon className="size-3" />
                {dict.downloadHint}
              </p>
            </div>
          ) : null}

          <h2 className="mt-8 text-base font-bold text-cocoa-800">
            {t.success.nextTitle}
          </h2>
          <ol className="mt-3 space-y-2.5">
            {t.success.next.map((s, i) => (
              <li
                key={s}
                className="flex items-start gap-3 text-sm text-cocoa-600"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-cocoa-800 text-[11px] font-bold text-cream-50">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>

          <div className="mt-8 space-y-3">
            {settings?.whatsapp ? (
              <a
                href={waLink(
                  settings.whatsapp,
                  lang === "en"
                    ? `Hi, I just pre-ordered. My order code is ${code}.`
                    : `Halo, saya baru saja pre-order. Kode pesanan saya ${code}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-matcha w-full"
              >
                <MessageCircle className="size-4" />
                {t.success.waTitle}
              </a>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href={`/track?code=${encodeURIComponent(code)}`}
                className="btn-outline"
              >
                <Search className="size-4" />
                {t.success.trackTitle}
              </Link>
              <Link href="/order" className="btn-ghost">
                <ShoppingBag className="size-4" />
                {t.success.orderAgain}
              </Link>
            </div>

            <Link href="/" className="btn-ghost w-full">
              <Home className="size-4" />
              {t.success.home}
            </Link>
          </div>
        </div>
      </div>

      {/* Tanda brand kecil di bawah — sembunyi saat cetak. */}
      <p className="mt-6 text-center text-[11px] text-cocoa-400">
        <Link href="/" className="hover:text-cocoa-600">
          {storeName}
        </Link>
      </p>
    </main>
  );
}

/**
 * Ringkasan invoice di halaman sukses — format compact untuk layar HP.
 */
function InvoiceSummary({
  invoice,
  lang,
  dict,
}: {
  invoice: InvoiceSnapshot;
  lang: Language;
  dict: SuccessDict;
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-cocoa-200 bg-white">
      <div className="flex items-center justify-between border-b border-cocoa-100 bg-cocoa-50 px-4 py-2.5 text-xs">
        <span className="font-bold tracking-wide text-cocoa-500 uppercase">
          {dict.invoiceTitle}
        </span>
        <span className="text-cocoa-400 tabular">
          {formatDateTime(invoice.created_at, lang)}
        </span>
      </div>

      <div className="divide-y divide-cocoa-100">
        {resolveItems(invoice).map((it, i) => (
          <div key={i} className="px-4 py-3">
            {it.category ? (
              <p className="mb-1 text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                {it.category}
              </p>
            ) : null}
            {it.flavors.map((f, j) => (
              <div key={j} className="flex justify-between gap-3 text-cocoa-700">
                <span className="min-w-0 truncate">
                  {f.qty}× {f.name}
                </span>
                <span className="shrink-0 tabular">
                  {formatIDR(f.line_total, lang)}
                </span>
              </div>
            ))}
            <div className="mt-1.5 flex justify-between gap-3 text-sm font-bold text-cocoa-900">
              <span>
                {it.qty} {t.common.qty.toLowerCase()}
              </span>
              <span className="tabular">{formatIDR(it.line_total, lang)}</span>
            </div>
          </div>
        ))}

        {/* Bundle entries — pakai list yang sama dengan invoice flat. */}
        {(invoice.bundles ?? []).map((bg) => (
          <div key={`b-${bg.bundle_id}`} className="px-4 py-3">
            <p className="mb-1 text-[10px] font-bold tracking-wide text-berry-600 uppercase">
              {t.menu.bundleLabel}
            </p>
            <p className="font-bold text-cocoa-900">{bg.bundle_name}</p>
            <ul className="mt-1.5 space-y-1">
              {bg.slots.map((s) => (
                <li
                  key={s.slot}
                  className="flex justify-between gap-3 text-cocoa-700"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-bold text-cocoa-500">
                      {s.slot}.
                    </span>{" "}
                    {s.flavor_name}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-1.5 border-t border-cocoa-100 bg-cocoa-50 px-4 py-3 text-sm">
        <Row label={t.common.subtotal} value={formatIDR(invoice.subtotal, lang)} />
        {invoice.saving > 0 ? (
          <Row
            label={t.order.review.saving}
            value={`−${formatIDR(invoice.saving, lang)}`}
            accent="matcha"
          />
        ) : null}
        {invoice.delivery_fee > 0 ? (
          <Row
            label={t.order.review.deliveryFee}
            value={formatIDR(invoice.delivery_fee, lang)}
          />
        ) : null}
        <div className="flex justify-between border-t border-cocoa-200 pt-2 text-base font-extrabold text-cocoa-900">
          <span>{t.common.total}</span>
          <span className="tabular">{formatIDR(invoice.total, lang)}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-cocoa-100 px-4 py-3 text-[12px]">
        <Detail
          icon={invoice.delivery_method === "delivery" ? Truck : Store}
          label={t.order.review.deliveryLabel}
          value={deliveryLabel(invoice.delivery_method, lang)}
        />
        <Detail
          icon={invoice.payment_method === "transfer" ? Building2 : Wallet}
          label={t.order.review.paymentLabel}
          value={`${paymentLabel(invoice.payment_method, lang)}${
            invoice.transfer_method ? ` · ${invoice.transfer_method}` : ""
          }`}
        />
        {invoice.address ? (
          <Detail
            icon={MapPin}
            label={t.order.payment.address}
            value={invoice.address}
            wide
          />
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "matcha";
}) {
  return (
    <div
      className={`flex justify-between ${
        accent === "matcha" ? "font-bold text-matcha-600" : "text-cocoa-600"
      }`}
    >
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  wide,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <p className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
        {label}
      </p>
      <p className="mt-0.5 flex items-start gap-1.5 font-semibold text-cocoa-800">
        <Icon className="mt-0.5 size-3.5 shrink-0 text-cocoa-400" />
        <span className="min-w-0">{value}</span>
      </p>
    </div>
  );
}

/**
 * Dokumen invoice untuk dicetak/disimpan PDF. Ditampilkan via
 * `@media print` dan disembunyikan di layar.
 */
function InvoiceDocument({
  invoice,
  storeName,
  settings,
  lang,
  dict,
}: {
  invoice: InvoiceSnapshot;
  storeName: string;
  settings: StoreSettings | null;
  lang: Language;
  dict: SuccessDict;
}) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl p-8 font-sans text-[12px] text-cocoa-900">
      <header className="flex items-start justify-between border-b border-cocoa-300 pb-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{storeName}</h1>
          {settings?.address ? (
            <p className="mt-1 text-cocoa-600">{settings.address}</p>
          ) : null}
          {settings?.whatsapp ? (
            <p className="text-cocoa-600" dir="ltr">
              WA: {settings.whatsapp}
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold tracking-[0.2em] text-cocoa-500 uppercase">
            {dict.invoiceTitle}
          </p>
          <p className="mt-1 font-mono text-base font-extrabold">
            {invoice.order_code}
          </p>
          <p className="mt-0.5 text-cocoa-600 tabular">
            {formatDateTime(invoice.created_at, lang)}
          </p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 border-b border-cocoa-200 pb-3">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-cocoa-500 uppercase">
            {t.order.review.nameLabel}
          </p>
          <p className="mt-0.5 font-bold">{invoice.customer_name}</p>
          <p className="text-cocoa-600 tabular" dir="ltr">
            {formatPhone(invoice.phone)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold tracking-[0.2em] text-cocoa-500 uppercase">
            {t.order.review.paymentLabel}
          </p>
          <p className="mt-0.5 font-bold">
            {paymentLabel(invoice.payment_method, lang)}
            {invoice.transfer_method ? ` · ${invoice.transfer_method}` : ""}
          </p>
          <p className="mt-1 text-[10px] font-bold tracking-[0.2em] text-cocoa-500 uppercase">
            {t.order.review.deliveryLabel}
          </p>
          <p className="mt-0.5 text-cocoa-600">
            {deliveryLabel(invoice.delivery_method, lang)}
          </p>
        </div>
        {invoice.address ? (
          <div className="col-span-2">
            <p className="text-[10px] font-bold tracking-[0.2em] text-cocoa-500 uppercase">
              {t.order.payment.address}
            </p>
            <p className="mt-0.5 text-cocoa-600">{invoice.address}</p>
          </div>
        ) : null}
        {invoice.note ? (
          <div className="col-span-2">
            <p className="text-[10px] font-bold tracking-[0.2em] text-cocoa-500 uppercase">
              {t.common.notes}
            </p>
            <p className="mt-0.5 text-cocoa-600">{invoice.note}</p>
          </div>
        ) : null}
      </section>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-cocoa-300 text-left text-[10px] font-bold tracking-[0.18em] text-cocoa-500 uppercase">
            <th className="py-2">{t.order.menu.cartTitle}</th>
            <th className="py-2 text-right">{t.common.qty}</th>
            <th className="py-2 text-right">{t.common.price}</th>
            <th className="py-2 text-right">{t.common.total}</th>
          </tr>
        </thead>
        <tbody>
          {resolveItems(invoice).map((it, i) => (
            <FragmentTable key={i}>
              {it.flavors.map((f, j) => (
                <tr key={`${i}-${j}`} className="border-b border-cocoa-100">
                  <td className="py-1.5">
                    {it.category && j === 0 ? (
                      <span className="block text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                        {it.category}
                      </span>
                    ) : null}
                    <span className="font-semibold">{f.name}</span>
                  </td>
                  <td className="py-1.5 text-right tabular">{f.qty}</td>
                  <td className="py-1.5 text-right tabular">
                    {formatIDR(f.unit_price, lang)}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular">
                    {formatIDR(f.line_total, lang)}
                  </td>
                </tr>
              ))}
              <tr className="border-b border-cocoa-200 bg-cocoa-50 font-bold">
                <td className="py-1.5 pl-2 text-cocoa-700">
                  {it.category || t.common.total}
                </td>
                <td className="py-1.5 text-right tabular">{it.qty}</td>
                <td className="py-1.5" />
                <td className="py-1.5 text-right tabular">
                  {formatIDR(it.line_total, lang)}
                </td>
              </tr>
            </FragmentTable>
          ))}
          {/* Bundle rows — flat di tbody utama, colspan 4 untuk merentang
              semua kolom karena item bundle tidak punya qty/harga satuan
              (sudah termasuk dalam harga paket). */}
          {(invoice.bundles ?? []).map((bg) => (
            <tr key={`b-${bg.bundle_id}`} className="border-b border-cocoa-100 align-top">
              <td className="py-1.5" colSpan={4}>
                <span className="block text-[10px] font-bold tracking-wide text-berry-600 uppercase">
                  {t.menu.bundleLabel}
                </span>
                <span className="font-semibold">{bg.bundle_name}</span>
                <span className="ml-2 text-cocoa-500">
                  ({bg.slots.length} pcs)
                </span>
                <ul className="ml-3 mt-0.5 list-disc text-cocoa-600">
                  {bg.slots.map((s) => (
                    <li key={s.slot}>
                      <span className="font-bold text-cocoa-400">
                        {s.slot}.
                      </span>{" "}
                      {s.flavor_name}
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} className="pt-3 text-right text-cocoa-600">
              {t.common.subtotal}
            </td>
            <td className="pt-3 text-right tabular">
              {formatIDR(invoice.subtotal, lang)}
            </td>
          </tr>
          {invoice.saving > 0 ? (
            <tr className="font-bold text-matcha-700">
              <td colSpan={3} className="text-right">
                {t.order.review.saving}
              </td>
              <td className="text-right tabular">
                −{formatIDR(invoice.saving, lang)}
              </td>
            </tr>
          ) : null}
          {invoice.delivery_fee > 0 ? (
            <tr>
              <td colSpan={3} className="text-right text-cocoa-600">
                {t.order.review.deliveryFee}
              </td>
              <td className="text-right tabular">
                {formatIDR(invoice.delivery_fee, lang)}
              </td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-cocoa-900 text-base font-extrabold">
            <td colSpan={3} className="pt-2 text-right">
              {t.order.review.totalLabel}
            </td>
            <td className="pt-2 text-right tabular">
              {formatIDR(invoice.total, lang)}
            </td>
          </tr>
        </tfoot>
      </table>

      <footer className="mt-6 border-t border-cocoa-200 pt-3 text-center text-[10px] text-cocoa-500">
        <PackageCheck className="mx-auto size-4 text-cocoa-400" />
        <p className="mt-1">{storeName} · {dict.thanks}</p>
      </footer>
    </div>
  );
}