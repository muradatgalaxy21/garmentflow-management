import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// 1. Static Exact Route to Title mapping
const EXACT_ROUTE_TITLES: Record<string, string> = {
  // Main Website Frontend
  "/": "En En Garments - Premium Garment Manufacturing & Exports",
  "/about": "About Us - En En Garments",
  "/capabilities": "Capabilities - En En Garments",
  "/catalog": "Product Catalog - En En Garments",
  "/contact": "Contact & RFQ - En En Garments",
  "/auth": "Sign In & Register - En En Garments",
  "/activate-account": "Activate Account - Client Portal - En En Garments",
  "/system-access": "System Access - En En Garments",

  // Admin Portal
  "/admin": "Dashboard - Admin Portal - En En Garments",
  "/admin/rfqs": "RFQ Inbox - Admin Portal - En En Garments",
  "/admin/inbox": "Messages Inbox - Admin Portal - En En Garments",
  "/admin/inventory": "Inventory - Admin Portal - En En Garments",
  "/admin/orders": "Orders - Admin Portal - En En Garments",
  "/admin/batches": "Batches - Admin Portal - En En Garments",
  "/admin/pipeline-status": "Pipeline Status - Admin Portal - En En Garments",
  "/admin/dispatch": "Dispatch & Shipping - Admin Portal - En En Garments",
  "/admin/clients": "Clients Directory - Admin Portal - En En Garments",
  "/admin/employees": "Employees & Staff - Admin Portal - En En Garments",

  // Client Portal
  "/client-portal": "Overview - Client Portal - En En Garments",
  "/client-portal/orders": "My Orders - Client Portal - En En Garments",
  "/client-portal/direct-order": "Place Direct Order - Client Portal - En En Garments",
  "/client-portal/inbox": "Inbox - Client Portal - En En Garments",
  "/client-portal/profile": "My Profile - Client Portal - En En Garments",

  // Worker Side (Roman Urdu)
  "/factory": "Dashboard - Karkhana Floor - En En Garments",
  "/factory/log": "Kaam Ka Indraj - Karkhana Floor - En En Garments",
  "/factory/my-work": "Mera Kaam - Karkhana Floor - En En Garments",
  "/factory/inbox": "Inbox - Karkhana Floor - En En Garments",
  "/factory/restock-accessory": "Saman Mangwayen - Karkhana Floor - En En Garments",
};

// 2. Pattern Matching Rules for Dynamic/Parameterized Routes
const PATTERN_TITLES: Array<{ regex: RegExp; title: string }> = [
  // Admin parameterized routes
  { regex: /^\/admin\/employees\/[^/]+$/, title: "Worker Profile - Admin Portal - En En Garments" },

  // Client Portal parameterized routes
  { regex: /^\/client-portal\/orders\/[^/]+$/, title: "Order Details - Client Portal - En En Garments" },
];

/**
 * Resolves the browser tab title for a given pathname.
 */
export function getTitleForPath(pathname: string): string {
  // Normalize trailing slash (unless root path)
  const normalizedPath = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  // 1. Check exact match
  if (EXACT_ROUTE_TITLES[normalizedPath]) {
    return EXACT_ROUTE_TITLES[normalizedPath];
  }

  // 2. Check regex pattern matches
  for (const { regex, title } of PATTERN_TITLES) {
    if (regex.test(normalizedPath)) {
      return title;
    }
  }

  // 3. Fallbacks based on path prefixes
  if (normalizedPath.startsWith("/factory")) {
    return "Karkhana Floor - En En Garments";
  }
  if (normalizedPath.startsWith("/admin")) {
    return "Admin Portal - En En Garments";
  }
  if (normalizedPath.startsWith("/client-portal")) {
    return "Client Portal - En En Garments";
  }

  // 4. Default 404 Fallback
  return "Page Not Found - En En Garments";
}

/**
 * Component that automatically synchronizes the browser tab title
 * with the active React Router location on every page change.
 */
export default function TitleManager() {
  const location = useLocation();

  useEffect(() => {
    const title = getTitleForPath(location.pathname);
    document.title = title;
  }, [location.pathname]);

  return null;
}
