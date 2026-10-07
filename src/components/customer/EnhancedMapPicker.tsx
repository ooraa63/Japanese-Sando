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
  Crosshair,
  Loader2,
  MapPin,
  Search,
  ShoppingBag,
  Trees,
  X,
} from "lucide-react";

const PHOTON_SEARCH = "https://photon.komoot.io/api";
const OVERPASS_API = "https://overpass-api.de/api/interpreter";
const DEFAULT_CENTER = { lat: -6.917, lng: 107.619 };
const DEFAULT_ZOOM = 13;

const SelectedIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 44' fill='%23b76e00'><path d='M16 0C7.2 0 0 7.2 0 16c0 12 16 28 16 28s16-16 16-28c0-8.8-7.2-16-16-16zm0 22a6 6 0 110-12 6 6 0 010 12z'/></svg>`
    ),
  iconSize: [32, 44],
  iconAnchor: [16, 44],
});
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
  osm_key?: string;
  type?: string;
  category?: string;
  street?: string;
  city?: string;
  country?: string;
  name?: string;
  postcode?: string;
  /** Kalau true, hasil ini hanya berisi nama brand/POI yg cocok dengan query
   *  (matched by Overpass query). Bisa dipilih untuk auto-navigate. */
  matchedName?: boolean;
};

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
 * Query Overpass (OSM) untuk POI tertentu dalam radius 5km dari titik
 * tertentu. Overpass lebih kaya untuk POI tags (amenity, cafe, shop) dan
 * bisa query by name filter.
 *
 * Refs: https://wiki.openstreetmap.org/wiki/Overpass_API
 */
