// Perbaikan: kelas posisi vertikal WA harus ditulis LITERAL.
//
// Kalau ditulis lewat interpolasi template (`bottom-[calc(${X}px+...)]`),
// Tailwind memindai TEKS SUMBER, bukan hasil evaluasinya — jadi kelas itu tidak
// pernah ditemukan dan tidak ada CSS yang dibuat. Akibatnya `bottom:auto`,
// tombol `fixed` jatuh ke posisi statisnya (akhir halaman) dan terlihat
// melayang di tengah konten. Terverifikasi lewat `scripts/ukur.mjs`:
//   sebelum  waFab.top = 2054 (= tinggi dokumen), bukan 900-24-56 = 820.
import { patchFile } from "./_patch.mjs";

const edits = [
  [
    `/** Tinggi \`MobileBottomNav\` + jarak aman, dalam px. */
const NAV_BAWAH = 68;
/** Tinggi \`CartDock\` di \`/order\` (HP) + jarak aman, dalam px. */
const DOCK_KERANJANG = 88;`,
    `/* Tinggi \`MobileBottomNav\` + jarak aman. PENTING: nilai px ditulis LANGSUNG
   di dalam nama kelas, bukan disisipkan lewat template literal. Tailwind
   memindai teks sumber, jadi kelas yang berisi \${...} tidak pernah jadi CSS. */
const NAV_BAWAH = "bottom-[calc(68px+env(safe-area-inset-bottom))]";
/* Tinggi \`CartDock\` di \`/order\` (HP) + jarak aman, juga ditulis literal. */
const DOCK_KERANJANG = "bottom-[calc(88px+env(safe-area-inset-bottom))]";`,
  ],
  [
    `  let posisi: string;
  if (adaDockKeranjang) {
    posisi = \`bottom-[calc(\${DOCK_KERANJANG}px+env(safe-area-inset-bottom))]\`;
  } else if (adaNavBawah) {
    posisi = \`bottom-[calc(\${NAV_BAWAH}px+env(safe-area-inset-bottom))]\`;
  } else {
    posisi = "bottom-4 md:bottom-6";
  }`,
    `  const posisi = adaDockKeranjang
    ? DOCK_KERANJANG
    : adaNavBawah
      ? NAV_BAWAH
      : "bottom-4 md:bottom-6";`,
  ],
];

console.log("OK  " + JSON.stringify(patchFile("src/components/customer/WhatsAppFab.tsx", edits)));