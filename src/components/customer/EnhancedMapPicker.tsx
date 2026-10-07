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
import {
  Building,
  Coffee,
  Loader2,
  MapPin,
  Search,
  ShoppingBag,
  Trees,
  X,
} from "lucide-react";

const PHOTON_SEARCH = "https://photon.komoot.io/api";
const DEFAULT_CENTER = { lat: -6.917, lng: 107.619 };
const DEFAULT_ZOOM = 13;

// Primary marker (selected) — bigger, branded.
const SelectedIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 44' fill='%23b76e00'><path d='M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28c0-8.8-7.2-16-16-16zm0 22a6 6 0 110-12 6 6 0 010 12z'/></svg>`
    ),
  iconSize: [32, 44],
  iconAnchor: [16, 44],
});

// Secondary marker (search results) — smaller, gray.
const ResultIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 32' fill='%2378716c'><path d='M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12zm0 16a4 4 0 110-8 4 4 0 010 8z'/></svg>`
    ),
  iconSize: [22, 30],
  iconAnchor: [11, 30],
});

export type SearchResult = {
  display_name: string;
  lat: number;
  lng: number;
  /** OSM key (osm_key dari Photon) — dipakai untuk kategori icon. */
  osm_key?: string;
  type?: string;
  category?: string;
  /** Extra Photon fields untuk menampilkan info yang lebih kaya. */
  street?: string;
  city?: string;
  country?: string;
  name?: string;
  postcode?: string;
};

/**
 * Pilih icon Lucide sesuai osm_key dari Photon.
 */
function categoryIcon(osmKey?: string) {
  const k = (osmKey ?? "").toLowerCase();
  if (
    k.includes("cafe") ||
    k.includes("restaurant") ||
    k.includes("food") ||
    k.includes("amenity")
  )
    return Coffee;
  if (
    k.includes("shop") ||
    k.includes("store") ||
    k.includes("mall")
  )
    return ShoppingBag;
  if (k.includes("park") || k.includes("garden") || k.includes("forest"))
    return Trees;
  return Building;
}

function categoryColor(osmKey?: string): string {
  const k = (osmKey ?? "").toLowerCase();
  if (k.includes("cafe") || k.includes("restaurant")) return "text-honey-500";
  if (k.includes("shop") || k.includes("store") || k.includes("mall"))
    return "text-berry-500";
  if (k.includes("park") || k.includes("garden")) return "text-matcha-600";
  return "text-cocoa-700";
}

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

function PrimaryMarker({ picked }: { picked: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([picked.lat, picked.lng], Math.max(map.getZoom(), 15), {
      duration: 0.5,
    });
  }, [picked.lat, picked.lng, map]);
  return <Marker position={[picked.lat, picked.lng]} icon={SelectedIcon} />;
}

/**
 * Map picker kaya — multi-marker search results + kategori icons + reverse
 * geocoding dari klik peta.
 *
 * Props:
 *   - lat/lng: koordinat saat ini
 *   - onChange(lat, lng, label?): callback saat titik dipilih
 *   - placeholder: search input
 *
 * UX:
 *  - Search box (Photon autocomplete 350ms debounce) → 8 hasil,
 *    di-list dengan icon kategori (cafe, shop, park, building).
 *  - Multi-marker: hasil search ditampilkan sebagai pin kecil abu-abu di
 *    peta. Klik pin → pilih titik itu.
 *  - Klik di peta → reverse geocoding via Photon → dapat nama jalan /
 *    alamat → bisa dipilih / diedit manual.
 */
