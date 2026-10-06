"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import type { Dict } from "@/lib/types";
import type { CartDraft } from "@/components/customer/CartProvider";

/** Subset Dict yang dipakai picker ini. */
type PickerDict = Dict["order"]["payment"];

/**
 * Picker alamat dengan peta OSM.
 *
 * Alur:
 *  - User ketik alamat (nama jalan / tempat spesifik, mis. "Starbucks
 *    Dago", "Jl. Asia Afrika 100") di search box.
 *  - Klik tombol cari -> Nominatim forward-geocode -> dapat {lat, lng, display_name}.
 *  - Pilih dari hasil pencarian -> set alamat + koordinat.
 *  - Bisa edit alamat teks & patokan (catatan alamat).
 *
 * OSM embed default tidak punya zoom control; ukuran iframe sudah cukup
 * kecil untuk HP. Customer tidak perlu zoom manual — preview menampilkan
 * area ±0.01° (~1.1 km) dari titik yang dipilih.
 */
const DEFAULT_CENTER = { lat: -6.917, lng: 107.619 };
const NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search";

type SearchResult = {
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
};

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

  // Preview ringkas: ±0.01° (~1.1 km) — cukup untuk HP, tidak perlu zoom.
  const bbox = useMemo(() => {
    const delta = 0.01;
    return {
      west: center.lng - delta,
      north: center.lat + delta,
      east: center.lng + delta,
      south: center.lat - delta,
    };
  }, [center]);

  const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.west}%2C${bbox.south}%2C${bbox.east}%2C${bbox.north}&layer=mapnik&marker=${center.lat}%2C${center.lng}`;

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

      {/* Preview peta ringkas (kalau sudah ada koordinat) — tanpa zoom controls. */}
      {hasLocation ? (
        <div className="overflow-hidden rounded-2xl border border-cocoa-200">
          <iframe
            title="map-preview"
            src={iframeSrc}
            className="h-44 w-full"
            loading="lazy"
          />
          <div className="flex items-center justify-between gap-2 border-t border-cocoa-100 bg-cream-50 px-3 py-1.5 text-[11px] text-cocoa-500">
            <span className="line-clamp-1 flex-1">{draft.address}</span>
            <button
              type="button"
              onClick={() => updateDraft({ lat: null, lng: null })}
              className="rounded-md p-1 text-cocoa-400 transition hover:bg-cocoa-100 hover:text-berry-500"
              aria-label="Hapus lokasi"
            >
              <X className="size-3.5" />
            </button>
          </div>
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
        <MapSearchModal
          center={center}
          onClose={() => setOpen(false)}
          onPick={(lat, lng, label) => {
            updateDraft({
              lat,
              lng,
              address: label || draft.address,
            });
            setOpen(false);
          }}
          dict={dict}
        />
      ) : null}
    </div>
  );
}

/**
 * Modal pilih lokasi — search box Nominatim + preview peta.
 *
 * Pakai limit=8 supaya hasil lebih kaya (nama jalan, POI, tempat umum
 * seperti Starbucks, mall, dsb.). Beda dengan dulu yang limit=3.
 */
function MapSearchModal({
  center,
  onClose,
  onPick,
  dict,
}: {
  center: { lat: number; lng: number };
  onClose: () => void;
  onPick: (lat: number, lng: number, label: string) => void;
  dict: PickerDict;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [preview, setPreview] = useState<{
    lat: number;
    lng: number;
    label: string;
  }>({ lat: center.lat, lng: center.lng, label: "" });

  // Preview peta di modal: ±0.02° (~2.2 km) — cukup untuk pilih titik, gak perlu zoom.
  const delta = 0.02;
  const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${preview.lng - delta}%2C${preview.lat - delta}%2C${preview.lng + delta}%2C${preview.lat + delta}&layer=mapnik&marker=${preview.lat}%2C${preview.lng}`;

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    try {
      // Limit 8 hasil. Pakai addressdetails=1 supaya bisa sortir 'amenity'
      // (POI seperti Starbucks, restaurant, mall).
      const r = await fetch(
        `${NOMINATIM_SEARCH}?q=${encodeURIComponent(q)}&format=json&limit=8&addressdetails=1&countrycodes=id`,
        {
          headers: { "Accept-Language": "id,en" },
        }
      );
      if (!r.ok) {
        setResults([]);
        return;
      }
      const data = (await r.json()) as SearchResult[];
      setResults(data);
      if (data.length > 0) {
        const first = data[0];
        setPreview({
          lat: Number(first.lat),
          lng: Number(first.lon),
          label: first.display_name,
        });
      }
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="absolute inset-0 bg-cocoa-950/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-cocoa-100 px-5 py-4">
          <h2 className="text-base font-bold text-cocoa-800">
            {dict.pickOnMap}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-cocoa-400 transition hover:bg-cocoa-100"
            aria-label="close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-cocoa-500">{dict.pickOnMapHint}</p>

          {/* Search bar */}
          <form onSubmit={search} className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-400" />
            <input
              type="search"
              className="input pl-10"
              placeholder={dict.searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || query.trim().length === 0}
              className="absolute inset-y-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-cocoa-800 px-3 text-xs font-bold text-cream-50 transition hover:bg-cocoa-700 disabled:opacity-40"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Search className="size-3.5" />
              )}
              {dict.searchButton}
            </button>
          </form>

          {/* Preview peta — tanpa zoom control, cukup ±0.02° */}
          <div className="overflow-hidden rounded-2xl border border-cocoa-200">
            <iframe
              title="map-preview"
              src={iframeSrc}
              className="h-52 w-full"
              loading="lazy"
            />
          </div>

          {/* Hasil pencarian — limit 8 supaya lebih kaya */}
          {results.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto rounded-2xl border border-cocoa-200 bg-cocoa-50">
              {results.map((r, i) => (
                <li
                  key={`${r.lat}-${r.lon}-${i}`}
                  className="border-b border-cocoa-100 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setPreview({
                        lat: Number(r.lat),
                        lng: Number(r.lon),
                        label: r.display_name,
                      })
                    }
                    className="block w-full px-3 py-2 text-left text-[12px] text-cocoa-700 transition hover:bg-cocoa-100"
                  >
                    <span className="line-clamp-2">{r.display_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query && !busy ? (
            <p className="rounded-xl bg-honey-300/20 p-3 text-center text-xs font-semibold text-honey-500">
              {dict.noResult}
            </p>
          ) : null}

          {/* Preview alamat yang akan disimpan */}
          {preview.label ? (
            <div className="rounded-xl border border-cocoa-200 bg-cream-50 p-3">
              <p className="text-[10px] font-bold tracking-wide text-cocoa-400 uppercase">
                {dict.previewLabel}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-cocoa-800">
                {preview.label}
              </p>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-cocoa-100 bg-cocoa-50/60 px-5 py-3.5">
          <button type="button" onClick={onClose} className="btn-ghost">
            {dict.cancel}
          </button>
          <button
            type="button"
            onClick={() => onPick(preview.lat, preview.lng, preview.label)}
            className="btn-primary"
            disabled={!preview.label}
          >
            {dict.confirmLocation}
          </button>
        </footer>
      </div>
    </div>
  );
}