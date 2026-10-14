"use client";

import Image from "next/image";
import { Gift, Sparkles } from "lucide-react";
import type { Bundle } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { PriceTag } from "./PriceTag";
import { useQuickAdd } from "./QuickAdd";

/**
 * Deretan kartu "Paket Hemat" di beranda.
 *
 * Ukuran kartu SENGAJA dibuat sama dengan section "Menu Baru" dan "Populer":
 * grid 3 kolom, foto persegi, nama 1 baris, harga di bawah (permintaan
 * Steven 12-10-2026 — "itu antara New, Bundle dan Popular beda ukuran, kita
 * samakan seperti yang popular aja, 1 baris bisa 3").
 *
 * Sebelumnya kartu bundle pakai layout besar sendiri (`aspect-[5/3]`,
 * `p-4`, `PriceTag size="lg"`), sementara "Menu Baru" pakai baris mendatar
 * `w-36` yang bisa di-scroll. Tiga section itu jadi kelihatan bedaUkuran.
 */
export function BundleShowcase({ bundles }: { bundles: Bundle[] }) {
  const { t } = useI18n();

  if (bundles.length === 0) return null;

  return (
    <section>
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-cocoa-500">
        <Gift className="size-4 text-berry-500" />
        {t.menu.bundlesTitle}
      </p>
      <ul className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {bundles.map((b) => (
          <li key={b.id} className="flex">
            <BundleCard bundle={b} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Kartu bundle. Bundle adalah item eksplisit yang penjual jual sendiri
 * (mis. "Bundle 2 Sando Sandwich = 35k"), jadi tampilannya mengikuti kartu
 * `FlavorCard` mode `dense` — bukan kartu besar.
 *
 * `w-full` + `shrink-0` pada foto wajib, sama seperti di `FlavorCard`:
 * `<li className="flex">` hanya meregangkan sumbu tegak, jadi tanpa `w-full`
 * lebar kartu ikut panjang teksnya dan grid terlihat tidak rata.
 */
function BundleCard({ bundle }: { bundle: Bundle }) {
  const { t, lang } = useI18n();
  const name = lang === "en" ? bundle.name_en : bundle.name_id;
  const desc = lang === "en" ? bundle.desc_en : bundle.desc_id;

  /* Steven 14-10-2026: "yang di home yang untuk bundle, favorite, intinya
     semua makanan ... saat kita tap, bisa popup untuk kita add to cart".

     Untuk paket, popup-nya adalah `OrderBundleModal` yang sudah ada — pembeli
     memilih isi paket (2 rasa untuk "Sando 2") lalu masuk ke keranjang. Popup
     itu dipasang sekali di `QuickAddProvider`, jadi kartu ini hanya membuka. */
  const quickAdd = useQuickAdd();

  return (
    <article
      role={quickAdd?.enabled ? "button" : undefined}
      tabIndex={quickAdd?.enabled ? 0 : undefined}
      onClick={() => quickAdd?.openBundle(bundle)}
      onKeyDown={(e) => {
        if (quickAdd?.enabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          quickAdd.openBundle(bundle);
        }
      }}
      className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-cocoa-200/70 bg-white transition hover:border-cocoa-300 ${
        quickAdd?.enabled ? "cursor-pointer active:scale-[0.99]" : ""
      }`}
    >
      <div className="bundle-photo relative aspect-square shrink-0 overflow-hidden bg-gradient-to-br from-honey-300 to-berry-500">
        {bundle.image_url ? (
          <Image
            src={bundle.image_url}
            alt={name}
            fill
            sizes="(max-width: 640px) 32vw, (max-width: 1024px) 22vw, 200px"
            className="object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-grain">
            <Gift className="size-10 text-white/50" />
          </div>
        )}

        {/* Badge pojo kiri atas, badge diskon kanan atas. Padding dan ukuran
            teks sengaja ramping supaya label tidak terpotong di kartu
            3 kolom yang cuma ~113px di HP. */}
        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-honey-400/95 px-1.5 py-0.5 text-[9px] leading-none font-bold text-cocoa-900 shadow">
          <Sparkles className="size-2.5 shrink-0" />
          <span className="truncate">{t.menu.bundleLabel}</span>
        </span>
        {bundle.compare_price != null &&
        bundle.compare_price > bundle.price ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center rounded-full bg-berry-500 px-1.5 py-0.5 text-[9px] leading-none font-bold text-white shadow tabular">
            −
            {Math.round(
              ((bundle.compare_price - bundle.price) / bundle.compare_price) * 100
            )}
            %
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-2">
        <p className="line-clamp-1 text-[11px] font-bold text-cocoa-900 sm:text-xs">
          {name}
        </p>
        <p className="bundle-desc mt-0.5 line-clamp-2 min-h-[1.9em] text-[10px] leading-snug text-cocoa-500">
          {desc ?? " "}
        </p>
        <div className="mt-auto pt-1.5">
          <PriceTag
            price={bundle.price}
            comparePrice={bundle.compare_price}
            lang={lang}
            size="sm"
            className="text-honey-600"
          />
        </div>
      </div>
    </article>
  );
}