export function EnhancedMapPicker({
  lat,
  lng,
  onChange,
  placeholder = "Cari tempat, jalan, kota…",
}: {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number, label?: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseLabel, setReverseLabel] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const picked = useMemo(() => {
    if (lat != null && lng != null) return { lat, lng };
    return DEFAULT_CENTER;
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
              osm_id?: number;
              osm_type?: string;
              osm_key?: string;
              osm_value?: string;
              type?: string;
              name?: string;
              street?: string;
              city?: string;
              country?: string;
              postcode?: string;
            };
          }>;
        };
        const items: SearchResult[] = data.features.map((f) => {
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          const parts = [
            p.name,
            p.street,
            p.city,
            p.country,
          ].filter(Boolean);
          return {
            display_name: parts.join(", ") || "(tanpa nama)",
            lat,
            lng,
            osm_key: p.osm_key,
            type: p.osm_value ?? p.type,
            category: p.type,
            street: p.street,
            city: p.city,
            country: p.country,
            name: p.name,
            postcode: p.postcode,
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

  async function reverseGeocode(lat: number, lng: number) {
    setReverseLoading(true);
    try {
      const params = new URLSearchParams({
        lat: String(lat),
        lon: String(lng),
        lang: "id",
        limit: "1",
      });
      const r = await fetch(
        `https://photon.komoot.io/reverse?${params.toString()}`
      );
      if (!r.ok) return;
      const data = (await r.json()) as {
        features: Array<{
          properties: {
            name?: string;
            street?: string;
            city?: string;
            country?: string;
            postcode?: string;
          };
        }>;
      };
      if (data.features[0]) {
        const p = data.features[0].properties;
        const parts = [
          p.name,
          p.street,
          p.city,
          p.country,
          p.postcode,
        ].filter(Boolean);
        setReverseLabel(parts.join(", "));
      } else {
        setReverseLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      }
    } catch {
      setReverseLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setReverseLoading(false);
    }
  }

  function pickResult(r: SearchResult) {
    onChange(r.lat, r.lng, r.display_name);
  }

  function pickPoint(lat: number, lng: number) {
    onChange(lat, lng);
    reverseGeocode(lat, lng);
  }

  return (
    <div className="space-y-3">
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
          <Loader2 className="absolute top-1/52 right-3 size-4 -translate-y-1/2 animate-spin text-cocoa-400" />
        ) : query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            aria-label="Clear"
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-cocoa-400 hover:bg-cocoa-100"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {/* Hasil search — list dengan kategori icon. */}
      {results.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-cocoa-200 bg-cream-50 p-1.5">
          {results.map((r, i) => {
            const Icon = categoryIcon(r.osm_key);
            const color = categoryColor(r.osm_key);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition hover:bg-matcha-50"
                >
                  <Icon className={`mt-0.5 size-4 shrink-0 ${color}`} />
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-semibold text-cocoa-800">
                      {r.display_name.split(",")[0]}
                    </span>
                    <span className="line-clamp-1 text-[10px] text-cocoa-500">
                      {r.display_name.split(",").slice(1).join(",").trim()}
                    </span>
                  </span>
                  <span className="shrink-0 self-center rounded bg-cocoa-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-cocoa-600">
                    {r.osm_key ?? r.type ?? "place"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : query.trim() ? (
        <p className="px-1 text-xs text-cocoa-400">
          Tidak ada hasil untuk &ldquo;{query}&rdquo; — coba kata kunci lain atau klik di peta.
        </p>
      ) : null}

      {/* Koordinat + reverse geocoding label */}
      <div className="flex items-center justify-between gap-2 px-1 text-[11px] tabular">
        <span className="font-mono text-cocoa-500">
          {picked.lat.toFixed(5)}, {picked.lng.toFixed(5)}
        </span>
        {reverseLoading ? (
          <span className="flex items-center gap-1 text-cocoa-400">
            <Loader2 className="size-3 animate-spin" />
            cek alamat…
          </span>
        ) : reverseLabel ? (
          <span className="line-clamp-1 flex-1 text-right text-cocoa-500">
            {reverseLabel}
          </span>
        ) : null}
      </div>

      {/* Peta Leaflet */}
      <div className="overflow-hidden rounded-xl border border-cocoa-200">
        <MapContainer
          center={[picked.lat, picked.lng]}
          zoom={DEFAULT_ZOOM}
          style={{ height: "320px", width: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://photon.komoot.io">Photon</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickCapture onPick={pickPoint} />
          {/* Multi-marker: search result kecil-kecil. */}
          {results.map((r, i) =>
            r.lat === picked.lat && r.lng === picked.lng ? null : (
              <Marker
                key={`res-${i}`}
                position={[r.lat, r.lng]}
                icon={ResultIcon}
                eventHandlers={{
                  click: () => pickResult(r),
                }}
              />
            )
          )}
          {/* Primary (selected) marker. */}
          <PrimaryMarker picked={picked} />
        </MapContainer>
      </div>

      <p className="px-1 text-[11px] text-cocoa-500">
        💡 Ketik nama tempat di kolom atas — hasil autocomplete dari Photon
        (basis OpenStreetMap). Klik pin kecil abu-abu untuk pilih, atau klik
        langsung di peta untuk koordinat manual.
      </p>
    </div>
  );
}