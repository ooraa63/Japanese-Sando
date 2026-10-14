"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CloudUpload, Loader2, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import { REVIEW_PHOTO_BUCKET, reviewPhotoUrl } from "@/lib/reviews";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Unggah satu foto untuk ulasan (migration-58).
 *
 * Bedanya dari `ProofUploader`:
 * - bucket `review-photos` (publik), bukan `payment-proofs` (privat), jadi
 *   tampilannya pakai URL langsung dan tidak perlu signed URL;
 * - path-nya dikembalikan ke pemanggil, yang meneruskannya ke `submit_review`.
 *   `submit_review` menolak path di luar folder `reviews/`.
 *
 * Foto bersifat OPSIONAL. Hapus/Ganti hanya untuk correcting kesalahan —
 * kalau pembeli batal mengunggah, tombol Remove mengembalikan `null` supaya
 * tidak ada file sia-sia yang tertinggal di bucket.
 */
export function ReviewPhotoUploader({
  path,
  onChange,
}: {
  path: string | null;
  onChange: (path: string | null) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const preview = reviewPhotoUrl(path);

  async function upload(file: File) {
    setError(null);

    if (!ALLOWED.includes(file.type)) {
      setError(t.reviews.photoFormatError);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t.reviews.photoTooLarge);
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const objectPath = `reviews/${unique}`;

      const { error: upErr } = await supabase.storage
        .from(REVIEW_PHOTO_BUCKET)
        .upload(objectPath, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;
      onChange(objectPath);
      toast.success(t.reviews.photoUploaded);
    } catch {
      setError(t.reviews.photoUploadFailed);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) void upload(file);
  }

  async function remove() {
    const target = path;
    onChange(null);
    setError(null);
    if (!target) return;
    // File yang sudah terlanjur terunggah tidak boleh dibiarkan jadi sampah di
    // bucket. Kegagalan di sini tidak memblokir pembeli — foto sudah lepas dari
    // form; yang penting langkahnya tidak terkunci. File sisa bisa dibersihkan
    // admin lewat halaman ulasan.
    try {
      const supabase = createClient();
      await supabase.storage.from(REVIEW_PHOTO_BUCKET).remove([target]);
    } catch {
      /* file sisa akan cleaned up admin; jangan gagalkan aksi pembeli */
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <span className="mb-1 block text-sm font-bold text-cocoa-700">
        {t.reviews.photoLabel}
        <span className="ml-1 text-xs font-normal text-cocoa-400">
          {t.reviews.photoOptional}
        </span>
      </span>

      {preview ? (
        <div className="relative overflow-hidden rounded-xl border border-matcha-300 bg-matcha-50">
          <div className="relative aspect-[4/3] w-full">
            <Image
              src={preview}
              alt={t.reviews.photoLabel}
              fill
              sizes="(max-width: 640px) 100vw, 420px"
              className="object-cover"
              unoptimized
            />
          </div>
          <div className="flex justify-end border-t border-matcha-200 bg-white px-2 py-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-cocoa-200 px-2.5 py-1 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-50"
            >
              {t.reviews.photoReplace}
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="ml-1.5 rounded-lg border border-berry-500/30 px-2.5 py-1 text-xs font-bold text-berry-500 transition hover:bg-berry-500/10"
            >
              <Trash2 className="mr-1 inline size-3" />
              {t.reviews.photoRemove}
            </button>
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
          className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging
              ? "border-matcha-500 bg-matcha-50"
              : error
                ? "border-berry-500/50 bg-berry-500/5"
                : "border-cocoa-200 bg-cocoa-50/50 hover:border-matcha-400 hover:bg-matcha-50/60"
          }`}
        >
          {busy ? (
            <Loader2 className="size-6 animate-spin text-matcha-500" />
          ) : (
            <CloudUpload className="size-6 text-cocoa-400" />
          )}
          <span className="text-xs font-bold text-cocoa-700">
            {busy ? t.common.loading : t.reviews.photoPick}
          </span>
          <span className="text-[11px] text-cocoa-400">{t.reviews.photoHint}</span>
        </button>
      )}

      {error ? (
        <p className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-berry-500">
          <X className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}