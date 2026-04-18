import { useEffect, useState } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Application-level role values mirror the `app_role` enum in the database
export type AppRole = "admin" | "staff" | "client";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
}

// Centralized auth hook used by ProtectedRoute and any page that needs the user
export function useAuth(): AuthState & {
  isAdmin: boolean;
  isStaff: boolean;
  signOut: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    roles: [],
    loading: true,
  });

  useEffect(() => {
    // CRITICAL: register the auth-state listener FIRST so we never miss an event
    // that fires while we are still resolving the initial session.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((prev) => ({
        ...prev,
        user: session?.user ?? null,
        session,
        roles: prev.roles, // roles fetched separately below
        loading: false,
      }));
      if (session?.user) {
        // Defer the role fetch with a microtask so we never call Supabase
        // from inside the auth callback (recommended pattern).
        setTimeout(() => fetchRoles(session.user.id), 0);
      } else {
        setState((s) => ({ ...s, roles: [] }));
      }
    });

    // Then resolve the existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setState({
        user: session?.user ?? null,
        session,
        roles: [],
        loading: false,
      });
      if (session?.user) fetchRoles(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch which roles the user has (a single user can have multiple)
  const fetchRoles = async (userId: string) => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) {
      console.error("Failed to fetch roles", error);
      return;
    }
    setState((s) => ({ ...s, roles: (data ?? []).map((r) => r.role as AppRole) }));
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    ...state,
    isAdmin: state.roles.includes("admin"),
    isStaff: state.roles.includes("staff") || state.roles.includes("admin"),
    signOut,
  };
}
