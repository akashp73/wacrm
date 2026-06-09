"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import type { WorkspaceRole } from "@/types";
import {
  Home, MessageSquare, Users, Send, LayoutTemplate,
  GitBranch, Zap, ListOrdered, Bot, Workflow, Cpu,
  BarChart2, Settings, Map,
  LayoutGrid, ChevronRight, LogOut, Plus, X, ShieldAlert,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  minRole?: WorkspaceRole;
  soon?: boolean;
  badge?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

// ─── Nav structure ────────────────────────────────────────────

const NAV: NavSection[] = [
  {
    label: "APPX",
    items: [
      { href: "/dashboard",  label: "Home",       icon: Home },
      { href: "/contacts",   label: "Contacts",   icon: Users },
      { href: "/templates",  label: "Templates",  icon: LayoutTemplate, minRole: "admin" },
      { href: "/broadcasts", label: "Broadcasts", icon: Send,            minRole: "admin" },
      { href: "/inbox",      label: "Inbox",      icon: MessageSquare },
    ],
  },
  {
    label: "AUTOMATION",
    items: [
      { href: "/pipelines",   label: "Pipelines",   icon: GitBranch,   minRole: "admin" },
      { href: "/automations", label: "Automations", icon: Zap,         minRole: "admin" },
      { href: "/chatbots",    label: "Chatbots",    icon: Workflow,    minRole: "admin" },
      { href: "/bot-studio",  label: "Bot Studio",  icon: Cpu,         minRole: "admin" },
      { href: "/drip",        label: "Drip",        icon: ListOrdered, minRole: "admin" },
      { href: "/ai-agent",    label: "AI Agent",    icon: Bot,         minRole: "admin" },
    ],
  },
  {
    label: "CONFIGURE",
    items: [
      { href: "/planning", label: "Planning", icon: Map,       minRole: "admin" },
      { href: "/reports",  label: "Reports",  icon: BarChart2, minRole: "admin" },
      { href: "/settings", label: "Settings", icon: Settings,  minRole: "admin" },
    ],
  },
];

const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 4, admin: 3, agent: 2, viewer: 1 };
const hasAccess = (min: WorkspaceRole | undefined, role: WorkspaceRole) =>
  !min || ROLE_RANK[role] >= ROLE_RANK[min];

// ─── User Popover ─────────────────────────────────────────────

