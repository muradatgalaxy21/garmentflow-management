import type { ReactNode } from "react";
import { ShieldOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import type { Permission } from "@/lib/permissions";

// Route-level gate inside the admin portal. UI only — real enforcement for
// finance data is RLS (has_permission); other sections still rely on role RLS.
export default function RequirePermission({ perm, children }: { perm: Permission; children: ReactNode }) {
  const { can, loading } = useAuth();
  if (loading) return null;
  if (!can(perm)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ShieldOff className="w-8 h-8 text-muted-foreground" />
        <h1 className="font-heading text-xl">No access</h1>
        <p className="text-muted-foreground max-w-sm text-sm">
          You don't have permission for this section. Ask an admin to grant it from the Employees page.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
