"use client";

import { useState } from "react";
import { MapPin, Store } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DeliveryZonesClient } from "./DeliveryZonesClient";

type Tab = "pickup" | "delivery";

/**
 * Halaman admin "Catatan Pengambilan & Pengiriman" (item 10 dokumen
 * "Perbaikan Ruma Komugi 2").
 *
 * Steven: "Yang zona ini masuk ke menu catatan pengambilan dan pengiriman"
 * "...saya mau ada 2 bar. 1. Ambil di toko dan nanti kita bisa buat zona
 * dimana toko kita, dan ada catatan juga jadi tau ambil jam berapa.
 * 2. Pengantaran, nah sama juga bisa buat zona pengiriman".
 *
 * Dua tab, satu sumber data (`delivery_zones` yang sudah dibedakan kolom
 * `kind`-nya) — jadi tidak ada duplikasi tabel.
 */
export function PickupDeliveryTabs() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("pickup");

  const tabs: { id: Tab; label: string; icon: typeof Store }[] = [
    {
      id: "pickup",
      label: t.admin.deliveryZones.pickupTitle,
      icon: Store,
    },
    {
      id: "delivery",
      label: t.admin.deliveryZones.deliveryTitle,
      icon: MapPin,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Tab nav — sticky di HP supaya gampang pindah, sama seperti tab
          Pengaturan. */}
      <nav aria-label="Pickup & delivery sections">
        <div className="flex gap-1 border-b border-cocoa-200">
          {tabs.map((it) => {
            const active = tab === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => setTab(it.id)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition ${
                  active
                    ? "border-cocoa-900 text-cocoa-900"
                    : "border-transparent text-cocoa-400 hover:text-cocoa-700"
                }`}
              >
                <it.icon className="size-4" />
                {it.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* `key` memaksa state internal (draft form) di-reset tiap pindah tab,
          supaya form yang setengah terisi tidak "bocor" ke tab lain. */}
      <DeliveryZonesClient key={tab} kindFilter={tab} />
    </div>
  );
}