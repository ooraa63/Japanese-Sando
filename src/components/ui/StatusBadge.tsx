import type { OrderStatus } from "@/lib/types";

const STYLES: Record<OrderStatus, string> = {
  pending: "bg-honey-300/25 text-honey-500 ring-honey-400/40",
  accepted: "bg-blue-100 text-blue-700 ring-blue-300/50",
  ready: "bg-violet-100 text-violet-700 ring-violet-300/50",
  delivered: "bg-matcha-100 text-matcha-700 ring-matcha-300/60",
  rejected: "bg-berry-500/10 text-berry-600 ring-berry-500/30",
  cancelled: "bg-cocoa-100 text-cocoa-500 ring-cocoa-300/50",
};

const DOTS: Record<OrderStatus, string> = {
  pending: "bg-honey-400",
  accepted: "bg-blue-500",
  ready: "bg-violet-500",
  delivered: "bg-matcha-500",
  rejected: "bg-berry-500",
  cancelled: "bg-cocoa-400",
};

export function StatusBadge({
  status,
  label,
  size = "md",
}: {
  status: OrderStatus;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`chip ring-1 ring-inset ${STYLES[status]} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : ""
      }`}
    >
      <span className={`size-1.5 rounded-full ${DOTS[status]}`} aria-hidden />
      {label}
    </span>
  );
}
