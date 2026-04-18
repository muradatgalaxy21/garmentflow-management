import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  // If provided, the user must hold one of these roles to enter the route.
  // Omit for any-authenticated-user routes (e.g. client portal).
  requireRoles?: AppRole[];
}

// Wrapper component that gates a route by login state and (optionally) by role.
export default function ProtectedRoute({ children, requireRoles }: Props) {
  const { user, roles, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    // Send the user to the auth page and remember where they came from
    return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  }

  if (requireRoles && requireRoles.length > 0) {
    const allowed = requireRoles.some((r) => roles.includes(r));
    if (!allowed) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
