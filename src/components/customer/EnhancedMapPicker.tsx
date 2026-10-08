"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import {
  Building,
  Coffee,
  Crosshair,
  Loader2,
  Search,
  ShoppingBag,
  Trees,
  X,
} from "lucide-react";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
const MAPBOX_GEOCODE = "https://api.mapbox.com/geocoding/v5/mapbox.places";
const DEFAULT_CENTER: [number, number] = [107.619, -6.917]; // [lng, lat]
const DEFAULT_ZOOM = 13;

if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

/** Hasil search/geocode dari Mapbox Places API. */
export type SearchResult = {
  display_name: string;
  lat: number;
  lng: number;
  /** Mapbox `properties.category` (mis. "Coffee Shop", "Restaurant", "Mall").
   *  Dipakai buat icon + warna. */
  category?: string;
  /** Mapbox `place_type[0]` (mis. "poi", "address", "place", "neighborhood"). */
  type?: string;
  name?: string;
  street?: string;
  city?: string;
  country?: string;
  postcode?: string;
};

interface GeocodeFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  properties?: { category?: string; short_code?: string };
  place_type?: string[];
  context?: Array<{ text?: string; id?: string }>;
}

function categoryIcon(category?: string) {
  const c = (category ?? "").toLowerCase();
  if (
    c.includes("cafe") ||
    c.includes("coffee") ||
    c.includes("restaurant") ||
    c.includes("food")
  )
    return Coffee;
  if (
    c.includes("shop") ||
    c.includes("store") ||
    c.includes("mall") ||
    c.includes("grocery")
  )
    return ShoppingBag;
  if (c.includes("park") || c.includes("garden") || c.includes("recreation"))
    return Trees;
  return Building;
}

function categoryColor(category?: string): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("cafe") || c.includes("coffee") || c.includes("restaurant"))
    return "text-honey-500";
  if (c.includes("shop") || c.includes("store") || c.includes("mall"))
    return "text-berry-500";
  if (c.includes("park") || c.includes("garden")) return "text-matcha-600";
  return "text-cocoa-700";
}

/** Forward-geocode query (Starbucks, jalan, dsb). */
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
  // Bias ke POI (Starbucks, McD, dll) supaya cepat muncul. Address/neighborhood
  // tetap bisa muncul karena Mapbox nge-rank multi-type.
  url.searchParams.set("types", "poi,address,place,neighborhood,locality");
  if (proximity) {
    url.searchParams.set("proximity", `${proximity[0]},${proximity[1]}`);
  }
  const r = await fetch(url.toString());
  if (!r.ok) return [];
  const data = (await r.json()) as { features: GeocodeFeature[] };
  return data.features.map(featureToResult);
}

