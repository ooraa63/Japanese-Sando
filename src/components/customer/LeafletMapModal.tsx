"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Loader2, MapPin, Search, X } from "lucide-react";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  PHOTON_SEARCH,
  type SearchResult,
} from "./AddressPicker";
import type { Dict } from "@/lib/types";

// Fix default marker icon (Webpack bundling bikin paths icon default Leaflet
// kacau — pakai inline data URL biar gak 404).
const DefaultIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 36' fill='%23b76e00'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12zm0 18a6 6 0 110-12 6 6 0 010 12z'/></svg>`
    ),
  iconSize: [25, 36],
  iconAnchor: [12, 36],
});
L.Marker.prototype.options.icon = DefaultIcon;

type PickerDict = Dict["order"]["payment"];

/**
 * Sub-component: ketika peta di-click, panggil onPick dengan lat/lng.
 * Inject di dalam MapContainer.
 */
function ClickCapture({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Sub-component: supaya setiap kali `picked` berubah, marker & view
 * center re-binds ke koordinat baru.
 */
function PickedMarker({
  picked,
}: {
  picked: { lat: number; lng: number };
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([picked.lat, picked.lng], Math.max(map.getZoom(), 15), {
      duration: 0.6,
    });
  }, [picked.lat, picked.lng, map]);
  return <Marker position={[picked.lat, picked.lng]} />;
}

/**
 * Modal pilih lokasi — full-screen di HP.
 *
 * Library: Leaflet + OSM tile + Photon geocoding (free, OSM-based).
 *
 * UX:
 *  - Search bar: Photon autocomplete dengan debounce.
 *  - Klik hasil → marker terbang ke koordinat hasil.
 *  - Klik di peta → marker pindah.
 *  - Tombol "Simpan" → confirm pick ke parent.
 */
export function LeafletMapModal({
  open,
  center,
  initialLabel,
  onClose,
  onPick,
  dict,
}: {
  open: boolean;
  center: { lat: number; lng: number };
  initialLabel: string;
  onClose: () => void;
  onPick: (lat: number, lng: number, label: string) => void;
  dict: PickerDict;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState({
    lat: center.lat,
    lng: center.lng,
    label: initialLabel,
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Photon autocomplete (debounced 350ms)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const params = new URLSearchParams({
          q,
          lang: "id",
          lat: String(center.lat),
          lon: String(center.lng),
          limit: "8",
        });
        const r = await fetch(`${PHOTON_SEARCH}?${params.toString()}`);
        if (!r.ok) {
          setResults([]);
          return;
        }
        const data = (await r.json()) as {
          features: Array<{
            geometry: { coordinates: [number, number] };
            properties: {
              name?: string;
              city?: string;
              country?: string;
              street?: string;
              type?: string;
              osm_key?: string;
            };
          }>;
        };
        const items: SearchResult[] = data.features.map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          const parts = [
            f.properties.name,
            f.properties.street,
            f.properties.city,
            f.properties.country,
          ].filter(Boolean);
          return {
            display_name: parts.join(", ") || "(no name)",
            lat,
            lng,
            type: f.properties.osm_key ?? f.properties.type,
            category: f.properties.type,
          };
        });
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, center.lat, center.lng]);

  const initialPosition = useMemo<[number, number]>(
    () => [picked.lat, picked.lng],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <button
        type="button"
        onClick={onClose}
        aria-label="close"
        className="absolute inset-0 bg-cocoa-950/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-cocoa-100 px-5 py-3">
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

        <div className="space-y-3 px-5 py-3">
          <p className="text-xs text-cocoa-500">{dict.pickOnMapHint}</p>

          {/* Search bar */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="relative"
          >
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-cocoa-400" />
            <input
              type="search"
              className="input pl-10"
              placeholder={dict.searchPlaceholder ?? "Cari tempat atau alamat"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {busy ? (
              <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-cocoa-400" />
            ) : null}
          </form>

          {/* Hasil search */}
          {results.length > 0 ? (
            <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-cocoa-200 bg-cream-50 p-1.5">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() =>
                      setPicked({ lat: r.lat, lng: r.lng, label: r.display_name })
                    }
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-matcha-50"
                  >
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-matcha-700" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 font-semibold text-cocoa-800">
                        {r.display_name.split(",")[0]}
                      </span>
                      <span className="line-clamp-1 text-[11px] text-cocoa-500">
                        {r.display_name.split(",").slice(1).join(",").trim()}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="px-1 text-xs text-cocoa-400">
              Tidak ada hasil untuk &ldquo;{query}&rdquo;
            </p>
          ) : null}

          {/* Koordinat preview */}
          <p className="px-1 text-[11px] tabular text-cocoa-400">
            {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
          </p>
        </div>

        {/* Peta Leaflet */}
        <div className="relative h-[42dvh] shrink-0 border-y border-cocoa-100">
          <MapContainer
            center={initialPosition}
            zoom={DEFAULT_ZOOM}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
            <ClickCapture
              onPick={(lat, lng) =>
                setPicked((p) => ({ ...p, lat, lng }))
              }
            />
            <PickedMarker picked={picked} />
          </MapContainer>
        </div>

        {/* Tombol simpan */}
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-cocoa-100 bg-cream-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost !px-4 !py-2 text-sm"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onPick(picked.lat, picked.lng, picked.label)}
            className="btn-primary !px-4 !py-2 text-sm"
          >
            Simpan
          </button>
        </footer>
      </div>
    </div>
  );
}