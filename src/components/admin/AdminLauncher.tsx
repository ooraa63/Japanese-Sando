import Link from "next/link";
import { CheckCircle2, Store } from "lucide-react";
import { ADMIN_APPS, type AdminAppId, type AdminSectionId } from "@/lib/admin-nav";

export type ChipTone = "amber" | "berry" | "matcha";

export interface LauncherChip {
  tone: ChipTone;
  text: string;
  href: string;
}

/** Label aplikasi, dikirim dari server supaya sidebar dan launcher sama. */
export type AppLabels = Record<AdminAppId, string>;
/** Label bagian di dalam aplikasi. */
export type SectionLabels = Record<AdminSectionId, string>;

/**
 * Warna chip. `bg-*-500/10` + teks berwarna, bukan blok warna solid —
 * supaya warnanya tetap halus dan tidak terlalu berat di layar.
 */
const TONE: Record<ChipTone, string> = {
  amber: "border-honey-500/40 bg-honey-500/10 text-honey-700",
  berry: "border-berry-500/40 bg-berry-500/10 text-berry-600",
  matcha: "border-matcha-500/40 bg-matcha-500/10 text-matcha-700",
};

const TONE_DOT: Record<ChipTone, string> = {
  amber: "bg-honey-500",
  berry: "bg-berry-500",
  matcha: "bg-matcha-500",
};

/**
 * Layar awal admin: salam, deretan peringatan yang perlu segera ditangani,
 * lalu lempeng aplikasi.
 *
 * Steven 17-10-2026 (gambar 1): "ada mekanisme seperti gambar 1 sebagai
 * tampilan awal lalu saat klik jadi seperti gambar 2". Gambar 1 dipakai
 * sebagai acuan STRUKTUR (salam -> peringatan -> pilihan aplikasi), bukan
 * warnanya: lempeng di sini memakai palet toko (matcha, kokoa, honey, berry)
 * supaya tidak terlihat mencolok seperti pelangi di gambar acuan.
 */
export function AdminLauncher({
  greeting,
  fullName,
  today,
  chips,
  allOkText,
  appLabels,
  sectionLabels,
}: {
  greeting: string;
  /** Tanggal hari ini versi WIB, sudah diformat di server. */
  today: string;
  /** Nama tampilan admin. String kosong kalau admin tidak mengisinya. */
  fullName: string;
  chips: LauncherChip[];
  /** Ditampilkan kalau tidak ada satu pun peringatan. */
  allOkText: string;
  appLabels: AppLabels;
  sectionLabels: SectionLabels;
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* ---------- Salam ---------- */}
      <header className="space-y-1 text-center">
        <p className="text-sm font-semibold tracking-wide text-cocoa-400 uppercase">
          {today}
        </p>
        <h1 className="font-display text-3xl font-extrabold text-cocoa-900 sm:text-4xl">
          {greeting}
          {fullName ? ", " : ""}
          {fullName}
        </h1>
      </header>

      {/* ---------- Peringatan ---------- */}
      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {chips.map((c) => (
            <Link
              key={c.href + c.text}
              href={c.href}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-bold transition hover:brightness-95 ${TONE[c.tone]}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${TONE_DOT[c.tone]}`} />
              {c.text}
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-matcha-500/30 bg-matcha-500/10 px-3.5 py-1.5 text-sm font-bold text-matcha-700">
            <CheckCircle2 className="size-4" />
            {allOkText}
          </span>
        </div>
      )}

      {/* ---------- Lempeng aplikasi ---------- */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {ADMIN_APPS.map((app) => (
          <AppTile
            key={app.id}
            href={app.href}
            label={appLabels[app.id]}
            /* Nama-nama bagiannya, supaya jelas isinya apa saja sebelum diklik. */
            detail={[...new Set(app.items.map((i) => sectionLabels[i.section]))].join(" · ")}
            tile={app.tile}
            icon={app.icon}
          />
        ))}
      </div>
    </div>
  );
}

function AppTile({
  href,
  label,
  detail,
  tile,
  icon: Icon,
}: {
  href: string;
  label: string;
  detail: string;
  tile: string;
  icon: typeof Store;
}) {
  return (
    <Link
      href={href}
      className="card group flex flex-col items-center gap-2.5 p-4 text-center transition hover:-translate-y-0.5 hover:shadow-lg sm:p-5"
    >
      <span
        className={`grid size-14 place-items-center rounded-2xl bg-gradient-to-br ${tile} text-cream-50 shadow-md shadow-black/10 transition group-hover:scale-105 sm:size-16`}
      >
        <Icon className="size-7 sm:size-8" />
      </span>
      <span className="text-sm leading-tight font-extrabold text-cocoa-900 sm:text-base">
        {label}
      </span>
      <span className="text-[11px] leading-tight text-cocoa-400 sm:text-xs">{detail}</span>
    </Link>
  );
}