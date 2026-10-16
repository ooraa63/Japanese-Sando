// Patch item 3 + 4 di OrderFlow.tsx (file CRLF, patch ditulis dengan LF).
//
// Item 3: tombol WhatsApp dihapus dari empat tempat supaya hanya ada satu,
//         yaitu `WhatsAppFab` di pojok kanan bawah.
//
// Item 4: rail keranjang desktop menempel di `top-6`, padahal header situs
//         `sticky top-0 h-16` (64px). Begitu halaman digulir, kepala rail
//         ("Your cart" + jumlah item) masuk ke bawah header dan terpotong
//         (gambar 4). Rail sekarang menempel DI BAWAH header.
import { patchFile } from "./_patch.mjs";

const edits = [
  /* ---- Item 4: offset sticky rail + batas tinggi supaya tidak menabrak WA ---- */
  [
    `              <aside data-cart-rail className="hidden lg:block lg:sticky lg:top-6">
                <div className="card flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden">`,
    `              {/* Steven 16-10-2026 (gambar 4): "saat scroll Your cart jadi
                  agak terpotong". Penyebabnya rail ini \`sticky top-6\` (24px)
                  padahal header situs \`sticky top-0 h-16\` (64px) — begitu
                  digulir, kepala rail tenggelam di bawah header dan judul
                  "Your cart" hilang. Rail sekarang menempel di 76px, yaitu
                  tinggi header + jarak 12px.
                  \`max-h\` dikurangi sampai 9rem supaya bagian bawah rail
                  berhenti sebelum tombol WhatsApp di pojok kanan bawah. */}
              <aside
                data-cart-rail
                className="hidden lg:sticky lg:top-[4.75rem] lg:block"
              >
                <div className="card flex max-h-[calc(100dvh-9rem)] flex-col overflow-hidden">`,
  ],

  /* ---- Item 3: WA di dalam rail dihapus ---- */
  [
    `                </div>

                {settings.whatsapp?.trim() ? (
                  <div className="mt-3 flex justify-center">
                    <WhatsAppLink whatsapp={settings.whatsapp} compact />
                  </div>
                ) : null}
              </aside>`,
    `                </div>
              </aside>`,
  ],

  /* ---- Item 3: dock tidak lagi menerima nomor WA ---- */
  [
    `                <CartDock
                  flavors={flavors}
                  emptyText={t.cart.emptyInOrder}
                  onCheckout={handleNext}
                  whatsapp={settings.whatsapp}
                />`,
    `                <CartDock
                  flavors={flavors}
                  emptyText={t.cart.emptyInOrder}
                  onCheckout={handleNext}
                />`,
  ],

  /* ---- Item 3: blok WA mengambang di akhir komponen dihapus ---- */
  [
    `      {/* Tombol WhatsApp untuk langkah yang TIDAK punya bar keranjang
          (tanggal, identitas, pembayaran, konfirmasi). Di langkah "Pilih
          Rasa" tombolnya sudah ada di dalam dock keranjang — dua-duanya
          tidak dirender sekaligus supaya tidak ada dua link WA yang sama
          di layar.

          \`bottom-4\` aman di sini karena \`MobileBottomNav\` menyembunyikan
          dirinya di \`/order\` dan bar keranjang hanya ada di langkah menu. */}
      {step !== "menu" && settings.whatsapp?.trim() ? (
        <WhatsAppLink
          whatsapp={settings.whatsapp}
          compact
          className="fixed right-4 bottom-4 z-40 grid size-14 place-items-center rounded-2xl bg-[#25D366] text-white shadow-lg shadow-black/25 transition hover:bg-[#1EBE5A] active:scale-95 md:right-6 md:bottom-6"
        />
      ) : null}

      <LocationPopup`,
    `      {/* Tombol WhatsApp TIDAK lagi dirender di halaman ini. Sejak
          16-10-2026 hanya ada satu tombol WA untuk semua halaman pembeli:
          \`WhatsAppFab\` di pojok kanan bawah (termasuk di \`/order\`, yang
          dulu menyembunyikannya). Dulu ada empat tempat sekaligus — dua panel
          \`early return\`, rail keranjang, dan dock keranjang — sehingga
          posisinya berbeda-beda tiap langkah. */}

      <LocationPopup`,
  ],

  /* ---- Item 3: WA di panel "toko tutup" ---- */
  [
    `          {/* Panel ini \`early return\`, jadi tombol WA harus ikut di sini —
              \`WhatsAppFab\` menyembunyikan dirinya di \`/order\` (dipakai
              dock keranjang di langkah menu). Tanpa ini pembeli tidak punya
              jalan chat sama sekali saat toko tutup. */}
          {settings.whatsapp?.trim() ? <WhatsAppLink whatsapp={settings.whatsapp} compact /> : null}
        </div>`,
    `          {/* Tombol WA tidak perlu dirender manual: \`WhatsAppFab\` sudah
              muncul di pojok kanan bawah, termasuk di \`/order\`. */}
        </div>`,
  ],

  /* ---- Item 3: WA di panel "belum ada batch" ---- */
  [
    `          {/* Sama seperti panel \`closed\` di atas: ini \`early return\`, jadi WA
              harus ikut dirender — \`WhatsAppFab\` tidak muncul di \`/order\`. */}
          {settings.whatsapp?.trim() ? <WhatsAppLink whatsapp={settings.whatsapp} compact /> : null}
        </div>`,
    `          {/* Sama seperti panel \`closed\` di atas: \`WhatsAppFab\` yang
              menanganinya, jadi tidak perlu tombol manual di sini. */}
        </div>`,
  ],
];

console.log("OK  " + JSON.stringify(patchFile("src/components/customer/OrderFlow.tsx", edits)));