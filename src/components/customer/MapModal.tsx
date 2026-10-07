"use client";

import { X } from "lucide-react";
import dynamic from "next/dynamic";
import type { Dict } from "@/lib/types";
import {
  EnhancedMapPicker,
  type SearchResult,
} from "./EnhancedMapPicker";

const DEFAULT_CENTER = { lat: -6.917, lng: 107.619 };

/**
 * Modal pilih lokasi — full-screen di HP. Body modal render peta Enhanced
 * (Mapbox GL JS + Geocoding API) yang di-load secara dinamis karena
 * mapbox-gl butuh `window`.
 */
const InnerPicker = dynamic(
  () => import("./EnhancedMapPicker").then((m) => m.EnhancedMapPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-72 items-center justify-center bg-cocoa-50">
        <X className="size-5 animate-pulse text-cocoa-400" />
      </div>
    ),
  }
);

export function MapModal({
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
  dict: Dict["order"]["payment"];
}) {
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

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <p className="text-xs text-cocoa-500">{dict.pickOnMapHint}</p>
          <InnerPicker
            lat={center.lat}
            lng={center.lng}
            onChange={(lat, lng, label) => onPick(lat, lng, label ?? "")}
            placeholder={dict.searchPlaceholder ?? "Cari tempat, jalan, kota…"}
          />
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-cocoa-100 bg-cream-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost !px-4 !py-2 text-sm"
          >
            Batal
          </button>
        </footer>
      </div>
    </div>
  );
}

export { DEFAULT_CENTER, type SearchResult };