function UserPopover({
  profile,
  onClose,
  onSignOut,
}: {
  profile: { full_name: string | null; email: string } | null;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-2 right-2 mb-1 z-50 rounded-xl border border-border bg-card shadow-lg py-1 text-sm"
    >
      {/* Identity */}
      <div className="px-3 py-2 border-b border-border">
        <p className="font-medium text-foreground truncate">{profile?.full_name ?? "User"}</p>
        <p className="text-xs text-muted-foreground truncate">{profile?.email ?? ""}</p>
      </div>

      {[
        { label: "Account settings", href: "/settings?tab=profile" },
        { label: "All projects",     href: "#" },
      ].map((item) => (
        <button
          key={item.label}
          onClick={() => { router.push(item.href); onClose(); }}
          className="w-full text-left px-3 py-2 hover:bg-muted transition-colors text-foreground"
        >
          {item.label}
        </button>
      ))}

      {/* Billing row with SOON badge */}
      <div className="flex items-center justify-between px-3 py-2 text-muted-foreground cursor-default">
        <span>Billing</span>
        <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-px font-medium">SOON</span>
      </div>

      <div className="border-t border-border mt-1" />

      <button
        onClick={() => { onSignOut(); onClose(); }}
        className="w-full text-left px-3 py-2 text-[#EF4444] hover:bg-muted transition-colors"
      >
        Log out
      </button>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────

interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, profile, signOut, memberRole } = useAuth();
  const totalUnread = useTotalUnread();

  // Collapse state — persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidebar-collapsed") === "true";
  });

  const [popoverOpen, setPopoverOpen] = useState(false);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    if (typeof window !== "undefined") localStorage.setItem("sidebar-collapsed", String(next));
  };

  // Close drawer on route change (mobile)
  useEffect(() => { onClose?.(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Body scroll lock + ESC close on mobile
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", handler); };
  }, [open, onClose]);

  const initial = (profile?.full_name ?? profile?.email ?? "U").charAt(0).toUpperCase();
  const w = collapsed ? "w-12" : "w-[180px]";

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/30 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sidebar-bg border-r border-border",
          "transition-all duration-200 ease-out",
          w,
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:translate-x-0",
        )}
        aria-label="Primary navigation"
      >
        {/* ── Header row ── */}
        <div className={cn(
          "flex h-11 shrink-0 items-center border-b border-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}>
          {/* Logo — always visible; click expands when collapsed */}
          <button
            onClick={collapsed ? toggleCollapse : undefined}
            className={cn(
              "flex items-center gap-2 min-w-0",
              collapsed ? "cursor-pointer" : "cursor-default",
            )}
            aria-label={collapsed ? "Expand sidebar" : undefined}
            type="button"
          >
            <Image src="/logo-mark.png" alt="" width={24} height={24} className="h-6 w-6 shrink-0" />
            {!collapsed && (
              <span className="text-[14px] font-bold text-foreground truncate">Sensytick</span>
            )}
          </button>

          {/* Collapse toggle — only shown when expanded */}
          {!collapsed && (
            <button
              onClick={toggleCollapse}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Collapse sidebar"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-none">
          {NAV.map((section) => {
            const visibleItems = section.items.filter(
              (item) => hasAccess(item.minRole, memberRole),
            );
            if (visibleItems.length === 0) return null;

            return (
              <div key={section.label} className="mb-3">
                {!collapsed && (
                  <p className="mx-3 mb-1 text-[11px] font-medium uppercase tracking-widest text-sidebar-label">
                    {section.label}
                  </p>
                )}
                <ul className="space-y-px">
                  {visibleItems.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname.startsWith(item.href));
                    const unread = item.href === "/inbox" ? totalUnread : 0;

                    return (
                      <li key={item.href}>
                        {item.soon ? (
                          <div
                            className={cn(
                              "flex items-center gap-2.5 rounded-md mx-2 px-2.5 py-2 cursor-default",
                              "text-muted-foreground",
                              collapsed && "justify-center px-0 mx-0 rounded-none",
                            )}
                            title={collapsed ? item.label : undefined}
                          >
                            <item.icon className={cn("h-4 w-4 shrink-0", collapsed ? "h-[18px] w-[18px]" : "")} />
                            {!collapsed && (
                              <>
                                <span className="flex-1 text-[13px] truncate">{item.label}</span>
                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                                  SOON
                                </span>
                              </>
                            )}
                          </div>
                        ) : (
                          <Link
                            href={item.href}
                            className={cn(
                              "flex items-center gap-2.5 rounded-md mx-2 px-2.5 py-2 transition-colors",
                              "text-[13px] font-normal text-sidebar-text",
                              isActive
                                ? "bg-sidebar-active font-medium border-l-2 border-foreground rounded-l-none"
                                : "hover:bg-sidebar-hover",
                              collapsed && "justify-center px-0 mx-0 rounded-none border-l-0",
                            )}
                            title={collapsed ? item.label : undefined}
                          >
                            <item.icon className={cn("h-4 w-4 shrink-0", collapsed ? "h-[18px] w-[18px]" : "")} />
                            {!collapsed && (
                              <>
                                <span className="flex-1 truncate">{item.label}</span>
                                {unread > 0 && (
                                  <span className="shrink-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background">
                                    {unread > 99 ? "99+" : unread}
                                  </span>
                                )}
                              </>
                            )}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* ── Super Admin link (superadmin only) ── */}
        {user?.email === process.env.NEXT_PUBLIC_SUPERADMIN_EMAIL && (
          <div className="px-2 pb-1">
            <Link
              href="/superadmin"
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors text-[13px] font-medium",
                pathname.startsWith("/superadmin")
                  ? "bg-sidebar-active border-l-2 border-foreground rounded-l-none text-foreground"
                  : "text-amber-600 dark:text-amber-400 hover:bg-sidebar-hover",
                collapsed && "justify-center px-0 mx-0 rounded-none border-l-0",
              )}
              title={collapsed ? "Super Admin" : undefined}
            >
              <ShieldAlert className={cn("h-4 w-4 shrink-0", collapsed && "h-[18px] w-[18px]")} />
              {!collapsed && <span className="flex-1 truncate">Super Admin</span>}
            </Link>
          </div>
        )}

        {/* ── Credits widget ── */}
        {!collapsed && (
          <div className="shrink-0 mx-2 mb-2 rounded-lg bg-muted px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Credits left
                </p>
                <p className="text-sm font-semibold text-foreground mt-0.5">₹0.00</p>
              </div>
              <Link
                href="/settings?tab=whatsapp"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 transition-opacity"
                aria-label="Add credits"
                title="Add credits"
              >
                <Plus className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* ── User row + expand button (collapsed) ── */}
        <div className={cn("shrink-0 border-t border-border", collapsed ? "p-0" : "px-0 pb-0")}>
          {collapsed ? (
            <button
              onClick={toggleCollapse}
              className="flex w-full h-10 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <div className="relative">
              {popoverOpen && (
                <UserPopover
                  profile={profile}
                  onClose={() => setPopoverOpen(false)}
                  onSignOut={signOut}
                />
              )}
              <button
                onClick={() => setPopoverOpen((v) => !v)}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 hover:bg-muted transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-[12px] font-semibold text-background">
                  {initial}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-medium text-foreground truncate leading-tight">
                      {profile?.full_name ?? "User"}
                    </p>
                    {memberRole !== 'owner' && (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {memberRole}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight">
                    {profile?.email ?? ""}
                  </p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
