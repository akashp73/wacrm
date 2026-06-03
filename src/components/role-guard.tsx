"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRole } from "@/hooks/use-role";
import type { WorkspaceRole } from "@/types";

const RANK: Record<WorkspaceRole, number> = {
  owner: 4, admin: 3, agent: 2, viewer: 1,
};

interface RoleGuardProps {
  requiredRole: WorkspaceRole;
  redirectTo?: string;
  children: React.ReactNode;
}

/**
 * Wraps a page/section. Redirects with a toast if the current user's
 * role is below `requiredRole`.
 */
export function RoleGuard({ requiredRole, redirectTo = "/dashboard", children }: RoleGuardProps) {
  const { role, loading } = useRole();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (RANK[role] < RANK[requiredRole]) {
      toast.error("Access denied — insufficient permissions");
      router.replace(redirectTo);
    }
  }, [role, loading, requiredRole, redirectTo, router]);

  if (loading) return null;
  if (RANK[role] < RANK[requiredRole]) return null;

  return <>{children}</>;
}
