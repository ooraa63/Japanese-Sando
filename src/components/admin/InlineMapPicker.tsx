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
import { Loader2, Search, X } from "lucide-react";

const DefaultCenter = { lat: -6.917, lng: 107.619 };
const PHOTON_SEARCH = "https://photon.komoot.io/api";
const DEFAULT_ZOOM = 13;

// Inline marker icon (sama dengan LeafletMapModal).
const InlineIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 36' fill='%23b76e00'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24c0-6.6-5.4-12-12-12zm0 18a6 6 0 110-12 6 6 0 010 12z'/></svg>`
    ),
  iconSize: [25, 36],
  iconAnchor: [12, 36],
});
L.Marker.prototype.options.icon = InlineIcon;

type SearchResult = {
  display_name: string;
  lat: number;
  lng: number;
  type?: string;
  category?: string;
};

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

function PickedMarker({ picked }: { picked: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([picked.lat, picked.lng], Math.max(map.getZoom(), 14), {
      duration: 0.6,
    });
  }, [picked.lat, picked.lng, map]);
  return <Marker position={[picked.lat, picked.lng]} />;
}

/**
 * Inline map picker ringan untuk admin & customer — sama-sama pakai
 * Leaflet + OSM tile + Photon autocomplete (free, gak butuh API key).
 *
 * Props:
 *   - lat/lng: koordinat saat ini (null = pakai DefaultCenter).
 *   - onChange(lat, lng): callback saat user pilih titik baru
 *     (klik di peta ATAU klik hasil search).
 *   - placeholder: search input placeholder.
 *
 * UX:
 *  - Search box: Photon autocomplete (POI bisnis, universitas, jalan).
 *    Klik hasil → marker pindah ke koordinat hasil.
 *  - Klik di peta → marker pindah.
 *  - Koordinat terkini ditampilkan di bawah search box untuk verifikasi.
 */
export function InlineMapPicker({
  lat,
  lng,
  onChange,
  placeholder = "Cari tempat (mis. Universitas UVERS)",
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const picked = useMemo(() => {
    if (lat != null && lng != null) return { lat, lng };
    return DefaultCenter;
  }, [lat, lng]);

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
          lat: String(picked.lat),
          lon: String(picked.lng),
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
            display_name: parts.join(", ") || "(tanpa nama)",
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
  }, [query, picked.lat, picked.lng]);

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-cocoa-400" />
        <input
          type="search"
          className="input pl-10"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {busy ? (
          <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-cocoa-400" />
        ) : query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-cocoa-400 hover:bg-cocoa-100"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Hasil search */}
      {results.length > 0 ? (
        <ul className="max-h-40 space-y-1 rounded-xl border border-cocoa-200 bg-cream-50 p-1.5">
          {results.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onChange(r.lat, r.lng)}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition hover:bg-matcha-50"
              >
                <span className="mt-0.5 text-cocoa-400">📍</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-semibold text-cocoa-800">
                    {r.display_name.split(",")[0]}
                  </span>
                  <span className="line-clamp-1 text-[10px] text-cocoa-500">
                    {r.display_name.split(",").slice(1).join(",").trim()}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Koordinat preview */}
      <p className="px-1 font-mono text-[11px] tabular text-cocoa-500">
        {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
      </p>

      {/* Peta */}
      <div className="overflow-hidden rounded-xl border border-cocoa-200">
        <MapContainer
          center={[picked.lat, picked.lng]}
          zoom={DEFAULT_ZOOM}
          style={{ height: "260px", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickCapture onPick={onChange} />
          <PickedMarker picked={picked} />
        </MapContainer>
      </div>

      <p className="px-1 text-[11px] text-cocoa-500">
        💡 Ketik nama tempat di atas (Starbucks, mall, universitas, jalan) —
        pilih dari hasil ATAU klik langsung di peta.
      </p>
    </div>
  );
}