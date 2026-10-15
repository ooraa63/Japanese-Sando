"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { CloudUpload, Loader2, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/components/ui/Toast";
import {
  REVIEW_PHOTO_BUCKET,
  REVIEW_PHOTO_MAX,
  reviewPhotoUrls,
} from "@/lib/reviews";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Unggah foto untuk ulasan (migration-58) — sampai 3 foto, semuanya opsional.
 *
 * Bedanya dari `ProofUploader`:
 * - bucket `review-photos` (publik), bukan `payment-proofs` (privat), jadi
 *   tampilannya pakai URL langsung tanpa signed URL;
 * - menyimpan DAFTAR path (`string[]`), bukan satu path. Urutannya adalah
 *   urutan tampil di beranda, jadi indeks di array = posisi di daftar.
 *
 * Menghapus satu foto langsung menghapus filenya di bucket supaya tidak
 * tertinggal file yatim. Kegagalan hapus file tidak memblokir pembeli: foto
 * sudah lepas dari form, dan file sisa bisa dibereskan admin.
 */
export function ReviewPhotoUploader({
  paths,
  onChange,
}: {
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const urls = reviewPhotoUrls(paths);
  const penuh = paths.length >= REVIEW_PHOTO_MAX;

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
    if (paths.length >= REVIEW_PHOTO_MAX) {
      setError(t.reviews.photoTooMany);
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
      onChange([...paths, objectPath]);
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

  async function removeAt(index: number) {
    const target = paths[index];
    if (!target) return;
    onChange(paths.filter((_, i) => i !== index));
    setError(null);
    try {
      const supabase = createClient();
      await supabase.storage.from(REVIEW_PHOTO_BUCKET).remove([target]);
    } catch {
      /* file sisa akan dibereskan admin; jangan gagalkan aksi pembeli */
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

      {urls.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {urls.map((src, i) => (
            <div
              key={paths[i]}
              className="group relative overflow-hidden rounded-xl border border-matcha-300 bg-matcha-50"
            >
              <div className="relative aspect-square w-full">
                <Image
                  src={src}
                  alt={`${t.reviews.photoLabel} ${i + 1}`}
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
              </div>
              <button
                type="button"
                onClick={() => void removeAt(i)}
                aria-label={t.reviews.photoRemove}
                className="absolute top-1 right-1 grid size-7 place-items-center rounded-lg bg-white/90 text-berry-500 shadow-sm transition hover:bg-white"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}

          {!penuh ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-cocoa-200 text-cocoa-400 transition hover:border-matcha-400 hover:text-matcha-600"
            >
              <Plus className="size-5" />
              <span className="text-[10px] font-bold">
                {paths.length}/{REVIEW_PHOTO_MAX}
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      {!penuh ? (
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
      ) : null}

      {error ? (
        <p className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-berry-500">
          <X className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}