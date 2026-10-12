"use client";

import { CheckCircle2, MapPin, X } from "lucide-react";
import type { Dict } from "@/lib/types";
import type { CartDraft } from "@/components/customer/CartProvider";

/** Subset Dict yang dipakai picker ini. */
type PickerDict = Dict["order"]["payment"];

/**
 * Alamat pengiriman TANPA peta.
 *
 * Steven 12-10-2026: "Untuk Map saya mau hapus dulu deh kita jangan pakai map
 * dulu hapus semuanya, untuk deliver to your location nanti mereka harus isi
 * dengan detail aja pakai ketik."
 *
 * Jadi pembeli tidak lagi memilih titik di peta. Dia cukup menuliskan alamatnya
 * lengkap beserta detail yang membantu kurir menemukan lokasi (patokan,
 * warna pagar, nama jalan, nomor rumah).
 *
 * Kolom `lat`/`lng` di draft TIDAK lagi diisi dari sini. Field-nya sengaja
 * tidak dihapus dari `CartDraft` karena `create_order` masih punya kolomnya di
 * database - kalau suatu saat dibutuhkan untuk geo-analytics, nilainya masih
 * bisa diisi dari sumber lain tanpa perlu migration.
 */
export function AddressPicker({
  draft,
  updateDraft,
  dict,
}: {
  draft: CartDraft;
  updateDraft: (patch: Partial<CartDraft>) => void;
  dict: PickerDict;
}) {
  // Alamat dianggap sudah terisi kalau ada isi besides whitespace.
  const adaAlamat = draft.address.trim().length > 0;

  return (
    <div className="mt-4 space-y-3">
      <label htmlFor="address" className="label">
        {dict.address}
      </label>
      <textarea
        id="address"
        rows={2}
        className="input resize-none"
        placeholder={dict.addressPlaceholder}
        value={draft.address}
        onChange={(e) => updateDraft({ address: e.target.value })}
      />

      <div>
        <label htmlFor="address-note" className="label">
          {dict.addressNote}
          <span className="ml-1 font-normal text-cocoa-400">
            ({dict.addressNoteHint})
          </span>
        </label>
        <textarea
          id="address-note"
          rows={3}
          className="input resize-none"
          placeholder="mis. pagar putih, rumah cat biru, depan masjid, Gg. Melati No. 12"
          value={draft.addressNote}
          onChange={(e) => updateDraft({ addressNote: e.target.value })}
        />
      </div>

      {/* Konfirmasi singkat supaya pembeli tahu alamatnya sudah tercatat. */}
      {adaAlamat ? (
        <div className="flex items-start gap-2 rounded-2xl border border-matcha-300 bg-matcha-50 px-3 py-2.5 text-xs">
          {draft.addressNote.trim() ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-matcha-600" />
          ) : (
            <MapPin className="mt-0.5 size-4 shrink-0 text-matcha-600" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-cocoa-800">{dict.address}</p>
            <p className="mt-0.5 break-words text-cocoa-600">
              {draft.address}
            </p>
            {draft.addressNote.trim() ? (
              <p className="mt-1 break-words text-cocoa-500">
                {dict.addressNote}: {draft.addressNote}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() =>
              updateDraft({ address: "", addressNote: "", lat: null, lng: null })
            }
            className="rounded-md p-1 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-berry-500"
            aria-label="Hapus alamat"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}