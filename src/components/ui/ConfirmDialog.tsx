"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { Modal } from "./Modal";

/**
 * Dialog konfirmasi in-app untuk aksi merusak (hapus menu, hapus pertanyaan,
 * dll).
 *
 * Kenapa tidak pakai `window.confirm()`? Karena dialog bawaan browser:
 *  1. bisa ditutup dengan klik "Cancel" tanpa satu pun umpan balik di aplikasi,
 *     sehingga penjual mengira hapus sudah berhasil padahal tidak terjadi apa-apa
 *     (persis yang terjadi pada laporan "menu sudah dihapus tapi masih muncul
 *     di web pembeli", 12-10-2026);
 *  2. tampilannya beda tiap browser dan memblokir seluruh halaman.
 *
 * PEMAKAIAN:
 *
 *   const [pending, setPending] = useState<{ title: string; body: string } | null>(null);
 *   // ...
 *   setPending({ title: "Hapus menu?", body: "Menu ini langsung hilang dari web pembeli." });
 *   // ...
 *   <ConfirmDialog
 *     request={pending}
 *     busy={saving}
 *     onCancel={() => setPending(null)}
 *     onConfirm={() => { setPending(null); void doDelete(); }}
 *   />
 */
export function ConfirmDialog({
  request,
  busy = false,
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel,
  children,
}: {
  /** `null` = tidak tampil. Isi object = judul + isi dialog. */
  request: { title: string; body?: ReactNode } | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tambahan di bawah `body`, mis. daftar isi yang akan terhapus. */
  children?: ReactNode;
}) {
  const { t } = useI18n();
  if (!request) return null;

  return (
    <Modal
      open
      size="sm"
      onClose={busy ? () => {} : onCancel}
      title={request.title}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="btn-ghost !text-[13px]"
          >
            {cancelLabel ?? t.common.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-berry-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-berry-600 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel ?? t.common.delete}
          </button>
        </>
      }
    >
      {request.body ? (
        <p className="text-sm leading-relaxed text-cocoa-600">{request.body}</p>
      ) : null}
      {children}
    </Modal>
  );
}