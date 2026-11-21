// Mirrors the CHECK list on public.user_permissions (plans/01-finance-and-permissions.md).
export const PERMISSIONS = [
  { key: "rfqs", label: "RFQ Inbox" },
  { key: "inbox", label: "Worker Inbox" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "batches", label: "Batches & Pipeline Status" },
  { key: "dispatch", label: "Dispatch" },
  { key: "employees", label: "Employees" },
  { key: "clients", label: "Clients" },
  { key: "finance.view", label: "Finance — view (dashboard, ledgers, reports)" },
  { key: "finance.edit", label: "Finance — edit (vendors, bills, payments, expenses)" },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

// Same rule as SQL has_permission(): admin passes, finance.edit implies finance.view.
export function hasPermission(isAdmin: boolean, granted: string[], p: Permission): boolean {
  if (isAdmin) return true;
  if (granted.includes(p)) return true;
  return p === "finance.view" && granted.includes("finance.edit");
}
