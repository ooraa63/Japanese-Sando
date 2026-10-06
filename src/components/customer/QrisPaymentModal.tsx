"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  RefreshCcw,
  X,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  createQrisOrderAction,
  checkQrisStatusAction,
  type CreateQrisOrderResult,
} from "@/app/account/qris-actions";
import type { QrisStatus } from "@/lib/types";
import { formatIDR } from "@/lib/utils";

interface QrisPaymentModalProps {
  /** Data payload order (customer, items, bundles, dst.) — dipakai untuk
   *  re-call `createQrisOrderAction` kalau user mau refresh QR. */
  payload: Record<string, unknown>;
  /** Set true untuk membuka modal. */
  open: boolean;
  onClose: () => void;
}

/**
 * Modal pembayaran QRIS Midtrans. Menampilkan QR image dari Midtrans
 * + countdown expiry + polling status pembayaran setiap 5 detik.
 *
 * Lifecycle:
 *   1. open=true → panggil createQrisOrderAction untuk create order di
 *      DB + generate QR via Midtrans.
 *   2. Tampilkan QR + countdown.
 *   3. Polling cek status Midtrans / DB.
 *   4. Status paid → close + redirect ke /order/success/[code].
 *   5. Status expired/failed/cancelled → tampilkan pesan + tombol refresh
 *      (yang re-call createQrisOrderAction dengan order code yang sama).
 */
