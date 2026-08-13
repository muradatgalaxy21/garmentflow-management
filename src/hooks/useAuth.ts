import { useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Application-level role values mirror the `app_role` enum in the database
export type AppRole = "admin" | "staff" | "client" | "worker" | "manager";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  clientActivated: boolean;
  loading: boolean;
}

// Centralized auth hook used by ProtectedRoute and any page that needs the user
export function useAuth(): AuthState & {
  isAdmin: boolean;
  isStaff: boolean;
  isWorker: boolean;
  isManager: boolean;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    roles: [],
    clientActivated: true,
    loading: true,
  });

  useEffect(() => {
    // CRITICAL: register the auth-state listener FIRST so we never miss an event
    // that fires while we are still resolving the initial session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Defer the role fetch with a microtask so we never call Supabase
        // from inside the auth callback (recommended pattern). Keep
        // loading=true until roles resolve too, so route guards checking
        // requireRoles never see a stale empty roles array.
        setTimeout(() => fetchRoles(session.user.id), 0);
        setState((prev) => ({ ...prev, user: session.user, session, roles: prev.roles }));
      } else {
        setState({ user: null, session: null, roles: [], clientActivated: true, loading: false });
      }
    });

    // Then resolve the existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setState((prev) => ({ ...prev, user: session.user, session }));
        fetchRoles(session.user.id);
      } else {
        setState({ user: null, session: null, roles: [], clientActivated: true, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch which roles the user has (a single user can have multiple), plus the
  // client-portal activation flag (plan.md §7) so ProtectedRoute can gate on it.
  const fetchRoles = async (userId: string) => {
    const [{ data: roleRows, error }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("client_activated").eq("id", userId).maybeSingle(),
    ]);
    if (error) {
      console.error("Failed to fetch roles", error);
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({
      ...s,
      roles: (roleRows ?? []).map((r) => r.role as AppRole),
      clientActivated: profile?.client_activated ?? true,
      loading: false,
    }));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    ...state,
    isAdmin: state.roles.includes("admin"),
    isStaff: state.roles.includes("staff") || state.roles.includes("admin"),
    isWorker: state.roles.includes("worker"),
    isManager: state.roles.includes("manager"),
    signOut,
  };
}
