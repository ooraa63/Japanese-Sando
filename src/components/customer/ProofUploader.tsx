"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Check, CloudUpload, Loader2, Trash2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Unggah bukti transfer ke bucket privat `payment-proofs`.
 * Mengembalikan path objek, bukan URL publik.
 */
export function ProofUploader({
  path,
  onChange,
  required = false,
}: {
  path: string | null;
  onChange: (path: string | null) => void;
  required?: boolean;
}) {
  // Tampilkan pratinjau dari bucket privat lewat signed URL.
  // `path` dipakai sebagai key supaya state ikut reset saat bukti diganti.
  return (
    <ProofPreview
      key={path ?? "none"}
      path={path}
      required={required}
      onChange={onChange}
    />
  );
}

function ProofPreview({
  path,
  required,
  onChange,
}: {
  path: string | null;
  required: boolean;
  onChange: (path: string | null) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(path, 60 * 30);
      if (cancelled) return;
      setPreview(data?.signedUrl ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  async function upload(file: File) {
    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError(t.order.payment.proofHint);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t.order.payment.proofHint);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const objectPath = `proofs/${unique}`;

      const { error: upErr } = await supabase.storage
        .from("payment-proofs")
        .upload(objectPath, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;
      onChange(objectPath);
      toast.success(t.order.payment.proofUploaded);
    } catch {
      setError(t.errors.proof_upload_failed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  const hasFile = Boolean(path && preview);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {hasFile ? (
        <div className="relative overflow-hidden rounded-2xl border border-matcha-300 bg-matcha-50">
          <div className="relative aspect-[4/3] w-full sm:aspect-[16/9]">
            <Image
              src={preview!}
              alt={t.order.payment.proofTitle}
              fill
              sizes="(max-width: 640px) 100vw, 480px"
              className="object-contain"
              unoptimized
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-matcha-200 bg-white px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-bold text-matcha-700">
              <Check className="size-3.5" />
              {t.order.payment.proofUploaded}
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-cocoa-200 px-2.5 py-1 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-50"
              >
                {t.order.payment.proofReplace}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setPreview(null);
                }}
                className="rounded-lg border border-berry-500/30 px-2.5 py-1 text-xs font-bold text-berry-500 transition hover:bg-berry-500/10"
              >
                <Trash2 className="mr-1 inline size-3" />
                {t.order.payment.proofRemove}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging
              ? "border-matcha-500 bg-matcha-50"
              : error
                ? "border-berry-500/50 bg-berry-500/5"
                : "border-cocoa-200 bg-cocoa-50/50 hover:border-matcha-400 hover:bg-matcha-50/60"
          }`}
        >
          {busy ? (
            <Loader2 className="size-7 animate-spin text-matcha-500" />
          ) : (
            <CloudUpload className="size-7 text-cocoa-400" />
          )}
          <span className="text-sm font-bold text-cocoa-700">
            {busy ? t.common.loading : t.order.payment.proofTitle}
            {required ? <span className="text-berry-500"> *</span> : null}
          </span>
          <span className="text-xs text-cocoa-400">{t.order.payment.proofHint}</span>
        </button>
      )}

      {error ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-berry-500">
          <X className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
