"use client";

import Image from "next/image";
import { Flame, Heart, MessageSquare, Minus, PackageX, Plus, ShoppingBag, Sparkles, Star } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/components/customer/CartProvider";
import { useToast } from "@/components/ui/Toast";
import { useFlavorLikes } from "@/lib/useFlavorLikes";
import { PriceTag } from "./PriceTag";
import type { Flavor } from "@/lib/types";

/** Warna fallback per rasa, dipakai kalau produk belum punya foto. */
const GRADIENTS = [
  "from-[#3a2415] to-[#6b4423]",
  "from-[#f6e3c0] to-[#c98a3f]",
  "from-[#5f7a3a] to-[#9cbf6a]",
  "from-[#8c5a2b] to-[#d9a15b]",
  "from-[#f7d7dc] to-[#e06b7f]",
];

function gradientFor(slug: string) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function FlavorCard({
  flavor,
  inCart = 0,
  compact = false,
  /**
   * `dense` -> kartu ringkas ala gambar referensi: foto persegi, nama 1 baris,
   * baris "♥ suka / 🛍 terjual", lalu harga. Cukup kecil untuk 3 kartu dalam
   * satu baris di HP. Dipakai section "Menu" dan section "Favorite" di
   * beranda (keduanya punya tombol like), plus section "Menu Baru"
   * (dengan `readOnlySocial`, jadi yang di sana tidak bisa di-like).
   *
   * Bedanya hanya ini, sisanya komponen yang sama — jadi dua baris kartu itu
   * dijamin terlihat konsisten.
   */
  dense = false,
  /**
   * `showBadge` -> tampilkan badge bintang "Favorite" di foto produk.
   *
   * DEFAULT SEKARANG false (permintaan Steven, 12-10-2026 15:15): badge itu
   * dihapus dari kartu karena penandaan Favorite sekarang punya tempat sendiri
   * — section "Favorite" di beranda, tepat di bawah "Paket Hemat". Kalau
   * badge tetap menempel di tiap kartu, produk yang sama jadi punya dua
   * penanda di dua tempat dan yang di beranda terasa seperti duplikat.
   *
   * Propsi ini sengaja DIJAGA, bukan dihapus, supaya section yang memang
   * butuh label sendiri (mis. "New") bisa memintanya tanpa mengubah
   * default global lagi nanti.
   */
  showBadge = false,
  /**
   * Ganti teks badge di foto, misalnya "New" untuk section "Menu Baru".
   * Kalau diisi, label ini menggantikan "Favorite" — bukan menambah badge
   * kedua, supaya dua label di pojok yang sama tidak saling tumpang tindih.
   * `badgeLabel` selalu menang atas `showBadge`, jadi section "Menu Baru"
   * tidak perlu menyalakan `showBadge` hanya untuk mendapat badge.
   */
  badgeLabel = null,
  remainingStock = null,
  categoryName,
  /**
   * `selectable` -> kartu punya tombol +/- (dipakai di halaman /order).
   * Default false supaya kartu di beranda murni lihat-saja tanpa akses
   * ke keranjang.
   */
  selectable = false,
  soldCount = 0,
  showSocial = false,
  /**
   * `showStock` -> tampilkan baris sisa stok ("Tersedia 11" / "Tersisa 3" /
   * "Habis"). Dimatikan di beranda karena kurang relevan untuk pengunjung
   * yang belum mau pesan; sisa stok baru relevan di halaman /order.
   */
  showStock = true,
  /**
   * `showSold` -> tampilkan baris "N terjual" di bawah pil like.
   * Default false: kartu menu di beranda cukup menampilkan "N liked"
   * (gambar referensi Steven) — angka terjual sudah tampil di section
   * "Populer", jadi tidak perlu diulang dua kali di halaman yang sama.
   */
  showSold = false,
  /**
   * `readOnlySocial` -> tampilkan counter 'terjual' & status like, tapi
   * tombol like dinonaktifkan (untuk halaman pre-order yang hanya boleh
   * melihat).
   */
  readOnlySocial = false,
  /**
   * `storefront` -> kartu bergaya etalase ala UIUX 3: foto di atas, hati
   * pojok kanan atas, lalu baris bawah berisi harga di kiri dan tombol
   * tambah di kanan. Warna tetap coklat — yang diambil layout-nya.
   */
  storefront = false,
}: {
  flavor: Flavor;
  inCart?: number;
  compact?: boolean;
  /** Kartu ringkas 3-kolom (foto persegi + baris suka/terjual + harga). */
  dense?: boolean;
  /** Tampilkan badge bintang "Favorite" di foto. Default false (lihat catatan di atas). */
  showBadge?: boolean;
  /** Teks badge di foto; isi untuk menggantikan "Favorite" (mis. "New"). */
  badgeLabel?: string | null;
  /** Stok keseluruhan toko (bukan per rasa). null = tak terbatas. */
  remainingStock?: number | null;
  /** Nama kategori, ditampilkan sebagai label kecil di atas nama rasa. */
  categoryName?: string;
  selectable?: boolean;
  /** Jumlah pcs yang sudah terjual untuk rasa ini. */
  soldCount?: number;
  /** Tampilkan like heart + counter 'terjual' di kartu. */
  showSocial?: boolean;
  /** Tampilkan baris sisa stok. False di beranda, true di /order. */
  showStock?: boolean;
  /** Tampilkan baris "N terjual" di bawah pil like. Default false. */
  showSold?: boolean;
  /** Read-only: tampil tapi jangan izinkan like. */
  readOnlySocial?: boolean;
  /** Gaya etalase (UIUX 3) alih-alih kartu menu biasa. */
  storefront?: boolean;
}) {
  const { t, lang } = useI18n();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  // Steven 14-10-2026: `desc_id` / `desc_en` tidak lagi dirender di kartu
  // rasa. Kolomnya tetap dipakai untuk PENCARIAN (lihat MenuBrowser.tsx),
  // jadi data di database tidak hilang.
  const stockEnabled = remainingStock !== null && remainingStock !== undefined;
  const left = stockEnabled ? remainingStock : 0;
  // `is_active` bisa undefined kalau objek rasa datang dari public_menu()
  // (yang memang hanya mengirim rasa yang aktif). Unset berarti aktif.
  const isActive = flavor.is_active ?? true;
  const soldOut = !isActive || (stockEnabled && left <= 0);
  const low = stockEnabled && left > 0 && left <= 5;

  // Badge diskon di foto (kalau rasa ini punya harga coret).
  const discountPercent =
    flavor.compare_price != null &&
    Number.isFinite(flavor.compare_price) &&
    flavor.compare_price > flavor.price
      ? Math.round(
          ((flavor.compare_price - flavor.price) / flavor.compare_price) * 100
        )
      : null;

  // Like memakai store BERSAMA (`useFlavorLikes`) yang sama dengan kartu di
  // section "Populer". Kalau kartu ini punya state sendiri, menekan hati di
  // menu tidak akan membuat kartu Populer ikut berubah — dan dua kartu untuk
  // produk yang sama akan saling menimpa.
  const likes = useFlavorLikes();
  const isLiked = likes.isLiked(flavor.id);
  const likesCount = likes.count(flavor.id, flavor.likes_count ?? 0);
  const toggleLike = () => likes.toggle(flavor.id);

  /* ------------------------------------------------------------------
   * Gaya etalase (UIUX 3): foto di atas, hati pojok kanan atas, baris
   * bawah berisi harga + tombol tambah. Dipakai di halaman /order.
   *
   * `w-full` WAJIB di sini: kartu ini juga dibungkus `<li className="flex">`
   * di `OrderMenuBrowser`. Pada flex baris, `align-items: stretch` hanya
   * meregangkan sumbu tegak — tanpa `w-full` lebar kartu mengikuti isi
   * teksnya, sehingga kartu dengan deskripsi panjang lebih lebar dari yang
   * tidak punya deskripsi. Gejalanya persis seperti di kartu dense
   * (lihat catatan panjang di branch `dense` di bawah).
   * ------------------------------------------------------------------ */
  if (storefront) {
    return (
      <article
        className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white transition ${
          soldOut
            ? "border-cocoa-100 opacity-70"
            : "border-cocoa-200/70 hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10"
        }`}
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-cream-100">
          {flavor.image_url ? (
            <Image
              src={flavor.image_url}
              alt={name}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-grain">
              <span className="font-display text-5xl font-bold text-white/25 select-none">
                {name.charAt(0)}
              </span>
            </div>
          )}

          {/* Hati pojok kanan atas — penanda "disukai" ala referensi. */}
          {readOnlySocial ? (
            <span className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm">
              <Heart
                className={`size-4 text-berry-500 ${isLiked ? "fill-current" : ""}`}
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={toggleLike}
              aria-pressed={isLiked}
              aria-label={isLiked ? t.menu.likeRemove : t.menu.likeAdd}
              className="absolute top-2.5 right-2.5 grid size-8 place-items-center rounded-full bg-white/90 shadow-sm transition hover:bg-white active:scale-95"
            >
              <Heart
                className={`size-4 transition ${isLiked ? "fill-current text-berry-500" : "text-cocoa-400"}`}
              />
            </button>
          )}

          {soldOut ? (
            <div className="absolute inset-0 grid place-items-center bg-cocoa-950/65">
              <span className="chip bg-white text-cocoa-800 shadow-lg">
                <PackageX className="size-3.5" />
                {t.menu.soldOut}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-3.5">
          <h3 className="font-display text-sm leading-tight font-bold text-cocoa-900">
            {name}
          </h3>
          {/* Steven 14-10-2026: deskripsi rasa dihapus juga di varian kartu
              ringkas ini, sama seperti di kartu besar. */}

          {/* Baris info: jumlah like + jumlah terjual + sisa stok.
              Permintaan Steven (11-10-2026). Semuanya read-only di sini:
              pembeli menekan like di beranda (section "Menu"), bukan di
              halaman pemesanan.

              Letaknya DI ATAS harga, bukan di bawah tombol: di grid 4 kolom
              HP baris ini jadi bahan pembanding sebelum pembeli menekan
              "Add", sementara tombolnya selalu di paling bawah. */}
          <div className="mt-2 flex flex-col gap-1">
            {showSocial ? (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]">
                <span className="flex items-center gap-1 text-berry-500">
                  <Heart className="size-3.5 shrink-0 fill-current" />
                  <span className="font-bold tabular">{likesCount}</span>
                  <span className="text-cocoa-500">{t.menu.likesCount}</span>
                </span>
                {showSold ? (
                  <span className="flex items-center gap-1 text-cocoa-500">
                    <ShoppingBag className="size-3.5 shrink-0" />
                    <span className="font-bold text-cocoa-700 tabular">
                      {soldCount}
                    </span>
                    <span>{t.menu.soldCount}</span>
                  </span>
                ) : null}
              </div>
            ) : null}

            {showStock ? (
              <div className="flex h-4 items-center text-[11px] font-bold">
                {soldOut ? (
                  <span className="text-berry-500">
                    <PackageX className="mr-1 inline size-3" />
                    {t.menu.soldOut}
                  </span>
                ) : stockEnabled ? (
                  <span className={low ? "text-honey-500" : "text-matcha-600"}>
                    <Flame className="mr-1 inline size-3" />
                    {low
                      ? t.menu.lowStock.replace("{n}", String(left))
                      : t.menu.inStock.replace("{n}", String(left))}
                  </span>
                ) : (
                  <span className="text-matcha-600">
                    <Flame className="mr-1 inline size-3" />
                    {t.menu.unlimited}
                  </span>
                )}
              </div>
            ) : null}
          </div>

          {/* Baris bawah: harga di atas, tombol full-width di bawahnya.
              Di grid 4 kolom HP kartu ini sempit — kalau harga dan
              tombol dijejer horizontal, angkanya terpotong jadi
              "Rp 1..." (masalah yang pernah dilaporkan Steven). Jadi
              menumpuknya adalah pilihan sadar, bukan sekadar gaya. */}
          <div className="mt-auto flex flex-col gap-2 pt-3">
            <PriceTag
              price={flavor.price}
              comparePrice={flavor.compare_price}
              lang={lang}
              size="md"
            />
            {selectable ? (
              <StorefrontAction
                flavor={flavor}
                inCart={inCart}
                soldOut={soldOut}
                stockEnabled={stockEnabled}
                left={left}
                fullWidth
              />
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  /* ------------------------------------------------------------------
   * Kartu ringkas 3-kolom (referensi Steven, 10-10-2026).
   *
   * Dipakai di dua tempat dengan komponen yang sama supaya tidak melenceng:
   *   - section "Menu"      -> `readOnlySocial` = false, hati di pojok kanan
   *     atas adalah TOMBOL like.
   *   - section "Favorite"  -> `readOnlySocial` = false, juga TOMBOL like.
   *     Store-nya sama dengan section "Menu", jadi satu produk punya satu
   *     status suka yang konsisten di kedua tempat.
   *   - section "Menu Baru" -> `readOnlySocial` = true, hati hanya ikon
   *     penanda dan kartu tidak bisa diketuk sama sekali.
   *
   * Layout mengikuti gambar referensi: foto persegi, nama, baris
   * "♥ jumlah suka  🛍 jumlah terjual", lalu harga. Tanpa deskripsi —
   * di lebar ~110px (3 kolom di HP) deskripsi cuma jadi baris kecil yang
   * bikin kartu terlalu tinggi. Angka terjual selalu dari RPC publik
   * (`useSoldCounts`), tidak pernah dikarang.
   *
   * PENTING — `w-full` + `shrink-0` pada foto:
   *
   * - `w-full`: di section "Populer" setiap kartu dibungkus `<li class="flex">`.
   *   Pada flex baris, `align-items: stretch` hanya meregangkan sumbu TEGAK,
   *   bukan lebar. Tanpa `w-full` lebar kartu mengikuti isi teksnya
   *   (109px / 95px / 104px di HP) — inilah sebabnya "ukurannya tidak sama
   *   semua" dan celah antar kartu di PC terlihat kegedean.
   *   Di section "Menu" kartu jadi anak grid langsung (otomatis penuh), tapi
   *   `w-full` tidak merusak apa pun di sana.
   *
   * - `shrink-0` pada foto: kartu diregangkan ke tinggi baris grid. Tanpa
   *   ini flexbox memampatkan foto supaya muat, sehingga tinggi foto antar
   *   kartu berbeda padahal semuanya square.
   * ------------------------------------------------------------------ */
  if (dense) {
    return (
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-cocoa-200/70 bg-white transition hover:border-cocoa-300">
        <div
          className={`flavor-photo relative aspect-square shrink-0 overflow-hidden bg-gradient-to-br ${gradientFor(flavor.slug)}`}
        >
          {flavor.image_url ? (
            <Image
              src={flavor.image_url}
              alt={name}
              fill
              sizes="(max-width: 640px) 32vw, (max-width: 1024px) 22vw, 200px"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center bg-grain">
              <span className="font-display text-4xl font-bold text-white/30 select-none">
                {name.charAt(0)}
              </span>
            </div>
          )}

          <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-1.5">
            {/* Badge di pojok kiri atas. Teksnya "Favorite" untuk produk
                unggulan, atau `badgeLabel` (mis. "New") kalau pemanggil
                mengirimnya. Kalau label replacement ikut ada, produk ini
                tetap tidak butuh `is_featured` — jadi section "Menu Baru"
                bisa menandai produk apa pun tanpa menyentuh data produk.

                Class `chip` bawaan TIDAK dipakai: default-nya `px-3 py-1
                text-xs` terlalu lebar untuk kartu 3 kolom (~113px di HP)
                dan akibatnya kata label jadi terpotong. Teks 10px +
                padding ramping membuatnya utuh; `truncate` tetap dipakai
                sebagai jaring pengaman kalau labelnya nanti lebih panjang.

                Steven 12-10-2026 minta badge diperbesar "dikit aja" dari
                versi 9px, jadi naik ke 10px + ikon 12px. Jangan lebih besar
                dari itu: di kartu 3 kolom baris foto hanya ~111px, dan
                hati (size-7) memakan 28px + gap 4px, jadi sisa untuk badge
                cuma ~79px. Butuh lebar badge = teks + ikon + gap + padding
                horizontal; dengan `px-1.5` + `gap-0.5` totalnya ~66px, jadi
                "Favorite" muat utuh. Kalau padding dilonggarkan lagi, teks
                akan terpakai jadi "Favo...". */}
            {!soldOut && (badgeLabel || (showBadge && flavor.is_featured)) ? (
              <span className="inline-flex min-w-0 shrink items-center gap-0.5 rounded-full bg-honey-400/95 px-1.5 py-[3px] text-[10px] leading-none font-bold text-cocoa-900 shadow">
                {badgeLabel ? (
                  <Sparkles className="size-3 shrink-0" />
                ) : (
                  <Star className="size-3 shrink-0 fill-current" />
                )}
                <span className="truncate">{badgeLabel ?? t.menu.signature}</span>
              </span>
            ) : null}

            {/* Hati pojok kanan atas. Di section "Menu" dan "Favorite" ini tombol
                like; di section "Menu Baru" (`readOnlySocial`) hanya ikon
                penanda.

                `ml-auto` wajib: kalau kartu ini tidak punya badge apa pun di
                pojok kiri (kondisi normal sejak badge "Favorite" dihapus),
                taginya tidak ada dan tanpa `ml-auto` hati akan menempel ke
                kiri, bukan ke kanan. */}
            {readOnlySocial ? (
              <span
                aria-hidden
                className="ml-auto grid size-7 shrink-0 place-items-center rounded-full bg-white/90 shadow-sm"
              >
                <Heart
                  className={`size-3.5 ${isLiked ? "fill-berry-500 text-berry-500" : "text-cocoa-400"}`}
                />
              </span>
            ) : (
              <button
                type="button"
                onClick={toggleLike}
                aria-pressed={isLiked}
                aria-label={isLiked ? t.menu.likeRemove : t.menu.likeAdd}
                className="ml-auto grid size-7 shrink-0 place-items-center rounded-full bg-white/90 shadow-sm transition hover:bg-white active:scale-95"
              >
                <Heart
                  className={`size-3.5 transition ${isLiked ? "fill-berry-500 text-berry-500" : "text-cocoa-400"}`}
                />
              </button>
            )}
          </div>

          {soldOut ? (
            <div className="absolute inset-0 grid place-items-center bg-cocoa-950/65">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-white px-2 py-0.5 text-[10px] leading-none font-bold text-cocoa-800 shadow-lg">
                <PackageX className="size-3 shrink-0" />
                {t.menu.soldOut}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col p-2">
          <p className="line-clamp-1 text-[11px] font-bold text-cocoa-900 sm:text-xs">
            {name}
          </p>

          {/* Jumlah suka + jumlah terjual, keduanya angka nyata dari DB.
              Teks dipotong dengan `truncate`, bukan angka, supaya "1 terjual"
              tidak pernah berubah jadi "1 ter..." di kartu sempit. */}
          {showSocial ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold text-cocoa-500 tabular">
              <span className="flex shrink-0 items-center gap-0.5">
                <Heart className="size-3 fill-berry-400 text-berry-400" />
                {likesCount}
              </span>
              {showSold ? (
                <span className="flex min-w-0 items-center gap-0.5 text-cocoa-400">
                  <ShoppingBag className="size-3 shrink-0" />
                  <span className="truncate">
                    {soldCount} {t.menu.soldCount}
                  </span>
                </span>
              ) : null}
            </p>
          ) : null}

          {/* Harga di baris paling bawah. Harga asal dicoret + badge diskon
              (kalau ada) sudah ditangani PriceTag. */}
          <div className="mt-auto pt-1.5">
            <PriceTag
              price={flavor.price}
              comparePrice={flavor.compare_price}
              lang={lang}
              size="sm"
              className="text-honey-600"
            />
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------
   * Kartu menu di beranda (gambar referensi Steven, 10-10-2026):
   * foto tinggi, nama besar sans-serif, deskripsi, harga besar, lalu pil
   * "N liked" selebar kartu.
   *
   * Section "Menu" dan "Favorite" di beranda sama-sama punya tombol like,
   * dan keduanya membaca store `useFlavorLikes` yang sama, jadi satu
   * produk punya satu status suka yang konsisten di kedua tempat.
   * ------------------------------------------------------------------ */
  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition ${
        soldOut
          ? "border-cocoa-100 opacity-70"
          : "border-cocoa-200/70 hover:-translate-y-1 hover:border-cocoa-300 hover:shadow-xl hover:shadow-cocoa-900/10"
      }`}
    >
      {/* Foto / placeholder. Rasio dibuat lebih tinggi dari 4:3 supaya
          kartu terasa seperti "poster" produk ala referensi. */}
      <div
        className={`flavor-photo relative aspect-[4/5] overflow-hidden bg-gradient-to-br ${gradientFor(flavor.slug)}`}
      >
        {flavor.image_url ? (
          <Image
            src={flavor.image_url}
            alt={name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-grain">
            <span className="font-display text-6xl font-bold text-white/25 select-none">
              {name.charAt(0)}
            </span>
          </div>
        )}

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          {/* `showBadge` ikut dicek di sini, bukan cuma di kartu dense: kalau
              hanya dense yang hormat, badge masih muncul di kartu besar ini.
              Default `showBadge = false` membuat penandaan Favorite cuma ada
              di section "Favorite" di beranda. */}
          {showBadge && flavor.is_featured && !soldOut ? (
            <span className="chip bg-honey-400/95 text-cocoa-900 shadow">
              <Star className="size-3 fill-current" />
              {t.menu.signature}
            </span>
          ) : (
            <span />
          )}
          {/* Badge diskon (kalau ada) tetap nempel di foto; harga aslinya
              dipindah ke bawah gambar supaya tidak menutupi foto. */}
          {!soldOut && discountPercent !== null ? (
            <span className="chip bg-berry-500 text-white shadow tabular">
              −{discountPercent}%
            </span>
          ) : null}
        </div>

        {soldOut ? (
          <div className="absolute inset-0 grid place-items-center bg-cocoa-950/65">
            <span className="chip bg-white text-cocoa-800 shadow-lg">
              <PackageX className="size-3.5" />
              {t.menu.soldOut}
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {categoryName && !compact ? (
          <p className="mb-1 text-[10px] font-bold tracking-wide text-cocoa-300 uppercase">
            {categoryName}
          </p>
        ) : null}
        {/* Judul & deskripsi diberi tinggi minimum tetap supaya harga dan pil
            like selalu sejajar antar kartu — meskipun ada nama 1 baris
            dan ada 2 baris.

            PENTING: nama hanya boleh dirender SATU kali di sini. Sebelumnya
            ada <h3>{name}</h3> di dalam wrapper flex ini DAN lagi di blok
            min-h di bawahnya, jadi tiap kartu menampilkan nama rasa dua kali
            (lihat laporan Steven "namanya kedouble"). Wrapper flex sekarang
            hanya untuk menyejajarkan chip jumlah keranjang dengan judul. */}
        <div className="flex items-start justify-between gap-2">
          {!compact ? (
            <h3 className="font-display min-h-[2.6em] text-xl leading-tight font-bold text-cocoa-900">
              {name}
            </h3>
          ) : (
            <h3 className="font-display text-base leading-snug font-bold text-cocoa-900">
              {name}
            </h3>
          )}
          {selectable && inCart > 0 ? (
            <span className="chip shrink-0 bg-matcha-100 text-matcha-700">
              <ShoppingBag className="size-3" />
              {inCart}
            </span>
          ) : null}
        </div>

        {/* Steven 14-10-2026: "untuk description setiap menu (rasa) itu
            dihilangkan aja, ga perlu ada description".

            Deskripsi rasa DIHAPUS dari kartu. Efek sampingnya: kartu jadi
            jauh lebih pendek dan `min-h-[3.6em]` yang sebelumnya_areused
            untuk menyamakan tinggi kartu antar-rasa juga tidak perlu lagi —
            kartu sekarang setinggi isinya sendiri.

            Kolom `desc_id` / `desc_en` di database TIDAK dihapus dan tetap
            masih dipakai untuk PENCARIAN (lihat `MenuBrowser.tsx` — pencarian
            masih cocok kalau kata kunci ada di deskripsi). Jadi data lama
            tidak hilang, hanya tidak ditampilkan lagi. */}

        {/* Harga DI BAWAH foto — dibuat sebesar mungkin di kartu beranda
            supaya pembeli cepat lihat tanpa menebak dari chip kecil. */}
        <div className="mt-2">
          <PriceTag
            price={flavor.price}
            comparePrice={flavor.compare_price}
            lang={lang}
            size="xl"
          />
        </div>

        {/* Baris sisa stok. Di beranda disembunyikan (showStock=false) supaya
            pengunjung yang belum memutuskan tidak ikut melihat angka stok; di
            /order baru ditampilkan karena di situ baru relevan. */}
        {showStock ? (
          <div className="mt-1 flex h-4 items-center gap-1.5 text-[11px] font-bold">
            {soldOut ? (
              <span className="text-berry-500">
                <PackageX className="mr-1 inline size-3" />
                {t.menu.soldOut}
              </span>
            ) : stockEnabled ? (
              <span className={low ? "text-honey-500" : "text-matcha-600"}>
                <Flame className="mr-1 inline size-3" />
                {low
                  ? t.menu.lowStock.replace("{n}", String(left))
                  : t.menu.inStock.replace("{n}", String(left))}
              </span>
            ) : (
              <span className="text-matcha-600">
                <Flame className="mr-1 inline size-3" />
                {t.menu.unlimited}
              </span>
            )}
          </div>
        ) : null}

        {selectable ? (
          <div className="mt-auto pt-3">
            <FlavorCardStepper
              flavor={flavor}
              soldOut={soldOut}
              stockEnabled={stockEnabled}
              left={left}
            />
          </div>
        ) : null}

        {/* Baris 'disukai' (+ 'terjual' kalau diaktifkan).
            Perataan:
            1) Angka + tombol dipakai BARIS SENDIRI di bawah teks, bukan
               dijejak baris dengan `truncate` — di grid sempit angka
               "terjual"/"disukai" pernah terpotong jadi "0 ter...".
            2) "disukai" memakai logo hati, jadi jelas itu suka, bukan
               sekadar angka.
            Di /order dipakai `readOnlySocial` sehingga tombolnya hilang
            dan angka saja yang tampil — like hanya ada di beranda. */}
        {showSocial ? (
          <div className="flavor-social mt-3 flex shrink-0 flex-col gap-1.5 border-t border-cocoa-100 pt-3 text-[12px]">
            {readOnlySocial ? (
              <span className="flex items-center justify-center gap-1 text-berry-500">
                <Heart className="size-4 shrink-0 fill-current" />
                <span className="font-bold tabular">{likesCount}</span>
                <span className="text-cocoa-500">{t.menu.likesCount}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => toggleLike()}
                aria-pressed={isLiked}
                aria-label={isLiked ? t.menu.likeRemove : t.menu.likeAdd}
                className={`flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-bold transition active:scale-[0.98] ${
                  isLiked
                    ? "bg-berry-500 text-white"
                    : "bg-cocoa-100 text-cocoa-600 hover:bg-berry-500/15 hover:text-berry-600"
                }`}
              >
                <Heart
                  className={`size-4 shrink-0 ${isLiked ? "fill-current" : ""}`}
                />
                <span className="tabular">{likesCount}</span>
                <span>{t.menu.likesCount}</span>
              </button>
            )}
            {showSold ? (
              <span className="flex items-center justify-center gap-1 text-cocoa-500">
                <ShoppingBag className="size-4 shrink-0" />
                <span className="font-bold text-cocoa-700 tabular">{soldCount}</span>
                <span>{t.menu.soldCount}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * Tombol aksi ringkas untuk kartu etalase (UIUX 3).
 *
 * Kalau produk belum ada di keranjang: tombol "+ Tambah" selebar baris.
 * Kalau sudah ada: angka pcs + tombol tambah kecil, supaya qty bisa naik
 * tanpa membuka drawer, PLUS field catatan per item.
 *
 * Catatan ini sebelumnya HANYA ada di `FlavorCardStepper` (kartu besar),
 * sedangkan kartu etalase - yang justru dipakai halaman /order - tidak
 * punya apa pun. Akibatnya Steven tidak bisa menulis "jangan pakai cabe"
 * saat memilih rasa (12-10-2026: "saat pre-order tidak ada notenya saat
 * di pilih rasa"). Catatan di keranjang tetap bisa diedit lewat
 * `CartDrawer`, tapi memaksa pembeli keluar dari layar pilihan rasa.
 *
 * `useCart()` dipanggil di sini (bukan di FlavorCard) supaya kartu yang
 * hanya dilihat-saja tidak ikut memuat state keranjang.
 */
function StorefrontAction({
  flavor,
  inCart,
  soldOut,
  stockEnabled,
  left,
  fullWidth = false,
}: {
  flavor: Flavor;
  inCart: number;
  soldOut: boolean;
  stockEnabled: boolean;
  left: number;
  /** Tombol selebar kartu (default kartu etalase pakai true). */
  fullWidth?: boolean;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  // `inCart` dikirim induk sebagai nilai awal supaya kartu tetap benar
  // walau provider keranjang belum selesai memuat.
  const qty = cart.quantities[String(flavor.id)] ?? inCart ?? 0;
  const note = cart.notes[String(flavor.id)] ?? "";

  if (soldOut) {
    return (
      <button
        type="button"
        disabled
        className={`cursor-not-allowed rounded-xl border border-cocoa-200 bg-cocoa-50 px-3 py-2 text-[12px] font-bold whitespace-nowrap text-cocoa-400 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        {t.menu.unavailable}
      </button>
    );
  }

  if (qty > 0) {
    return (
      <div className="space-y-2">
        <div
          className={`flex items-center gap-1 ${fullWidth ? "w-full justify-between" : "shrink-0"}`}
        >
            <button
              type="button"
              onClick={() => cart.setQuantity(flavor.id, qty - 1)}
              aria-label={`-1 ${name}`}
              className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-matcha-500 bg-white text-matcha-600 transition hover:bg-matcha-50 active:scale-95"
            >
              <Minus className="size-4" />
            </button>
          <span className="min-w-6 flex-1 text-center font-display text-sm font-extrabold text-cocoa-900 tabular">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => {
              // Hormati sisa stok supaya langkah berikutnya tidak menambah
              // lebih dari yang dijual.
              //
              // PENTING: `left` itu SISA STOK kategori setelah SELURUH isi keranjang
              // dikurangi, bukan sisa per rasa. Jadi satu-satunya pertanyaan
              // sebelum boleh nambah adalah "masih ada sisa?", bukan
              // "berapa sisa?".
              //
              // Versi lama menulis `next > left` (jumlah rasa ini vs sisa
              // stok) dan itu salah dua arah:
              //   - stok 10, keranjang 5 rasa sama -> left 5, tambah jadi 6
              //     dicek 6 > 5 lalu DITOLAK, padahal 6 dari 10 masih aman.
              //     Steven sempat beberapa kali melihat ini sebagai "Maksimal 5 per rasa"
              //     padahal tidak ada plafon per rasa sama sekali;
              //   - saat left = 0, syarat `left > 0` gagal sehingga guard
              //     dilewati sepenuhnya dan pembeli bisa menambahkan melebihi
              //     stok.
              //
              // Backend tetap memvalidasi `insufficient_stock`; ini hanya
              // supaya UI tidak menjanjikan sesuatu yang tak Bisa dibayar.
              if (stockEnabled && left <= 0) {
                toast.warning(
                  name,
                  left === 0
                    ? t.order.menu.outOfStock
                    : t.order.menu.stockLeft.replace("{n}", String(left))
                );
                return;
              }
              cart.add(flavor);
            }}
            aria-label={`+1 ${name}`}
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-matcha-500 text-white transition hover:bg-matcha-600 active:scale-95"
          >
            <Plus className="size-4" />
          </button>
        </div>

        {/* Field catatan per item — mis. "jangan pakai cabe". Sengaja
            hanya muncul setelah qty > 0: saat produk belum dipilih, satu
            baris input kosong per kartu cuma bikin halaman pilihan terasa
            berat dan tidak ada yang akan mengisinya. */}
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-cocoa-400" />
          <input
            type="text"
            aria-label={`${t.menu.notePlaceholder} — ${name}`}
            placeholder={t.menu.notePlaceholder}
            value={note}
            onChange={(e) => cart.setNote(flavor.id, e.target.value)}
            maxLength={120}
            className="input !py-2 !pl-8 !pr-2 !text-[12px]"
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => cart.add(flavor)}
      className={`btn-primary !rounded-full !px-3.5 !py-2 text-[12px] whitespace-nowrap ${
        fullWidth ? "w-full" : "shrink-0"
      }`}
    >
      <Plus className="size-3.5" />
      {t.storefront.addShort}
    </button>
  );
}

/**
 * Stepper +/- untuk halaman /order. Dipisah supaya `useCart()` /
 * `useToast()` tidak terpanggil ketika kartu hanya untuk dilihat
 * (mis. di beranda).
 */
function FlavorCardStepper({
  flavor,
  soldOut,
  stockEnabled,
  left,
}: {
  flavor: Flavor;
  soldOut: boolean;
  stockEnabled: boolean;
  left: number;
}) {
  const { t, lang } = useI18n();
  const cart = useCart();
  const toast = useToast();
  const name = lang === "en" ? flavor.name_en : flavor.name_id;
  const qty = cart.quantities[String(flavor.id)] ?? 0;
  const note = cart.notes[String(flavor.id)] ?? "";

  if (soldOut) {
    return (
      <button
        type="button"
        disabled
        className="mt-3 w-full cursor-not-allowed rounded-xl border border-cocoa-200 bg-cocoa-50 py-2 text-[13px] font-bold whitespace-nowrap text-cocoa-400"
      >
        {t.menu.unavailable}
      </button>
    );
  }

  if (qty > 0) {
    return (
      <div className="mt-2 space-y-2">
        <div
          className="inline-flex w-full items-stretch overflow-hidden rounded-xl border-2 border-matcha-500 bg-white shadow-sm"
          role="group"
          aria-label={name}
        >
          <button
            type="button"
            onClick={() => cart.setQuantity(flavor.id, qty - 1)}
            aria-label={`-1 ${name}`}
            className="grid w-12 shrink-0 place-items-center text-matcha-600 transition hover:bg-matcha-50 active:scale-95"
          >
            <Minus className="size-4" />
          </button>
          <div className="flex flex-1 items-center justify-center font-display text-base font-extrabold text-cocoa-900 tabular">
            {qty}
          </div>
          <button
            type="button"
            onClick={() => {
              // Lihat catatan panjang di stepper kartu etalase: satu-satunya
              // syarat adalah "masih ada sisa stok kategori?".
              if (stockEnabled && left <= 0) {
                toast.warning(
                  name,
                  left === 0
                    ? t.order.menu.outOfStock
                    : t.order.menu.stockLeft.replace("{n}", String(left))
                );
                return;
              }
              cart.add(flavor);
            }}
            aria-label={`+1 ${name}`}
            className="grid w-12 shrink-0 place-items-center bg-matcha-500 text-white transition hover:bg-matcha-600 active:scale-95"
          >
            <Plus className="size-4" />
          </button>
        </div>
        {/* Field catatan per item — mis. "jangan pakai cabe". */}
        <div className="relative">
          <MessageSquare className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-cocoa-400" />
          <input
            type="text"
            placeholder={t.menu.notePlaceholder}
            value={note}
            onChange={(e) => cart.setNote(flavor.id, e.target.value)}
            maxLength={120}
            className="input !py-2 !pl-9 !text-[13px]"
          />
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        cart.add(flavor);
        // Toast removed — was interfering with the "Tambah ke keranjang" layer
        // when user clicks repeatedly. Cart drawer provides its own visual feedback.
      }}
      className="btn-primary mt-3 w-full !px-3 !py-2 text-[13px] whitespace-nowrap"
    >
      <Plus className="mr-1 inline size-3.5" />
      {t.menu.addToCart}
    </button>
  );
}
