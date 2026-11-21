// Mirrors the CHECK list on public.user_permissions
// (migration 20261121010000_granular_permissions.sql, plans/01-finance-and-permissions.md).
export const ACTIONS = ["view", "create", "update", "delete"] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_LABELS: Record<Action, string> = { view: "View", create: "Add", update: "Edit", delete: "Delete" };

// Only the actions that mean something for a section are offered.
export const SECTIONS = [
  { key: "rfqs", label: "RFQ Inbox", actions: ["view", "update", "delete"] },
  { key: "inbox", label: "Inbox (worker & client)", actions: ["view", "update"] },
  { key: "inventory", label: "Inventory", actions: ["view", "create", "update", "delete"] },
  { key: "orders", label: "Orders", actions: ["view", "create", "update", "delete"] },
  { key: "batches", label: "Batches & Pipeline", actions: ["view", "create", "update", "delete"] },
  { key: "dispatch", label: "Dispatch", actions: ["view", "create", "update", "delete"] },
  { key: "employees", label: "Employees", actions: ["view", "create", "update", "delete"] },
  { key: "clients", label: "Clients", actions: ["view", "create", "update"] },
  { key: "finance", label: "Finance", actions: ["view", "create", "update", "delete"] },
] as const satisfies readonly { key: string; label: string; actions: readonly Action[] }[];

type Section = (typeof SECTIONS)[number];
export type Permission = { [S in Section as S["key"]]: `${S["key"]}.${S["actions"][number]}` }[Section["key"]];

// Same rule as SQL has_any_permission(): admin passes; any action in a section implies its view.
export function hasPermission(isAdmin: boolean, granted: string[], p: Permission): boolean {
  if (isAdmin || granted.includes(p)) return true;
  const [section, action] = p.split(".");
  return action === "view" && granted.some((g) => g.startsWith(section + "."));
}
