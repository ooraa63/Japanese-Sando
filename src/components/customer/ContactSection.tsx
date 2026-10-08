import { AtSign, MapPin, MessageCircle, Clock } from "lucide-react";
import type { StoreSettings } from "@/lib/types";
import type { Dict } from "@/lib/i18n/en";
import { formatPhone, waLink } from "@/lib/utils";

/**
 * Blok "Hubungi kami" di /account — identitas toko (WA, IG, TikTok,
 * alamat, jam buka). Server component, render dari settings.
 */
/**
 * Daftar detail kontak (WA, IG, TikTok, alamat, jam buka).
 *
 * Dipisah dari `ContactSection` supaya isinya bisa dipakai ulang di popup
 * kontak (dokumen "Perbaikan Ruma Komugi 2", item 2): di halaman Akun,
 * menekan bar "Kontak" membuka popup kecil berisi daftar ini — bukan
 * pindah ke halaman /contact.
 *
 * Murni presentasional (tanpa state/hook) supaya aman dipanggil dari server
 * component DAN diteruskan sebagai `children` ke client component popup.
 */
export function ContactDetails({
  settings,
  dict,
  className = "mt-5 space-y-3",
}: {
  settings: StoreSettings | null;
  dict: Dict["account"]["contact"];
  className?: string;
}) {
  const whatsapp = settings?.whatsapp?.trim();
  const instagram = settings?.instagram?.trim();
  const tiktok = settings?.tiktok?.trim();
  const address = settings?.address?.trim();
  const mapsUrl = settings?.maps_url?.trim();
  const hoursId = settings?.hours_id?.trim();
  const hoursEn = settings?.hours_en?.trim();

  if (!(whatsapp || instagram || tiktok || address || hoursId || hoursEn)) {
    return null;
  }

  return (
    <ul className={className}>
        {whatsapp ? (
          <li className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-matcha-100 text-matcha-700">
              <MessageCircle className="size-4.5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cocoa-500">
                {dict.whatsapp}
              </p>
              <a
                href={waLink(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-cocoa-900 underline-offset-2 hover:underline"
                dir="ltr"
              >
                {formatPhone(whatsapp)}
              </a>
            </div>
          </li>
        ) : null}
        {instagram ? (
          <li className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-berry-100 text-berry-700">
              <AtSign className="size-4.5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cocoa-500">
                {dict.instagram}
              </p>
              <a
                href={`https://instagram.com/${instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-cocoa-900 underline-offset-2 hover:underline"
              >
                @{instagram.replace(/^@/, "")}
              </a>
            </div>
          </li>
        ) : null}
        {tiktok ? (
          <li className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-800 text-cream-50">
              <span className="font-display text-sm font-bold">T</span>
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cocoa-500">
                {dict.tiktok}
              </p>
              <a
                href={`https://tiktok.com/@${tiktok.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-cocoa-900 underline-offset-2 hover:underline"
              >
                @{tiktok.replace(/^@/, "")}
              </a>
            </div>
          </li>
        ) : null}
        {address ? (
          <li className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-honey-100 text-honey-700">
              <MapPin className="size-4.5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cocoa-500">
                {dict.address}
              </p>
              <p className="font-semibold text-cocoa-900">{address}</p>
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block text-xs font-bold text-matcha-700 underline-offset-2 hover:underline"
                >
                  {dict.openMaps} →
                </a>
              ) : null}
            </div>
          </li>
        ) : null}
        {(hoursId || hoursEn) ? (
          <li className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-cocoa-100 text-cocoa-700">
              <Clock className="size-4.5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cocoa-500">
                {dict.hours}
              </p>
              <p className="font-semibold text-cocoa-900">
                {hoursId || hoursEn}
              </p>
            </div>
          </li>
        ) : null}
    </ul>
  );
}

/**
 * Blok "Hubungi kami" di /account — identitas toko (WA, IG, TikTok,
 * alamat, jam buka). Server component, render dari settings.
 */
export function ContactSection({
  settings,
  dict,
}: {
  settings: StoreSettings | null;
  dict: Dict["account"]["contact"];
}) {
  const whatsapp = settings?.whatsapp?.trim();
  const instagram = settings?.instagram?.trim();
  const tiktok = settings?.tiktok?.trim();
  const address = settings?.address?.trim();
  const hoursId = settings?.hours_id?.trim();

  if (!(whatsapp || instagram || tiktok || address || hoursId)) return null;

  return (
    <section id="contact" className="card scroll-mt-20 p-6 sm:p-7">
      <h2 className="text-lg font-bold text-cocoa-900">{dict.title}</h2>
      <p className="mt-1 text-sm text-cocoa-500">{dict.subtitle}</p>
      <ContactDetails settings={settings} dict={dict} />
    </section>
  );
}