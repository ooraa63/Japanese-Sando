/**
 * Nama toko fallback.
 *
 * Dipakai di mana-mana `store_settings` belum terisi atau gagal dimuat, supaya
 * judul tab, header, footer, dan halaman admin tidak pernah kosong.
 *
 * Steven 13-10-2026: nama resmi tokonya "Ruma Komugi", tapi nilai yang
 * dipatok di kode adalah SINGKATAN "RK" supaya pas di badge sempit dan judul
 * tab browser. Nilai DB (`store_settings.store_name`) yang dipakai kalau
 * datanya ada — konstanta ini hanya jaring pengaman.
 *
 * PENTING: ini satu-satunya tempat nama fallback ditulis. Sebelumnya ada 17
 * literal "Rumakomugi" yang tersebar di 16 file, dan hampir semuanya salah
 * ketik juga kalau nanti-brand-nya diganti lagi. Kalau butuh nama lain, ubah
 * HANYA baris di bawah — jangan menyisir literal per file.
 */
export const DEFAULT_STORE_NAME = "RK";