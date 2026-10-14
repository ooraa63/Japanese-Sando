/**
 * Redirect `/faq` -> `/profile-menu/faq`.
 *
 * Steven 14-10-2026: halaman-halaman info dikumpulkan di bawah Menu Profil.
 * URL lama tetap hidup sebagai redirect supaya link lama tidak mati.
 * Penjelasan lengkap ada di `src/app/contact/page.tsx`.
 */
import { redirect } from "next/navigation";

export default function LegacyFaqRedirect() {
  redirect("/profile-menu/faq");
}