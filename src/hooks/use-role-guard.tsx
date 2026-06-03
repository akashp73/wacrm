"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import type { WorkspaceRole } from "@/types";

const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  agent: 2,
  viewer: 1,
};

/**
 * Redirects to `redirectTo` if the current user's workspace role does
 * not meet `requiredRole`. "Meets" means the user's rank is >= the
 * required rank (owner > admin > agent > viewer).
 *
 * Call this at the top of any page component that should be gated.
 *
 * @param requiredRole  Minimum role required to view the page.
 * @param redirectTo    Where to send unauthorized users (default /dashboard).
 */
export function useRoleGuard(
  requiredRole: WorkspaceRole,
  redirectTo = "/dashboard",
) {
  const { memberRole, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (ROLE_RANK[memberRole] < ROLE_RANK[requiredRole]) {
      router.replace(redirectTo);
    }
  }, [memberRole, loading, requiredRole, redirectTo, router]);
}

/**
 * Returns whether the current user can perform write operations
 * (owner, admin, or agent — not viewer).
 */
export function useCanWrite(): boolean {
  const { memberRole } = useAuth();
  return memberRole === 'owner' || memberRole === 'admin' || memberRole === 'agent';
}
