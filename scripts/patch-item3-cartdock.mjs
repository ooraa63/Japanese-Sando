// Patch item 3: tombol WA di dalam dock keranjang dihapus.
//
// Alasannya Steven 16-10-2026 (gambar 3): "itu whatsappnya tetap harus di ujung
// kanan bawah". Kalau WA ikut pindah ke dalam dock, posisinya bukan lagi pojok
// kanan bawah. Sekarang WA hidup di `WhatsAppFab` saja, dan `WhatsAppFab`
// yang sudah tahu harus naik di atas dock keranjang di `/order`.
import { patchFile } from "./_patch.mjs";

const edits = [
  [
    `import { useCart } from "@/components/customer/CartProvider";
import { WhatsAppLink } from "@/components/customer/WhatsAppLink";
import { cartLinesFrom, cartSubtotal } from "@/lib/cart";`,
    `import { useCart } from "@/components/customer/CartProvider";
import { cartLinesFrom, cartSubtotal } from "@/lib/cart";`,
  ],
  [
    `  /** Teks saat keranjang kosong. */
  emptyText?: string;
  /** Nomor WhatsApp; tombolnya melayang DI ATAS dock, seperti sebelumnya. */
  whatsapp?: string | null;
  className?: string;
}) {`,
    `  /** Teks saat keranjang kosong. */
  emptyText?: string;
  className?: string;
}) {`,
  ],
  [
    `export function CartDock({
  flavors,
  onCheckout,
  checkoutLabel,
  emptyText,
  whatsapp,
  className = "",
}: {`,
    `export function CartDock({
  flavors,
  onCheckout,
  checkoutLabel,
  emptyText,
  className = "",
}: {`,
  ],
  [
    `        {/* WhatsApp melayang DI ATAS dock, rata kanan.
            PENTING: elemen ini harus di DALAM div \`fixed\` di atas. Div fixed
            menjadi containing block buat anak yang \`absolute\`, jadi
            \`bottom-full\` dihitung relatif terhadap dock dan tombolnya duduk
            benar di atasnya. Kalau dipindah keluar, \`absolute\` akan mencari
            leluhur yang positioned di halaman ini, dan hasilnya menimpa dock
            (terverifikasi lewat browser). */}
        {whatsapp && whatsapp.trim() ? (
          <div className="absolute right-3 bottom-full mb-2.5 lg:right-0">
            <WhatsAppLink whatsapp={whatsapp} compact />
          </div>
        ) : null}

        <button`,
    `        <button`,
  ],
];

console.log("OK  " + JSON.stringify(patchFile("src/components/customer/CartDock.tsx", edits)));