/** Reverse-geocode koordinat jadi label alamat. */
async function mapboxReverse(lng: number, lat: number): Promise<string> {
  if (!MAPBOX_TOKEN) return "";
  const url = new URL(`${MAPBOX_GEOCODE}/${lng},${lat}.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "id");
  const r = await fetch(url.toString());
  if (!r.ok) return "";
  const data = (await r.json()) as { features: GeocodeFeature[] };
  return data.features[0]?.place_name ?? "";
}

/** "Tempat populer di sekitar" — cafe, restaurant, mall, dll dalam 1.5km.
 *  Query-nya gabungan kategori supaya Mapbox balikin mix POI. */
async function mapboxNearbyPOIs(
  lng: number,
  lat: number
): Promise<SearchResult[]> {
  if (!MAPBOX_TOKEN) return [];
  const url = new URL(`${MAPBOX_GEOCODE}/cafe restaurant mall shop.json`);
  url.searchParams.set("access_token", MAPBOX_TOKEN);
  url.searchParams.set("types", "poi");
  url.searchParams.set("limit", "12");
  url.searchParams.set("language", "id");
  url.searchParams.set("country", "id");
  url.searchParams.set("proximity", `${lng},${lat}`);
  const r = await fetch(url.toString());
  if (!r.ok) return [];
  const data = (await r.json()) as { features: GeocodeFeature[] };
  return data.features.map(featureToResult);
}

function featureToResult(f: GeocodeFeature): SearchResult {
  const ctx = f.context ?? [];
  const findCtx = (prefix: string) =>
    ctx.find((c) => c.id?.startsWith(prefix))?.text;
  return {
    display_name: f.place_name,
    name: f.text,
    lat: f.center[1],
    lng: f.center[0],
    category: f.properties?.category,
    type: f.place_type?.[0],
    street: findCtx("street") || findCtx("address"),
    city:
      findCtx("place") ||
      findCtx("locality") ||
      findCtx("region") ||
      findCtx("district"),
    country: findCtx("country"),
    postcode: findCtx("postcode"),
  };
}

/**
 * Map picker kaya dengan Mapbox GL JS:
 *  - Geocoding API untuk search (POI + alamat, di-bias ke `proximity`).
 *  - Geocoding API reverse untuk label alamat saat user geser peta.
 *  - "Tempat populer di sekitar" — cafe/restaurant/mall dalam radius.
 *  - Browser geolocation untuk "📍 Lokasi saya".
 *  - Center pin (custom HTML marker) yang stay di tengah layar dan ngikut
 *    saat user pan/zoom — kordinat = `map.getCenter()`.
 *  - Result markers kecil untuk alternatif hasil search.
 *
 * Props:
 *  - lat/lng: koordinat saat ini (null = pakai default Bandung/Jakarta).
 *  - onChange(lat, lng, label?): callback saat titik berubah.
 *  - placeholder: search input placeholder.
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
    return { lat: DEFAULT_CENTER[1], lng: DEFAULT_CENTER[0] };
  }, [lat, lng]);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const resultMarkersRef = useRef<mapboxgl.Marker[]>([]);
  // Flag ini mencegah feedback loop: kalau onChange dipanggil dari moveend
  // yang dipicu flyTo programmatic, parent gak perlu dikabari lagi.
  const isProgrammaticRef = useRef(false);

  // ---------- Init map ----------
  useEffect(() => {
    if (!mapContainerRef.current || !MAPBOX_TOKEN) return;
    if (mapRef.current) return; // already initialized

    const initialCenter: [number, number] = [picked.lng, picked.lat];

    const m = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    });
    m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    m.on("load", () => {
      // First reverse-geocode untuk initial label
      void doReverse(initialCenter[0], initialCenter[1]);
    });

    // Saat user selesai nge-geser peta → koordinat = map.getCenter().
    m.on("moveend", () => {
      if (isProgrammaticRef.current) {
        isProgrammaticRef.current = false;
        return;
      }
      const c = m.getCenter();
      onChange(c.lat, c.lng);
      void doReverse(c.lng, c.lat);
    });

    // Klik di peta → flyTo titik itu. Tapi skip kalau yang diklik marker
    // hasil (handler marker sudah flyTo duluan).
    m.on("click", (e) => {
      const target = e.originalEvent.target as HTMLElement | null;
      if (target?.closest?.(".mapbox-result-marker")) return;
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
      resultMarkersRef.current = [];
    };
    // picked.lat/lng sebagai initial center; sengaja kosong dependencies
    // supaya map cuma di-init sekali.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Sync map center kalau lat/lng berubah dari luar (search/geolocation) ----------
  useEffect(() => {
    const m = mapRef.current;
    if (!m || lat == null || lng == null) return;
    const cur = m.getCenter();
    // Threshold ~10 meter biar gak flyTo kalau parent cuma emit onChange
    // dari moveend yang baru aja kita trigger.
    if (Math.abs(cur.lat - lat) > 0.0001 || Math.abs(cur.lng - lng) > 0.0001) {
      isProgrammaticRef.current = true;
      m.flyTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), 15), duration: 600 });
    }
  }, [lat, lng]);

  // ---------- Search ----------
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // Tidak perlu `setResults([])`: kedua tempat baca `results`
      // (marker effect & daftar hasil) sudah pakai `query.trim() ? results : nearby`,
      // jadi saat query kosong hasilnya memang tidak pernah dirender.
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const proximity: [number, number] = [picked.lng, picked.lat];
        const items = await mapboxGeocode(q, proximity);
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

  // ---------- Nearby POIs (muncul saat search box kosong) ----------
  useEffect(() => {
    if (query.trim()) {
      // Sama seperti `results`: `nearby` hanya dibaca saat query kosong,
      // jadi tidak perlu dikosongkan di sini.
      return;
    }
    const debounce = setTimeout(async () => {
      setNearbyLoading(true);
      try {
        const items = await mapboxNearbyPOIs(picked.lng, picked.lat);
        setNearby(items);
      } catch {
        setNearby([]);
      } finally {
        setNearbyLoading(false);
      }
    }, 600);
    return () => clearTimeout(debounce);
  }, [query, picked.lat, picked.lng]);

  // ---------- Render result markers di peta ----------
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    // Hapus marker lama
    for (const mk of resultMarkersRef.current) mk.remove();
    resultMarkersRef.current = [];

    const list = query.trim() ? results : nearby;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      // Skip kalau result-nya sama dgn koordinat picked (center pin udah di sana)
      if (r.lat === picked.lat && r.lng === picked.lng) continue;
      const el = document.createElement("div");
      el.className = "mapbox-result-marker";
      el.title = r.display_name;
      el.setAttribute("aria-label", r.display_name);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        pickResult(r);
      });
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([r.lng, r.lat])
        .addTo(m);
      resultMarkersRef.current.push(marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, nearby, query, picked.lat, picked.lng]);

  // ---------- Reverse geocode ----------
  async function doReverse(lng: number, lat: number) {
    setReverseLoading(true);
    try {
      const label = await mapboxReverse(lng, lat);
      if (label) setReverseLabel(label);
      else setReverseLabel(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
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
        isProgrammaticRef.current = true;
        mapRef.current?.flyTo({
          center: [lng2, lat2],
          zoom: 16,
          duration: 800,
        });
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
    isProgrammaticRef.current = true;
    mapRef.current?.flyTo({
      center: [r.lng, r.lat],
      zoom: Math.max(mapRef.current?.getZoom() ?? 15, 15),
      duration: 600,
    });
    onChange(r.lat, r.lng, r.display_name);
    setReverseLabel(r.display_name);
  }

  const showingResults = query.trim() ? results : nearby;

  // ---------- Guard: token belum di-set ----------
  if (!MAPBOX_TOKEN) {
    return (
      <div className="rounded-xl border border-berry-200 bg-berry-50 p-4 text-xs text-berry-700">
        <p className="font-bold">Mapbox token belum disetel</p>
        <p className="mt-1.5 leading-relaxed">
          Tambahkan{" "}
          <code className="rounded bg-berry-100 px-1 py-0.5 font-mono text-[11px]">
            NEXT_PUBLIC_MAPBOX_TOKEN
          </code>{" "}
          ke <code className="font-mono text-[11px]">.env.local</code> lalu
          restart dev server. Token publik gratis di{" "}
          <a
            href="https://account.mapbox.com/access-tokens/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            mapbox.com
          </a>{" "}
          (gak butuh kartu kredit).
        </p>
      </div>
    );
  }

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
            const Icon = categoryIcon(r.category);
            const color = categoryColor(r.category);
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
                    {r.type ?? "place"}
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

      {/* Peta Mapbox — center pin adalah child absolute, ngikut map center */}
      <div className="relative h-80 overflow-hidden rounded-xl border border-cocoa-200">
        <div ref={mapContainerRef} className="absolute inset-0" />

        {/* Center pin — anchor di tengah visual. Koordinat = map.getCenter(). */}
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
        💡 Ketik POI / jalan di kolom atas (Starbucks, Vihara, dll). Atau klik{" "}
        <strong>Lokasi saya</strong> untuk pakai GPS. Pin di tengah peta adalah
        titik yang akan dipilih — geser peta untuk pindahin.
      </p>
    </div>
  );
}
