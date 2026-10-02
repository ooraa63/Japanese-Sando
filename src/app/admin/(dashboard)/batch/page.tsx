import type { Metadata } from "next";
import { getBatchesAction, getBatchSummaryAction } from "@/app/admin/actions";
import { BatchClient } from "@/components/admin/BatchClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Batch", robots: { index: false, follow: false } };
}

export default async function AdminBatchPage() {
  const batchesRes = await getBatchesAction();
  const batches = batchesRes.data ?? [];
  const openBatch = batches.find((b) => b.is_open) ?? batches[0] ?? null;

  const summaryRes = openBatch
    ? await getBatchSummaryAction(openBatch.id)
    : null;

  return (
    <BatchClient
      initialBatches={batches}
      initialSummary={summaryRes?.data ?? null}
      initialBatchId={openBatch?.id ?? null}
    />
  );
}
