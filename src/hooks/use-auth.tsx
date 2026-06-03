"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { WorkspaceRole } from "@/types";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string | null;
}

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** Re-fetch the current user's profile row — call after a save from
   *  the settings form so header/sidebar reflect the change without a
   *  full page reload. */
  refreshProfile: () => Promise<void>;
  /**
   * The user_id that owns the workspace this user operates in.
   * Equals user.id for workspace owners; equals the inviting owner's
   * user_id for team members. Use this for all workspace-scoped DB
   * queries instead of user.id.
   */
  ownerId: string | null;
  /** Role of the current user in the workspace. */
  memberRole: WorkspaceRole;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider — wrap this around the dashboard layout.
 * Makes ONE getSession() call for the whole tree instead of one per
 * component, avoiding internal lock contention in the Supabase client.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<WorkspaceRole>('owner');

  // Shared across init, auth-state-change listener, and the exposed
  // refreshProfile() callback. Reads the current session's user id and
  // pulls the matching profile row.
  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, avatar_url, role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error("[AuthProvider] fetchProfile error:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        return;
      }

      if (data) setProfile(data);
    } catch (err) {
      console.error("[AuthProvider] fetchProfile threw:", err);
    }
  }, []);

  /**
   * Resolve workspace ownership for the current user.
   * - If the user has a profiles row they are an owner (ownerId = userId).
   * - Otherwise look up team_members by email. If a pending invite is
   *   found, auto-accept it and link the member_user_id. Then set the
   *   ownerId to the inviting owner's user_id.
   */
  const resolveWorkspace = useCallback(async (userId: string, email: string) => {
    const supabase = createClient();
    try {
      // First check if this user is a workspace owner (has a profile).
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (profileRow) {
        // They are an owner — workspace is their own.
        setOwnerId(userId);
        setMemberRole('owner');
        return;
      }

      // Check for active membership.
      const { data: activeMembership } = await supabase
        .from("team_members")
        .select("owner_user_id, role")
        .eq("member_user_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (activeMembership) {
        setOwnerId(activeMembership.owner_user_id);
        setMemberRole(activeMembership.role as WorkspaceRole);
        return;
      }

      // Check for pending invite by email and auto-accept.
      const { data: pendingInvite } = await supabase
        .from("team_members")
        .select("id, owner_user_id, role")
        .eq("member_email", email)
        .eq("status", "pending")
        .maybeSingle();

      if (pendingInvite) {
        await supabase
          .from("team_members")
          .update({
            status: "active",
            member_user_id: userId,
            joined_at: new Date().toISOString(),
          })
          .eq("id", pendingInvite.id);

        setOwnerId(pendingInvite.owner_user_id);
        setMemberRole(pendingInvite.role as WorkspaceRole);
        return;
      }

      // Fallback — treat as owner (handles edge cases / first-time signup).
      setOwnerId(userId);
      setMemberRole('owner');
    } catch (err) {
      console.error("[AuthProvider] resolveWorkspace threw:", err);
      setOwnerId(userId);
      setMemberRole('owner');
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const safetyTimer = setTimeout(() => {
      if (mounted) {
        console.warn("[AuthProvider] getSession() timed out after 3s");
        setLoading(false);
      }
    }, 3000);

    const init = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) console.error("[AuthProvider] getSession error:", error.message);

        if (!mounted) return;
        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (currentUser) {
          // Don't block loading on profile fetch — let the UI render
          // with the user info we already have, profile enriches async.
          fetchProfile(currentUser.id);
          resolveWorkspace(currentUser.id, currentUser.email ?? "");
        }
      } catch (err) {
        console.error("[AuthProvider] init threw:", err);
      } finally {
        if (mounted) setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);

      if (currentUser) {
        fetchProfile(currentUser.id);
        resolveWorkspace(currentUser.id, currentUser.email ?? "");
      } else {
        setProfile(null);
        setOwnerId(null);
        setMemberRole('owner');
      }

      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    window.location.href = "/login";
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signOut, refreshProfile, ownerId, memberRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * useAuth — read the shared auth state from context.
 * Must be used inside an <AuthProvider>.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider (shouldn't
    // happen in normal flow, but don't crash the page).
    return {
      user: null,
      profile: null,
      loading: false,
      ownerId: null,
      memberRole: 'owner' as WorkspaceRole,
      signOut: async () => {
        window.location.href = "/login";
      },
      refreshProfile: async () => {},
    };
  }
  return ctx;
}
