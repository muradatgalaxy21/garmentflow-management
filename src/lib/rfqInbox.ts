// RFQ Inbox queue: status filter, search and sort (pure, tested in src/test/rfq-inbox.test.ts).

export type RfqStatus = "new" | "contacted" | "quoted" | "won" | "lost";
export type RfqFilter = RfqStatus | "needs" | "all";
export type RfqSort = "newest" | "oldest";

export const RFQ_STATUSES: RfqStatus[] = ["new", "contacted", "quoted", "won", "lost"];

/** Default view: requests we still owe a reply on. */
export const NEEDS_RESPONSE: RfqStatus[] = ["new", "contacted"];

export const RFQ_STATUS_HELP: Record<RfqStatus, string> = {
  new: "Just arrived, nobody has replied.",
  contacted: "We replied, gathering details.",
  quoted: "Price sent, waiting on client.",
  won: "Client accepted, convert to an order.",
  lost: "Client declined or went silent; closed, kept for reference.",
};

export interface RfqLike {
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  product_type: string | null;
  message: string;
  status: RfqStatus;
  created_at: string;
}

export function matchesFilter(r: RfqLike, filter: RfqFilter): boolean {
  if (filter === "all") return true;
  if (filter === "needs") return NEEDS_RESPONSE.includes(r.status);
  return r.status === filter;
}

export function matchesSearch(r: RfqLike, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [r.name, r.email, r.company, r.phone, r.product_type, r.message]
    .some((v) => v?.toLowerCase().includes(needle));
}

export function filterRfqs<T extends RfqLike>(rows: T[], filter: RfqFilter, q: string, sort: RfqSort): T[] {
  const dir = sort === "oldest" ? 1 : -1;
  return rows
    .filter((r) => matchesFilter(r, filter) && matchesSearch(r, q))
    .sort((a, b) => dir * (Date.parse(a.created_at) - Date.parse(b.created_at)));
}
