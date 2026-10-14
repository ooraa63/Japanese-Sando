/**
 * Redirect halaman lama -> halaman baru di bawah `/profile-menu`.
 *
 * Steven 14-10-2026 (gambar 1): FAQ, Syarat & Ketentuan, dan halaman info
 * lain TIDAK lagi jadi halaman terpisah di level atas — semuanya dikumpulkan
 * di bawah Menu Profil, jadi:
 *   /contact            -> /profile-menu/contact
 *   /faq                -> /profile-menu/faq
 *   /jam-buka           -> /profile-menu/jam-buka
 *   /syarat-ketentuan   -> /profile-menu/syarat-ketentuan
 *
 * URL lama tidak dihapus (jadi 404), tapi diarahkan. Alasannya: link yang
 * sudah dibagikan ke pembeli lewat WhatsApp atau hasil pencarian Google
 * harus tetap hidup. Menghapus route tanpa redirect = link mati.
 *
 * `permanent: false` (status 308, bukan 301) dipilih supaya halaman ini tidak
 * ikut di-cache browser selamanya — kalau nanti Steven memindahkan halaman
 * lagi, pembeli yang masih punya tab lama tetap sampai ke tujuan terbaru.
 */
import { redirect } from "next/navigation";

export default function LegacyContactRedirect() {
  redirect("/profile-menu/contact");
}