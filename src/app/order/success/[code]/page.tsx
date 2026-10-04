import { getSettings } from "@/lib/data";
import { SiteHeader } from "@/components/customer/SiteHeader";
import { SiteFooter } from "@/components/customer/SiteFooter";
import { SuccessClient } from "./SuccessClient";

export const dynamic = "force-dynamic";

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode);
  const [settings] = await Promise.all([getSettings()]);

  return (
    <>
      <SiteHeader
        storeName={settings?.store_name ?? "Rumakomugi"}
        logoUrl={settings?.logo_url ?? null}
        brandLine={settings?.brand_line ?? ""}
      />
      <SuccessClient settings={settings} code={code} />
      <SiteFooter settings={settings} />
    </>
  );
}