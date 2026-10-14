import type { Metadata } from "next";
import { listAdminReviewsAction } from "@/app/admin/actions";
import { ReviewsClient } from "@/components/admin/ReviewsClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Ulasan Pembeli",
    robots: { index: false, follow: false },
  };
}

/**
 * Kelola ulasan pembeli.
 *
 * Steven 15-10-2026: "untuk admin buat bisa mengatur ulasan itu, jadi kalau ada
 * orang yang asal memberi ulasan bisa kita delete atau gimana gitu lah".
 *
 * Data diambil lewat RPC `admin_list_reviews`, bukan select langsung, supaya
 * aturan "hanya admin" ditegakkan di database — bukan cuma dengan menyembunyikan
 * menu di UI.
 */
export default async function AdminReviewsPage() {
  const res = await listAdminReviewsAction();

  // Kalau RPC gagal (mis. sesi admin sudah habis), tetap render halaman dengan
  // daftar kosong supaya dashboard tidak ikut blank. Aksi di dalam komponen
  // akan tetap menolak kalau bukan admin.
  if (!res.ok || !res.data) {
    return <ReviewsClient initialReviews={[]} initialCounts={{ total: 0, visible: 0, hidden: 0 }} />;
  }

  return (
    <ReviewsClient
      initialReviews={res.data.reviews}
      initialCounts={{
        total: res.data.total_count,
        visible: res.data.visible_count,
        hidden: res.data.hidden_count,
      }}
    />
  );
}