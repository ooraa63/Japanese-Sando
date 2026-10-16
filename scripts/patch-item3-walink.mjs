// Patch item 3: WhatsAppLink menerima atribut tambahan (dipakai `WhatsAppFab`
// untuk penanda `data-wa-fab`), dan komentar(usersinya) disesuaikan karena
// tombol WA di dalam rail keranjang serta di dalam dock sudah dihapus.
import { patchFile } from "./_patch.mjs";

const edits = [
  [
    `/**
 * Tombol WhatsApp — satu sumber untuk link-nya.
 *
 * Dipakai di tiga tempat:
 *  1. \`WhatsAppFab\` — tombol mengambang untuk halaman selain \`/order\`.
 *  2. \`CartDock\` — di dalam bar keranjang, di sisi kanan (Steven
 *     14-10-2026: "untuk fitur WA itu terlalu tinggi buat di kanan bawah";
 *     kalau bar keranjang sudah menempati dasar layar, satu-satunya cara
 *     WA tetap "di kanan bawah" TANPA menimpa isi keranjang adalah masuk
 *     ke dalam bar itu).
 *  3. Langkah tanggal + identitas di \`/order\`, yang belum punya bar
 *     keranjang — di sana tombolnya mengambang seperti biasa.
 *
 * Sengaja BUKAN \`<button>\`: ini link ke \`wa.me\`, jadi harus \`<a>\` supaya
 * bisa dibuka di tab baru dan tetap bekerja tanpa JavaScript.
 */`,
    `/**
 * Tombol WhatsApp — satu sumber untuk link-nya.
 *
 * Dipakai di \`WhatsAppFab\` (tombol mengambang pojok kanan bawah, semua
 * halaman pembeli) dan di beberapa panel \`OrderFlow\`. Sejak 16-10-2026 tidak
 * ada lagi tombol WA di dalam rail keranjang maupun di dalam dock keranjang:
 * Steven minta WA selalu di ujung kanan bawah, jadi hanya boleh ada satu.
 *
 * Sengaja BUKAN \`<button>\`: ini link ke \`wa.me\`, jadi harus \`<a>\` supaya
 * bisa dibuka di tab baru dan tetap bekerja tanpa JavaScript.
 */`,
  ],
  [
    `export function WhatsAppLink({
  whatsapp,
  className,
  compact = false,
}: {
  whatsapp: string;
  className?: string;
  /** \`true\` = bulatan (FAB mengambang), \`false\` = kotak rounded (di dalam bar). */
  compact?: boolean;
}) {`,
    `export function WhatsAppLink({
  whatsapp,
  className,
  compact = false,
  ...rest
}: {
  whatsapp: string;
  className?: string;
  /** \`true\` = bulatan (FAB mengambang), \`false\` = kotak rounded (di dalam bar). */
  compact?: boolean;
  /** Atribut tambahan untuk elemen \`<a>\`, mis. \`data-wa-fab\` untuk pengujian. */
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">) {`,
  ],
  [
    `    <a
      href={waLink(whatsapp, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.contact.whatsapp}
      className={`,
    `    <a
      {...rest}
      href={waLink(whatsapp, message)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.contact.whatsapp}
      className={`,
  ],
];

console.log("OK  " + JSON.stringify(patchFile("src/components/customer/WhatsAppLink.tsx", edits)));