export function QrisPaymentModal({ payload, open, onClose }: QrisPaymentModalProps) {
  const { t, lang } = useI18n();
  const qd = t.order.qrisPay;
  const router = useRouter();
  const toast = useToast();

  const [order, setOrder] = useState<CreateQrisOrderResult["order"] | null>(null);
  const [status, setStatus] = useState<QrisStatus | "loading">("loading");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [retryKey, setRetryKey] = useState(0);

  // Initial charge: buka QRIS modal pertama kali / setelah user refresh.
  // Karena setState langsung di-effect body adalah anti-pattern, kita
  // gunakan flag sederhana + useEffect terpisah untuk async charge.
  const [chargeRequested, setChargeRequested] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!open) return;
    if (retryKey === 0 && order) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChargeRequested((r) => (r[retryKey] ? r : { ...r, [retryKey]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, retryKey]);

  useEffect(() => {
    const key = retryKey;
    if (!open || !chargeRequested[key]) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading");
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("payload", JSON.stringify(payload));
        const res = await createQrisOrderAction(null, fd);
        if (!res.ok || !res.order) {
          setError(res.error ?? "midtrans_charge_failed");
          setStatus("failed");
          return;
        }
        setOrder(res.order);
        setStatus("pending");
      } catch (e) {
        setError(e instanceof Error ? e.message : "unknown");
        setStatus("failed");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargeRequested]);

  // Countdown timer (1s).
  useEffect(() => {
    if (!open || !order) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, order]);

  // Polling status setiap 5 detik.
  useEffect(() => {
    if (!open || !order) return;
    let cancelled = false;
    const tick = async () => {
      const res = await checkQrisStatusAction(order.code);
      if (cancelled) return;
      if (res.ok && res.status) {
        setStatus(res.status);
        if (res.status === "paid") {
          // Beri jeda 800ms supaya UI menampilkan 'paid' state dulu.
          setTimeout(() => {
            if (!cancelled) {
              onClose();
              router.replace(`/order/success/${encodeURIComponent(order.code)}`);
            }
          }, 800);
        }
      }
    };
    void tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.code]);

  const expiresAt = useMemo(() => {
    if (!order) return 0;
    return new Date(order.expiresAt).getTime();
  }, [order]);

  const secondsLeft = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const mm = Math.floor(secondsLeft / 60).toString().padStart(2, "0");
  const ss = (secondsLeft % 60).toString().padStart(2, "0");
  const expired = order ? secondsLeft <= 0 : false;

  // Auto-close modal setelah 5 menit (countdown habis). Kita tunggu 2 detik biar
  // user lihat status 'expired' dulu sebelum modal nutup sendiri.
  useEffect(() => {
    if (!open || !order || !expired) return;
    if (status === "paid") return;  // jangan close kalau sudah paid
    const t = setTimeout(() => {
      onClose();
    }, 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, status]);

  // Kalau status paid, paksa tutup otomatis.
  // (Sudah di-handle di useEffect polling di atas.)

  function copyOrderCode() {
    if (!order) return;
    void navigator.clipboard.writeText(order.code).then(
      () => toast.success(qd.copyOrder, order.code),
      () => toast.error(t.common.copyFailed, "")
    );
  }

  function refresh() {
    setOrder(null);
    setStatus("loading");
    setError(null);
    setRetryKey((k) => k + 1);
  }

  return (
    <Modal open={open} onClose={onClose} title={qd.title} size="md">
      <div className="flex flex-col items-center gap-4 text-center">
        {status === "loading" || (!order && pending) ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="size-10 animate-spin text-cocoa-400" />
            <p className="text-sm text-cocoa-500">{qd.waiting}</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <AlertCircle className="size-10 text-berry-500" />
            <p className="text-sm font-semibold text-berry-600">
              {qd.failed}: {error}
            </p>
            <button type="button" onClick={refresh} className="btn-primary mt-2">
              <RefreshCcw className="size-4" />
              {qd.refresh}
            </button>
          </div>
        ) : order ? (
          <>
            {/* QR Image */}
            <div className="relative size-64 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-inner">
              {status === "paid" ? (
                <div className="grid h-full place-items-center bg-matcha-50">
                  <CheckCircle2 className="size-20 text-matcha-600" />
                </div>
              ) : (
                <Image
                  src={order.qrUrl}
                  alt="QRIS Midtrans"
                  width={256}
                  height={256}
                  unoptimized
                  className={`h-full w-full object-contain ${
                    expired ? "opacity-30" : ""
                  }`}
                />
              )}
            </div>

            {/* Order code + total */}
            <div className="w-full space-y-1.5 rounded-2xl bg-cream-50 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {qd.orderLabel}
                </p>
                <button
                  type="button"
                  onClick={copyOrderCode}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-matcha-700 hover:underline"
                >
                  <Copy className="size-3" />
                  {qd.copyOrder}
                </button>
              </div>
              <p className="font-mono text-base font-extrabold text-cocoa-900">
                {order.code}
              </p>
              <div className="flex items-center justify-between gap-3 border-t border-cocoa-100 pt-2">
                <p className="text-[11px] font-bold tracking-wide text-cocoa-400 uppercase">
                  {qd.amountLabel}
                </p>
                <p className="font-display text-xl font-extrabold text-cocoa-900 tabular">
                  {formatIDR(order.grossAmount, lang)}
                </p>
              </div>
            </div>

            {/* Status indicator */}
            {status === "pending" ? (
              expired ? (
                <div className="flex items-center gap-2 rounded-full bg-berry-500/10 px-3 py-1.5 text-sm font-bold text-berry-600">
                  <XCircle className="size-4" />
                  {qd.expired}
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-cocoa-100 px-3 py-1.5 text-sm font-bold text-cocoa-700 tabular">
                  <Clock className="size-4 animate-pulse" />
                  {qd.expiresIn} {mm}:{ss}
                </div>
              )
            ) : status === "paid" ? (
              <div className="flex items-center gap-2 rounded-full bg-matcha-500/15 px-3 py-1.5 text-sm font-bold text-matcha-700">
                <CheckCircle2 className="size-4" />
                {qd.paid}
              </div>
            ) : status === "expired" ? (
              <div className="flex items-center gap-2 rounded-full bg-berry-500/10 px-3 py-1.5 text-sm font-bold text-berry-600">
                <XCircle className="size-4" />
                {qd.expired}
              </div>
            ) : status === "cancelled" ? (
              <div className="flex items-center gap-2 rounded-full bg-cocoa-200 px-3 py-1.5 text-sm font-bold text-cocoa-600">
                <X className="size-4" />
                {qd.cancelled}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-full bg-berry-500/10 px-3 py-1.5 text-sm font-bold text-berry-600">
                <AlertCircle className="size-4" />
                {qd.failed}
              </div>
            )}

            {/* Hint */}
            <p className="text-[12px] leading-snug text-cocoa-500">
              {qd.scanHint}
            </p>

            {/* Refresh button (kalau expired/failed) */}
            {(expired || status === "failed" || status === "cancelled" || status === "expired") ? (
              <button
                type="button"
                onClick={refresh}
                disabled={pending}
                className="btn-primary !py-2 text-sm"
              >
                <RefreshCcw className="size-4" />
                {qd.refresh}
              </button>
            ) : null}

            {/* Powered by Midtrans */}
            <p className="mt-1 text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
              {qd.poweredBy}
            </p>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
