"use client";

import { usePathname } from "next/navigation";
import { Home, Search } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

const PAGE_LABELS: Record<string, string> = {
  "/dashboard":   "Home",
  "/contacts":    "Contacts",
  "/templates":   "Templates",
  "/broadcasts":  "Broadcasts",
  "/inbox":       "Inbox",
  "/pipelines":   "Pipelines",
  "/automations": "Automations",
  "/chatbots":    "Chatbots",
  "/drip":        "Drip",
  "/ai-agent":    "AI Agent",
  "/reports":     "Reports",
  "/settings":    "Settings",
};

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname];
  const match = Object.entries(PAGE_LABELS).find(([p]) => pathname.startsWith(p));
  return match ? match[1] : "Home";
}

interface HeaderProps {
  onOpenSidebar?: () => void;
  onOpenSearch?: () => void;
}

export function Header({ onOpenSidebar, onOpenSearch }: HeaderProps) {
  const pathname = usePathname();
  const label = getPageLabel(pathname);

  // ⌘K shortcut wires up to the palette via the onOpenSearch callback
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenSearch?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpenSearch]);

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-5">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-1.5 text-[13px] min-w-0">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open menu"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mr-1 lg:hidden"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors flex items-center">
          <Home className="h-3.5 w-3.5" />
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground truncate">{label}</span>
      </div>

      {/* Right: search bar */}
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-[13px] text-muted-foreground hover:bg-accent transition-colors min-w-0 max-w-[200px] w-full"
        aria-label="Open search (⌘K)"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 text-left truncate">Search...</span>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground hidden sm:inline">⌘K</span>
      </button>
    </header>
  );
}
