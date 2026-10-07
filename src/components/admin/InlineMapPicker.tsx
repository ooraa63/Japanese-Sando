"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Loader2, Search, X } from "lucide-react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAPBOX_GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DEFAULT_CENTER: [number, number] = [107.619, -6.917];
const DEFAULT_ZOOM = 13;

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

interface GeocodeFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  properties?: { category?: string };
  place_type?: string[];
}

type SearchResult = {
  display_name: string;
  lat: number;
  lng: number;
  type?: string;
  category?: string;
};

async function mapboxGeocode(
  query: string,
  proximity?: [number, number]
): Promise<SearchResult[]> {
  if (!MAPBOX_TOKEN || !query.trim()) return [];
  const url = new URL(
    `${MAPBOX_GEOCODE}/${encodeURIComponent(query.trim())}.json`
  );
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "8");
  url.searchParams.set("language", "id");
  url.searchParams.set("country", "id");
  url.searchParams.set("types", "poi,address,place,neighborhood,locality");
  if (proximity) {
    url.searchParams.set("proximity", `${proximity[0]},${proximity[1]}`);
  }
  const r = await fetch(url.toString());
  if (!r.ok) return [];
  const data = (await r.json()) as { features: GeocodeFeature[] };
  return data.features.map((f) => ({
    display_name: f.place_name,
    lat: f.center[1],
    lng: f.center[0],
    type: f.place_type?.[0],
    category: f.properties?.category,
  }));
}

/**
 * Inline map picker ringan untuk admin (zona delivery/pickup) — Mapbox GL JS.
 *
 * UX:
 *  - Search box → Mapbox Geocoding API (POI + alamat).
 *    Klik hasil → peta flyTo titik itu.
 *  - Klik di peta → koordinat = titik yang diklik.
 *  - Center pin (custom HTML marker) stay di tengah visual, koordinat =
 *    map.getCenter(). Jadi admin cukup lihat pin-nya ada di zona mana.
 *  - Koordinat terkini ditampilkan di bawah search box.
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
    return { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };
  }, [lat, lng]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const isProgrammaticRef = useRef(false);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;
    if (mapRef.current) return;

    const m = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [picked.lng, picked.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    m.on("moveend", () => {
      if (isProgrammaticRef.current) {
        isProgrammaticRef.current = false;
        return;
      }
      const c = m.getCenter();
      onChange(c.lat, c.lng);
    });

    m.on("click", (e) => {
      isProgrammaticRef.current = true;
      m.flyTo({
        center: e.lngLat,
        zoom: Math.max(m.getZoom(), 15),
        duration: 600,
      });
    });

    mapRef.current = m;
    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync map center when lat/lng prop changes dari luar (klik search result)
  useEffect(() => {
    const m = mapRef.current;
    if (!m || lat == null || lng == null) return;
    const cur = m.getCenter();
    if (Math.abs(cur.lat - lat) > 0.0001 || Math.abs(cur.lng - lng) > 0.0001) {
      isProgrammaticRef.current = true;
      m.flyTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
    }
  }, [lat, lng]);

  // Search debounce
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
        const items = await mapboxGeocode(q, [picked.lng, picked.lat]);
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

  function pickResult(r: SearchResult) {
    isProgrammaticRef.current = true;
    mapRef.current?.flyTo({
      center: [r.lng, r.lat],
      zoom: Math.max(mapRef.current?.getZoom() ?? 15, 15),
      duration: 600,
    });
    onChange(r.lat, r.lng);
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-xl border border-berry-200 bg-berry-50 p-4 text-xs text-berry-700">
        <p className="font-bold">Mapbox token belum disetel</p>
        <p className="mt-1">
          Tambahkan <code className="rounded bg-berry-100 px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_MAPBOX_TOKEN</code> ke <code className="font-mono text-[11px]">.env.local</code>, lalu restart dev server. Token publik gratis di{" "}
          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            mapbox.com
          </a>
          .
        </p>
      </div>
    );
  }

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
                onClick={() => pickResult(r)}
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

      {/* Peta — center pin ngikut map center */}
      <div className="relative h-64 overflow-hidden rounded-xl border border-cocoa-200">
        <div ref={mapContainerRef} className="absolute inset-0" />
        <div className="mapbox-center-pin" aria-hidden>
          <svg viewBox="0 0 32 44" width="32" height="44">
            <path
              d="M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28c0-8.8-7.2-16-16-16zm0 22a6 6 0 110-12 6 6 0 010 12z"
              fill="#d18d1c"
              stroke="#fff"
              strokeWidth="1.5"
            />
          </svg>
        </div>
      </div>

      <p className="px-1 text-[11px] text-cocoa-500">
        💡 Ketik nama tempat di atas (Starbucks, mall, universitas, jalan) —
        pilih dari hasil ATAU klik langsung di peta. Pin di tengah adalah
        titik terpilih.
      </p>
    </div>
  );
}
