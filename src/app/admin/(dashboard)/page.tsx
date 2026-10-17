import type { Metadata } from "next";
import { getSettings } from "@/lib/data";
import { getI18nDict, getLang } from "@/lib/i18n-server";
import { getCurrentAdmin } from "@/lib/supabase/server";
import { formatPickupDate } from "@/lib/utils";
import { hariIniWib, jamWib } from "@/lib/wib-time";
import {
  getDashboardStatsAction,
  getOrdersAction,
  getSettingsAction,
  listPoBatchesAction,
} from "@/app/admin/actions";
import { AdminLauncher, type LauncherChip } from "@/components/admin/AdminLauncher";
import { labelPerMenu } from "@/lib/admin-labels";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Beranda Admin", robots: { index: false, follow: false } };
}

/**
 * Semua tanggal "hari ini" di halaman ini dihitung dengan `hariIniWib()` dari
 * `src/lib/wib-time.ts`, bukan `new Date()` biasa — server Vercel berjalan di
 * UTC sedangkan toko di Bandung.
 */
export default async function AdminHomePage() {
  const [statsRes, ordersRes, batchesRes, settingsRes, publicSettings, dicts, admin, lang] =
    await Promise.all([
      getDashboardStatsAction(),
      getOrdersAction(null, "", 200, 0),
      listPoBatchesAction(),
      getSettingsAction(),
      getSettings(),
      getI18nDict(),
      getCurrentAdmin(),
      getLang(),
    ]);

  const L = dicts.admin.launcher;
  const hariIni = hariIniWib();
  const stats = statsRes.data;

  // --- Chip 1 & 2: pesanan yang perlu Steven tangani sekarang. -----------
  const chips: LauncherChip[] = [];

  const menunggu = stats?.pending_orders ?? 0;
  if (menunggu > 0) {
    chips.push({
      tone: "amber",
      text: dicts.admin.launcher.chips.pending.replace("{n}", String(menunggu)),
      href: "/admin/orders",
    });
  }

  /**
   * Pesanan yang tanggal ambangnya sudah lewat tapi belum diserahkan.
   *
   * Status `accepted` (sedang disiapkan) dan `ready` (siap diambil) adalah
   * dua-duanya masih milik toko. `pending` sengaja tidak dihitung: pesanan
   * yang belum dikonfirmasi belum punya janji ambil, dan chip "menunggu
   * persetujuan" di atas sudah menutup kasus itu.
   */
  const lewatAmbil = (ordersRes.data?.orders ?? []).filter(
    (o) =>
      (o.status === "accepted" || o.status === "ready") &&
      !!o.pickup_date &&
      o.pickup_date < hariIni,
  );
  if (lewatAmbil.length > 0) {
    chips.push({
      tone: "berry",
      text: dicts.admin.launcher.chips.pickupLate.replace("{n}", String(lewatAmbil.length)),
      href: "/admin/orders",
    });
  }

  // --- Chip 3: kondisi batch PO. ----------------------------------------
  const batches = batchesRes.data?.batches ?? [];
  const aktif = batches.filter((b) => b.is_active);
  const bisaDipesan = aktif.filter((b) => b.pickup_date >= hariIni);

  if (bisaDipesan.length > 0) {
    // Batch yang masih bisa dipesan tapi rantainya sudah dekat.
    const menutup = aktif.filter((b) => b.close_at <= hariIni);
    if (menutup.length > 0) {
      chips.push({
        tone: "amber",
        text: dicts.admin.launcher.chips.batchClosing,
        href: "/admin/po",
      });
    }
  } else {
    chips.push({
      tone: "berry",
      text: dicts.admin.launcher.chips.noBatch,
      href: "/admin/po",
    });
  }

  // --- Chip 4: pembeli belum bisa bayar kalau tidak ada metode. ----------
  /**
   * Bukan sekadar peringatan: kalau tidak ada rekening DAN QRIS mati, pembeli
   * tidak bisa menyelesaikan pesanan sama sekali — halaman checkout berhenti di
   * "Metode pembayaran belum diatur oleh penjual". Sudah kejadian sekali pada
   * 17-10-2026, jadi layak jadi chip.
   */
  const adaRekening = (settingsRes.data?.bank_accounts ?? []).some((b) => b.number.trim());
  const qrisAktif = !!publicSettings?.qris_enabled;
  if (!adaRekening && !qrisAktif) {
    chips.push({
      tone: "berry",
      text: L.chips.paymentOff,
      href: "/admin/settings?tab=payment",
    });
  }

  // --- Salam, berdasarkan jam WIB ----------------------------------------
  const jam = jamWib();
  const sapaan =
    jam < 11 ? L.greeting.morning : jam < 15 ? L.greeting.noon : jam < 18 ? L.greeting.afternoon : L.greeting.evening;

  return (
    <AdminLauncher
      greeting={sapaan}
      fullName={admin?.full_name ?? ""}
      today={formatPickupDate(`${hariIni}T00:00:00Z`, lang)}
      chips={chips}
      allOkText={L.chips.allOk}
      appLabels={dicts.admin.apps}
      sectionLabels={dicts.admin.sections}
      itemLabels={labelPerMenu(dicts)}
    />
  );
}