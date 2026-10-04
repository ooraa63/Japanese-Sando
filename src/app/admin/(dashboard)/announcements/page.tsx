import type { Metadata } from "next";
import { getAnnouncementsAction } from "@/app/admin/actions";
import { AnnouncementsClient } from "@/components/admin/AnnouncementsClient";
import { getI18nDict } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Announcements", robots: { index: false, follow: false } };
}

export default async function AdminAnnouncementsPage() {
  const [annsRes, dicts] = await Promise.all([
    getAnnouncementsAction(),
    getI18nDict(),
  ]);

  return (
    <AnnouncementsClient
      initial={annsRes.data ?? []}
      labels={{
        title: dicts.admin.announcements.title,
        subtitle: dicts.admin.announcements.subtitle,
        add: dicts.admin.announcements.add,
        edit: dicts.admin.announcements.edit,
        empty: dicts.admin.announcements.empty,
        name: dicts.admin.announcements.name,
        nameHint: dicts.admin.announcements.nameHint,
        body: dicts.admin.announcements.body,
        bodyHint: dicts.admin.announcements.bodyHint,
        image: dicts.admin.announcements.image,
        imageHint: dicts.admin.announcements.imageHint,
        ctaLabel: dicts.admin.announcements.ctaLabel,
        ctaHref: dicts.admin.announcements.ctaHref,
        sortOrder: dicts.admin.announcements.sortOrder,
        active: dicts.admin.announcements.active,
        saved: dicts.admin.announcements.saved,
        deleted: dicts.admin.announcements.deleted,
        confirmDelete: dicts.admin.announcements.confirmDelete,
        status: dicts.admin.announcements.status,
        activeLabel: dicts.admin.announcements.activeLabel,
        inactiveLabel: dicts.admin.announcements.inactiveLabel,
        preview: dicts.admin.announcements.preview,
      }}
    />
  );
}