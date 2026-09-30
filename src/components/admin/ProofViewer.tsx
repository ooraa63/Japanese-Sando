"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Download, ExternalLink, ImageOff, Loader2 } from "lucide-react";
import type { Order } from "@/lib/types";
import { useI18n } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";

/**
 * Melihat bukti transfer. Bucket-nya privat, jadi URL ditandatangani
 * sesaat lewat RLS yang hanya mengizinkan admin.
 */
export function ProofViewer({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  const { t } = useI18n();

  return (
    <Modal
      open={Boolean(order)}
      onClose={onClose}
      title={t.admin.orders.viewProof}
      size="lg"
      footer={null}
    >
      {order ? <ProofBody key={order.payment_proof_path ?? "none"} order={order} /> : null}
    </Modal>
  );
}

function ProofBody({ order }: { order: Order }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(order.payment_proof_path));

  useEffect(() => {
    if (!order.payment_proof_path) return;
    let cancelled = false;

    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(order.payment_proof_path as string, 60 * 10);

      if (cancelled) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setUrl(data.signedUrl);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [order.payment_proof_path]);

  if (!order.payment_proof_path) {
    return (
      <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-cocoa-400">
        <ImageOff className="size-6" />
        {t.admin.orders.noProof}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-12 text-sm text-cocoa-400">
        <Loader2 className="size-4 animate-spin" />
        {t.common.loading}
      </p>
    );
  }

  if (failed || !url) {
    return <p className="py-10 text-center text-sm text-berry-500">{t.errors.generic}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-xs break-all text-cocoa-400">{order.payment_proof_path}</p>
      <div className="relative overflow-hidden rounded-2xl border border-cocoa-200 bg-cocoa-50">
        <div className="relative aspect-[3/4] w-full sm:aspect-[4/3]">
          <Image
            src={url}
            alt={t.admin.orders.viewProof}
            fill
            sizes="(max-width: 640px) 100vw, 640px"
            className="object-contain"
            unoptimized
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={url}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline !py-2.5"
        >
          <Download className="size-4" />
          {t.admin.orders.downloadProof}
        </a>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-ghost !py-2.5"
        >
          <ExternalLink className="size-4" />
          {t.admin.orders.openProof}
        </a>
      </div>
    </div>
  );
}
