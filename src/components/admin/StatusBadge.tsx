import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "info" | "neutral" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  info: "border-info/30 bg-info/10 text-info",
  neutral: "border-border bg-muted text-neutral",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

// Every status stored across the admin pages -> tone + display text.
// Red ("danger") only for overdue; ended/negative states stay neutral.
export const STATUSES: Record<string, [Tone, string]> = {
  // RFQ
  new: ["info", "New"],
  contacted: ["info", "Contacted"],
  quoted: ["info", "Quoted"],
  won: ["success", "Won"],
  lost: ["neutral", "Lost"],
  // Orders
  pending: ["warning", "Pending"],
  in_production: ["info", "In production"],
  qc: ["info", "QC"],
  shipped: ["info", "Shipped"],
  delivered: ["success", "Delivered"],
  cancelled: ["neutral", "Cancelled"],
  // Batches / departments
  active: ["info", "Active"],
  in_progress: ["info", "In progress"],
  completed: ["success", "Completed"],
  open: ["info", "Open"],
  closed: ["neutral", "Closed"],
  // Bill / payment state
  paid: ["success", "Paid"],
  partial: ["warning", "Partly paid"],
  unpaid: ["neutral", "Unpaid"],
  overdue: ["danger", "Overdue"],
  void: ["neutral", "Void"],
  voided: ["neutral", "Voided"],
  credit_note: ["info", "Credit note"],
  // Finance lifecycle (bills, payments, receipts, expenses)
  draft: ["warning", "Draft"],
  posted: ["success", "Posted"],
  discarded: ["neutral", "Discarded"],
  reversal: ["info", "Reversal"],
  // Worker / client inbox
  accepted: ["success", "Accepted"],
  denied: ["neutral", "Denied"],
  reprocess: ["warning", "Reprocess"],
  resolved: ["success", "Resolved"],
  // Client passcodes
  unused: ["neutral", "Unused"],
  redeemed: ["success", "Redeemed"],
  revoked: ["neutral", "Revoked"],
};

const sentence = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * Text is always shown; color is never the only cue.
 *   <StatusBadge status="in_production" />
 *   <StatusBadge tone="warning" icon={Clock}>Due in 2 days</StatusBadge>
 */
export function StatusBadge({ status, tone, icon: Icon, children, className }: {
  status?: string;
  tone?: Tone;
  icon?: LucideIcon;
  children?: ReactNode;
  className?: string;
}) {
  const known = status ? STATUSES[status] : undefined;
  const t = tone ?? known?.[0] ?? "neutral";
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[t], className)}>
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      {children ?? known?.[1] ?? (status ? sentence(status) : null)}
    </span>
  );
}
