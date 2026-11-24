// Mirrors the CHECK list on public.user_permissions
// (migration 20261124010000_permission_catalogue_v3.sql).
export const ACTIONS = ["view", "create", "update", "delete", "approve", "manage"] as const;
export type Action = (typeof ACTIONS)[number];
// Finance never hard-deletes ledger entries: its "delete" discards drafts and voids posted entries.
export const ACTION_LABELS: Record<Action, string> = { view: "View", create: "Add", update: "Edit", delete: "Delete / Void", approve: "Approve", manage: "Manage" };

// Only the actions that mean something for a section are offered.
export const SECTIONS = [
  { key: "rfqs", label: "RFQ Inbox", group: "Operations", actions: ["view", "update", "delete"] },
  { key: "inbox_workers", label: "Inbox: worker requests", group: "Operations", actions: ["view", "update"] },
  { key: "inbox_clients", label: "Inbox: client messages", group: "Operations", actions: ["view", "update"] },
  { key: "orders", label: "Orders", group: "Operations", actions: ["view", "create", "update", "delete"] },
  { key: "clients", label: "Clients", group: "Operations", actions: ["view", "create", "update"] },
  { key: "inventory", label: "Inventory", group: "Production", actions: ["view", "create", "update", "delete"] },
  { key: "batches", label: "Batches", group: "Production", actions: ["view", "create", "update", "delete"] },
  { key: "pipeline", label: "Pipeline Status", group: "Production", actions: ["view"] },
  { key: "dispatch", label: "Dispatch", group: "Production", actions: ["view", "create", "update", "delete"] },
  { key: "employees", label: "Employees", group: "People", actions: ["view", "create", "update", "delete"] },
  { key: "rates", label: "Piece & department rates", group: "Pay", actions: ["manage"] },
  { key: "payroll", label: "Payroll (salary, piece rate, payouts)", group: "Pay", actions: ["view", "manage"] },
  { key: "finance_vendors", label: "Finance: vendors", group: "Finance", actions: ["view", "create", "update", "delete"] },
  { key: "finance_purchases", label: "Finance: purchases & vendor payments", group: "Finance", actions: ["view", "create", "update", "delete", "approve"] },
  { key: "finance_receivables", label: "Finance: client payments", group: "Finance", actions: ["view", "create", "update", "delete", "approve"] },
  { key: "finance_expenses", label: "Finance: expenses", group: "Finance", actions: ["view", "create", "update", "delete", "approve"] },
  { key: "finance_reports", label: "Finance: reports (read all)", group: "Finance", actions: ["view"] },
] as const satisfies readonly { key: string; label: string; group: string; actions: readonly Action[] }[];

type Section = (typeof SECTIONS)[number];
type Exact = { [S in Section as S["key"]]: `${S["key"]}.${S["actions"][number]}` }[Section["key"]];
// "finance.X" / "inbox.X" = X in any finance area / either inbox (same alias as SQL has_any_permission).
export type Permission = Exact | `finance.${"view" | "create" | "update" | "delete" | "approve"}` | `inbox.${"view" | "update"}`;

export type FinanceTable = "vendors" | "vendor_bills" | "vendor_bill_items" | "vendor_payments" | "client_payments" | "expenses";
// Same map as SQL finance_area().
export const FINANCE_AREA = {
  vendors: "finance_vendors",
  vendor_bills: "finance_purchases",
  vendor_bill_items: "finance_purchases",
  vendor_payments: "finance_purchases",
  client_payments: "finance_receivables",
  expenses: "finance_expenses",
} as const satisfies Record<FinanceTable, string>;

// Admin passes; any action in a section implies its view; group aliases as above.
export function hasPermission(isAdmin: boolean, granted: string[], p: Permission): boolean {
  if (isAdmin) return true;
  const [section, action] = p.split(".");
  return granted.some((g) => {
    const [gs, ga] = g.split(".");
    const group = gs.replace(/^(finance|inbox)_.*$/, "$1");
    return (gs === section || group === section) && (ga === action || action === "view");
  });
}
