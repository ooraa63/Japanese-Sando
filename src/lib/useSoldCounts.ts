"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ambil counter terjual per rasa dari RPC publik.
 *
 * Satu panggilan untuk seluruh halaman — semua section yang butuh angka ini
 * menerima hasil yang sama. Kalau gagal, angka dianggap 0 (kotak selalu
 * tampil, tidak error, dan tidak pernah menampilkan angka karangan).
 *
 * Dipisah dari `AppHome` supaya section "Menu" di bawahnya (yang dirender
 * sebagai komponen terpisah, `MenuBrowser`) juga bisa memakai angka yang sama
 * tanpa mengambil ulang RPC-nya sendiri.
 */
export function useSoldCounts(): Record<number, number> {
  const [counts, setCounts] = useState<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.rpc("public_flavor_sold_counts");
        if (cancelled || !Array.isArray(data)) return;
        const m: Record<number, number> = {};
        for (const row of data as Array<{ flavor_id: number; qty: number }>) {
          m[Number(row.flavor_id)] = Number(row.qty) || 0;
        }
        setCounts(m);
      } catch {
        /* angka dianggap 0, bukan error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return counts;
}