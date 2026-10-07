"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import dynamic from "next/dynamic";
import type { Dict } from "@/lib/types";
import type { CartDraft } from "@/components/customer/CartProvider";

/** Subset Dict yang dipakai picker ini. */
type PickerDict = Dict["order"]["payment"];

/**
 * Picker alamat dengan Leaflet (OSM tile) + Photon autocomplete (free).
 *
 * Leaflet butuh `window` — di-load dinamis dengan next/dynamic + ssr:false.
 */
const AddressPickerModal = dynamic(
  () => import("./LeafletMapModal").then((m) => m.LeafletMapModal),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-cocoa-50">
        <MapPin className="size-6 animate-pulse text-cocoa-400" />
      </div>
    ),
  }
);

export function AddressPicker({
  draft,
  updateDraft,
  dict,
}: {
  draft: CartDraft;
  updateDraft: (patch: Partial<CartDraft>) => void;
  dict: PickerDict;
}) {
  const [open, setOpen] = useState(false);

  const hasLocation =
    typeof draft.lat === "number" && typeof draft.lng === "number";

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="address" className="label flex-1">
          {dict.address}
        </label>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cocoa-200 px-2.5 py-1.5 text-xs font-bold text-cocoa-600 transition hover:bg-cocoa-50"
        >
          <MapPin className="size-3.5" />
          {dict.pickOnMap}
        </button>
      </div>

      <textarea
        id="address"
        rows={2}
        className="input resize-none"
        placeholder={dict.addressPlaceholder}
        value={draft.address}
        onChange={(e) => updateDraft({ address: e.target.value })}
      />

      {hasLocation ? (
        <div className="overflow-hidden rounded-2xl border border-cocoa-200 bg-cream-50">
          <div className="flex items-center gap-2 border-b border-cocoa-100 bg-cream-50 px-3 py-2 text-xs">
            <MapPin className="size-3.5 shrink-0 text-matcha-600" />
            <span className="line-clamp-1 flex-1 text-cocoa-700">
              {draft.address}
            </span>
            <button
              type="button"
              onClick={() => updateDraft({ lat: null, lng: null })}
              className="rounded-md p-1 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-berry-500"
              aria-label="Hapus lokasi"
            >
              ×
            </button>
          </div>
          <p className="px-3 py-1.5 text-[11px] tabular text-cocoa-400">
            {(draft.lat as number).toFixed(5)}, {(draft.lng as number).toFixed(5)}
          </p>
        </div>
      ) : null}

      <div>
        <label htmlFor="address-note" className="label">
          {dict.addressNote}
          <span className="ml-1 font-normal text-cocoa-400">
            ({dict.addressNoteHint})
          </span>
        </label>
        <textarea
          id="address-note"
          rows={2}
          className="input resize-none"
          placeholder="mis. pagar putih, rumah cat biru, depan masjid"
          value={draft.addressNote}
          onChange={(e) => updateDraft({ addressNote: e.target.value })}
        />
      </div>

      {open ? (
        <AddressPickerModal
          open={open}
          center={{
            lat: typeof draft.lat === "number" ? draft.lat : -6.917,
            lng: typeof draft.lng === "number" ? draft.lng : 107.619,
          }}
          initialLabel={draft.address}
          onClose={() => setOpen(false)}
          onPick={(lat, lng, label) => {
            updateDraft({ lat, lng, address: label || draft.address });
            setOpen(false);
          }}
          dict={dict}
        />
      ) : null}
    </div>
  );
}