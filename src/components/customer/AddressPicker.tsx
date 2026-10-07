"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import dynamic from "next/dynamic";
import type { Dict } from "@/lib/types";
import type { CartDraft } from "@/components/customer/CartProvider";

/** Subset Dict yang dipakai picker ini. */
type PickerDict = Dict["order"]["payment"];

/**
 * Picker alamat dengan peta Leaflet (OSM tile) + Photon autocomplete.
 *
 * Alur:
 *  - User klik tombol "Pilih di peta" → modal Leaflet full-screen terbuka.
 *  - Search box: Photon (photon.komoot.io) free OSM-based autocomplete
 *    (POI, jalan, kota, desa di Indonesia — lebih kaya dari Nominatim).
 *  - Hasil search → list + panning map. Klik hasil ATAU klik di peta langsung
 *    → set koordinat (lat, lng).
 *  - Klik "Simpan" → updateDraft({lat, lng, address}).
 *
 * Library:
 *  - leaflet@1.9 (UI map: zoom, pan, marker, scale control)
 *  - react-leaflet@5 (React wrapper untuk Leaflet)
 *  - Tile: OpenStreetMap (free, no API key)
 *  - Geocoding: Photon (free, OSM-based) — lebih kaya dari Nominatim untuk
 *    autocomplete
 *
 * Leaflet butuh `window` — di-load dinamis dengan next/dynamic + ssr:false.
 */
const DEFAULT_CENTER = { lat: -6.917, lng: 107.619 };
const PHOTON_SEARCH = "https://photon.komoot.io/api";
const DEFAULT_ZOOM = 14;

type SearchResult = {
  display_name: string;
  lat: number;
  lng: number;
  type?: string;
  category?: string;
};

/**
 * Modal peta — di-load dinamis supaya Leaflet (yang akses window) gak
 * nyala di server. ssr:false → gak ke-bundle di server build.
 */
const LeafletMapModal = dynamic(
  () => import("./LeafletMapModal").then((m) => m.LeafletMapModal),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-cocoa-50">
        <Loader2 className="size-6 animate-spin text-cocoa-400" />
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

  const center = useMemo(
    () =>
      hasLocation
        ? { lat: draft.lat as number, lng: draft.lng as number }
        : DEFAULT_CENTER,
    [draft.lat, draft.lng, hasLocation]
  );

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
              <X className="size-3.5" />
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
        <LeafletMapModal
          open={open}
          center={center}
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

// Re-export default center supaya LeafletMapModal bisa pakai.
export { DEFAULT_CENTER, DEFAULT_ZOOM, PHOTON_SEARCH };
export type { SearchResult };