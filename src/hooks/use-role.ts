"use client";

import { useAuth } from "@/hooks/use-auth";
import type { WorkspaceRole } from "@/types";

/**
 * Convenience hook wrapping useAuth — returns the current user's
 * workspace role with boolean helpers.
 */
export function useRole() {
  const { memberRole, loading } = useAuth();

  return {
    role:     memberRole as WorkspaceRole,
    loading,
    isOwner:  memberRole === "owner",
    isAdmin:  memberRole === "admin" || memberRole === "owner",
    isAgent:  memberRole === "agent" || memberRole === "admin" || memberRole === "owner",
    isViewer: true, // everyone has at least viewer access
  };
}