async function overpassSearch(
  query: string,
  lat: number,
  lng: number
): Promise<SearchResult[]> {
  // Cari POI berdasarkan nama mirip `query` di sekitar titik. Radius 5km.
  // Nama cocok baik di name maupun brand.
  const escaped = query.replace(/"/g, '\\"');
  const overpassQL = `
    [out:json][timeout:8];
    (
      node["name"~"${escaped}",i](around:5000,${lat},${lng});
      way["name"~"${escaped}",i](around:5000,${lat},${lng});
      node["brand"~"${escaped}",i](around:5000,${lat},${lng});
      way["brand"~"${escaped}",i](around:5000,${lat},${lng});
    );
    out center 20;
  `;
  try {
    const r = await fetch(OVERPASS_API, {
      method: "POST",
      body: "data=" + encodeURIComponent(overpassQL),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!r.ok) return [];
    const data = (await r.json()) as {
      elements: Array<{
        id: number;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: Record<string, string>;
      }>;
    };
    return data.elements
      .map((el) => {
        const lat2 = el.lat ?? el.center?.lat;
        const lng2 = el.lon ?? el.center?.lon;
        if (lat2 == null || lng2 == null) return null;
        const t = el.tags ?? {};
        const name = t.name || t.brand || "(tanpa nama)";
        const addrParts = [
          t["addr:street"],
          t["addr:housenumber"],
          t["addr:suburb"],
          t["addr:city"],
          t["addr:postcode"],
        ].filter(Boolean);
        const display_name = [name, ...addrParts].join(", ");
        return {
          display_name,
          lat: lat2,
          lng: lng2,
          osm_key: Object.keys(t).find((k) =>
            /^(amenity|shop|leisure|tourism|office)$/.test(k)
          ),
          name,
          street: t["addr:street"],
          city: t["addr:city"],
          country: t["addr:country"],
          postcode: t["addr:postcode"],
          type: t.cuisine ?? t.amenity ?? t.shop,
          matchedName: true,
        } as SearchResult;
      })
      .filter(Boolean) as SearchResult[];
  } catch {
    return [];
  }
}

/**
 * Map picker kaya dengan multi-source (Photon autocomplete + Overpass POI
 * search) + browser geolocation + reverse geocoding.
 *
 * - Search: Photon dulu. Kalau nama brand/POI spesifik (gak ada di OSM),
 *   fallback ke Overpass query untuk POI yang namanya mirip dalam radius 5km.
 * - "Pakai lokasi saya": request browser geolocation → recenter map ke
 *   posisi user.
 * - "Tempat populer di sekitar": kalau search kosong, Overpass query
 *   cafe/restaurant/mall dalam radius 1km dari titik user.
 *
 * Props:
 *   - lat/lng: koordinat saat ini
 *   - onChange(lat, lng, label?): callback saat titik dipilih
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
  const [nearby, setNearby] = useState<SearchResult[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const picked = useMemo(() => {
    if (lat != null && lng != null) return { lat, lng };
    return DEFAULT_CENTER;
  }, [lat, lng]);

  // ---------- Search ----------
  // Multi-source: Photon → kalau hasil < 3, fallback Overpass query.
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
        // Source 1: Photon (basis OSM, lengkap untuk jalan/POI generic)
        const params = new URLSearchParams({
          q,
          lang: "id",
          lat: String(picked.lat),
          lon: String(picked.lng),
          limit: "8",
        });
        const r = await fetch(`${PHOTON_SEARCH}?${params.toString()}`);
        const data = r.ok
          ? ((await r.json()) as { features: never[] })
          : { features: [] };

        const photonItems: SearchResult[] = data.features.map((f) => {
          // ... (sama seperti sebelumnya)
          const ff = f as unknown as {
            geometry: { coordinates: [number, number] };
            properties: {
              osm_key?: string;
              osm_value?: string;
              type?: string;
              name?: string;
              street?: string;
              city?: string;
              country?: string;
              postcode?: string;
            };
          };
          const [lng2, lat2] = ff.geometry.coordinates;
          const p = ff.properties;
          const parts = [
            p.name,
            p.street,
            p.city,
            p.country,
          ].filter(Boolean);
          return {
            display_name: parts.join(", ") || "(tanpa nama)",
            lat: lat2,
            lng: lng2,
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

        let combined = photonItems;

        // Source 2: Overpass (basis OSM, lengkap untuk POI tags).
        // Dipakai kalau Photon gak nemu (mis. Starbucks yg belum
        // di-tag di OSM Indonesia).
        if (photonItems.length < 3) {
          const overpass = await overpassSearch(q, picked.lat, picked.lng);
          // Dedupe by (lat, lng) approx
          const seen = new Set(
            photonItems.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
          );
          const merged = [...photonItems];
          for (const o of overpass) {
            const key = `${o.lat.toFixed(4)},${o.lng.toFixed(4)}`;
            if (!seen.has(key)) {
              merged.push(o);
              seen.add(key);
            }
          }
          combined = merged;
        }

        setResults(combined);
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

  // ---------- Nearby POIs (muncul saat search box kosong & ada lokasi) ----------
  useEffect(() => {
    if (query.trim()) {
      setNearby([]);
      return;
    }
    const debounce = setTimeout(async () => {
      setNearbyLoading(true);
      try {
        // Overpass query: amenity in [cafe, restaurant, fast_food, food_court]
        // + shop in [mall, supermarket]
        const overpassQL = `
          [out:json][timeout:10];
          (
            node["amenity"~"cafe|restaurant|fast_food|food_court|bar|pub"](around:1500,${picked.lat},${picked.lng});
            way["amenity"~"cafe|restaurant|fast_food|food_court|bar|pub"](around:1500,${picked.lat},${picked.lng});
            node["shop"~"mall|supermarket|department_store"](around:1500,${picked.lat},${picked.lng});
            way["shop"~"mall|supermarket|department_store"](around:1500,${picked.lat},${picked.lng});
          );
          out center 12;
        `;
        const r = await fetch(OVERPASS_API, {
          method: "POST",
          body: "data=" + encodeURIComponent(overpassQL),
        });
        if (!r.ok) {
          setNearby([]);
          return;
        }
        const data = (await r.json()) as {
          elements: Array<{
            lat?: number;
            lon?: number;
            center?: { lat: number; lon: number };
            tags?: Record<string, string>;
          }>;
        };
        const items: SearchResult[] = data.elements
          .map((el) => {
            const lat2 = el.lat ?? el.center?.lat;
            const lng2 = el.lon ?? el.center?.lon;
            if (lat2 == null || lng2 == null) return null;
            const t = el.tags ?? {};
            const osmKey = t.amenity ?? t.shop ?? t.leisure;
            const name = t.name || osmKey || "Tempat terdekat";
            return {
              display_name: name,
              lat: lat2,
              lng: lng2,
              osm_key: osmKey,
              name,
              type: t.cuisine ?? osmKey,
              street: t["addr:street"],
              city: t["addr:city"],
              country: t["addr:country"],
              postcode: t["addr:postcode"],
            } as SearchResult;
          })
          .filter(Boolean) as SearchResult[];
        setNearby(items);
      } catch {
        setNearby([]);
      } finally {
        setNearbyLoading(false);
      }
    }, 600);
    return () => clearTimeout(debounce);
  }, [query, picked.lat, picked.lng]);

  // ---------- Reverse geocode ----------
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
        const parts = [p.name, p.street, p.city, p.country, p.postcode].filter(
          Boolean
        );
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

  // ---------- Browser geolocation ----------
  function requestGeolocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation gak disopati");
      return;
    }
    setGeoError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat2 = pos.coords.latitude;
        const lng2 = pos.coords.longitude;
        onChange(lat2, lng2);
        setReverseLabel("Lokasi kamu……");
      },
      (err) => {
        setLocating(false);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak"
            : "Gagal baca lokasi"
        );
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function pickResult(r: SearchResult) {
    onChange(r.lat, r.lng, r.display_name);
  }

  function pickPoint(lat: number, lng: number) {
    onChange(lat, lng);
    reverseGeocode(lat, lng);
  }

  const showingResults = query.trim() ? results : nearby;

  return (
    <div className="space-y-3">
      {/* Search bar + Geolocation */}
      <div className="flex gap-2">
        <div className="relative flex-1">
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
        <button
          type="button"
          onClick={requestGeolocation}
          disabled={locating}
          title="Pakai lokasi saya saat ini"
          aria-label="Pakai lokasi saya saat ini"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-cocoa-200 bg-cream-50 px-3 py-2 text-xs font-bold text-cocoa-700 transition hover:bg-cocoa-100 disabled:opacity-40"
        >
          {locating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Crosshair className="size-3.5" />
          )}
          Lokasi saya
        </button>
      </div>

      {geoError ? (
        <p className="px-1 text-[11px] text-berry-600">{geoError}</p>
      ) : null}

      {/* Hasil search ATAU Nearby */}
      {showingResults.length > 0 ? (
        <ul className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-cocoa-200 bg-cream-50 p-1.5">
          {showingResults.map((r, i) => {
            const Icon = categoryIcon(r.osm_key);
            const color = categoryColor(r.osm_key);
            return (
              <li key={`${r.lat}-${r.lng}-${i}`}>
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
                    {r.display_name.split(",").length > 1 ? (
                      <span className="line-clamp-1 text-[10px] text-cocoa-500">
                        {r.display_name.split(",").slice(1).join(",").trim()}
                      </span>
                    ) : null}
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
      ) : nearbyLoading ? (
        <p className="flex items-center gap-1.5 px-1 text-xs text-cocoa-400">
          <Loader2 className="size-3 animate-spin" />
          Cari tempat populer di sekitar…
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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> · <a href="https://photon.komoot.io">Photon</a> · <a href="https://overpass-api.de">Overpass</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickCapture onPick={pickPoint} />
          {/* Multi-marker: search results + nearby. */}
          {showingResults.map((r, i) =>
            r.lat === picked.lat && r.lng === picked.lng ? null : (
              <Marker
                key={`r-${i}-${r.lat}-${r.lng}`}
                position={[r.lat, r.lng]}
                icon={ResultIcon}
                eventHandlers={{
                  click: () => pickResult(r),
                }}
              />
            )
          )}
          <PrimaryMarker picked={picked} />
        </MapContainer>
      </div>

      <p className="px-1 text-[11px] text-cocoa-500">
        💡 Ketik POI / jalan di kolom atas (Starbucks, Vihara, dll). Atau klik
        <strong> Lokasi saya</strong> untuk pakai GPS kamu. Place di bawah
        adalah POI terdekat otomatis dari Overpass (basis OSM).
      </p>
    </div>
  );
}