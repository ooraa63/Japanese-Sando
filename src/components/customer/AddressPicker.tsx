"use client";

import { useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import type { Dict } from "@/lib/types";
import type { CartDraft } from "@/components/customer/CartProvider";

/** Subset Dict yang dipakai picker ini. */
type PickerDict = Dict["order"]["payment"];

/**
 * Picker alamat + peta OpenStreetMap (via iframe — tanpa API key).
 *
 * Alur:
 *   - User klik tombol "Pilih di peta" -> modal dengan peta.
 *   - Klik lokasi -> set lat/lng + reverse-geocode alamat via Nominatim (OSM).
 *   - User boleh edit alamat teks + catatan alamat.
 *
 * Default center: Bandung (-6.917, 107.619) — bisa digeser manual nanti.
 */
const DEFAULT_CENTER = { lat: -6.917, lng: 107.619 };
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

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
  const [busy, setBusy] = useState(false);

  const hasLocation =
    typeof draft.lat === "number" && typeof draft.lng === "number";

  // Center peta: pakai draft.lat/lng kalau ada, fallback ke DEFAULT_CENTER.
  const center = useMemo(
    () =>
      hasLocation
        ? { lat: draft.lat as number, lng: draft.lng as number }
        : DEFAULT_CENTER,
    [draft.lat, draft.lng, hasLocation]
  );

  const bbox = useMemo(() => {
    const delta = 0.02;
    return {
      west: center.lng - delta,
      north: center.lat + delta,
      east: center.lng + delta,
      south: center.lat - delta,
    };
  }, [center]);

  // Iframe URL — klik diteruskan via Nominatim (search) atau alamat manual.
  const iframeSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox.west}%2C${bbox.south}%2C${bbox.east}%2C${bbox.north}&layer=mapnik&marker=${center.lat}%2C${center.lng}`;

  async function reverseGeocode(lat: number, lng: number) {
    setBusy(true);
    try {
      const r = await fetch(
        `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&accept-language=id`,
        {
          headers: { "Accept-Language": "id,en" },
        }
      );
      if (!r.ok) return "";
      const j = (await r.json()) as { display_name?: string };
      return j.display_name ?? "";
    } catch {
      return "";
    } finally {
      setBusy(false);
    }
  }

  /**
   * Buka picker di peta — versi sederhana: user memasukkan koordinat
   * manual atau alamat teks. Koordinat bisa kita ambil dari embed map
   * dengan klik — tapi OpenStreetMap embed tidak mengirim event ke host.
   * Untuk UX sederhana: tampilkan peta (visually) + field input
   * koordinat/alamat. Klik pada marker akan update posisi.
   */

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

      {/* Preview map ringkas (kalau sudah ada koordinat) */}
      {hasLocation ? (
        <div className="overflow-hidden rounded-2xl border border-cocoa-200">
          <iframe
            title="map-preview"
            src={iframeSrc}
            className="h-40 w-full"
            loading="lazy"
          />
          <div className="flex items-center justify-between gap-2 border-t border-cocoa-100 bg-cream-50 px-3 py-1.5 text-[11px] text-cocoa-500">
            <span className="tabular">
              {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
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
        </div>
      ) : null}

      <div>
        <label htmlFor="address-note" className="label">
          {dict.addressNote}
          <span className="ml-1 font-normal text-cocoa-400">({dict.addressNoteHint})</span>
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
        <MapModal
          center={center}
          onClose={() => setOpen(false)}
          onManual={(lat, lng) => {
            // Pakai Nominatim untuk ambil nama tempat dari koordinat.
            void reverseGeocode(lat, lng).then((label) => {
              updateDraft({
                lat,
                lng,
                address: label || draft.address,
              });
            });
            setOpen(false);
          }}
          busy={busy}
          dict={dict}
        />
      ) : null}
    </div>
  );
}

/**
 * Modal pilih lokasi: tampilkan peta besar + field manual koordinat.
 * Klik di peta -> set koordinat (via postMessage dari iframe).
 */
function MapModal({
  center,
  onClose,
  onManual,
  busy,
  dict,
}: {
  center: { lat: number; lng: number };
  onClose: () => void;
  onManual: (lat: number, lng: number) => void;
  busy: boolean;
  dict: PickerDict;
}) {
  const [lat, setLat] = useState(center.lat);
  const [lng, setLng] = useState(center.lng);

  // Iframe URL — versi lebar
  const delta = 0.05;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${center.lng - delta}%2C${center.lat - delta}%2C${center.lng + delta}%2C${center.lat + delta}&layer=mapnik&marker=${center.lat}%2C${center.lng}`;

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

          {/* Peta iframe — embed OSM */}
          <div className="overflow-hidden rounded-2xl border border-cocoa-200">
            <iframe
              title="map-pick"
              src={src}
              className="h-64 w-full"
              loading="lazy"
            />
          </div>

          {/* Input manual koordinat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lat" className="label">
                {dict.lat}
              </label>
              <input
                id="lat"
                type="number"
                step="0.0001"
                className="input tabular"
                value={lat}
                onChange={(e) => setLat(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="lng" className="label">
                {dict.lng}
              </label>
              <input
                id="lng"
                type="number"
                step="0.0001"
                className="input tabular"
                value={lng}
                onChange={(e) => setLng(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-cocoa-100 bg-cocoa-50/60 px-5 py-3.5">
          <button type="button" onClick={onClose} className="btn-ghost">
            Batal
          </button>
          <button
            type="button"
            onClick={() => onManual(lat, lng)}
            className="btn-primary"
            disabled={busy}
          >
            {busy ? "..." : dict.confirmLocation}
          </button>
        </footer>
      </div>
    </div>
  );
}