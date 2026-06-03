"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Search, Home, Users, Send, MessageSquare, LayoutTemplate, GitBranch, Zap, ListOrdered, Workflow, Bot, BarChart2, Settings } from "lucide-react";

interface PaletteItem {
  label: string;
  href: string;
  icon: React.ElementType;
  soon?: boolean;
}

interface PaletteGroup {
  label: string;
  items: PaletteItem[];
}

const GROUPS: PaletteGroup[] = [
  {
    label: "Main",
    items: [
      { label: "Home",       href: "/dashboard",  icon: Home },
      { label: "Contacts",   href: "/contacts",   icon: Users },
      { label: "Templates",  href: "/templates",  icon: LayoutTemplate },
      { label: "Broadcasts", href: "/broadcasts", icon: Send },
      { label: "Inbox",      href: "/inbox",      icon: MessageSquare },
    ],
  },
  {
    label: "Automation",
    items: [
      { label: "Pipelines",   href: "/pipelines",   icon: GitBranch },
      { label: "Automations", href: "/automations", icon: Zap },
      { label: "Chatbots",    href: "/chatbots",    icon: Workflow },
      { label: "Drip",        href: "/drip",        icon: ListOrdered },
      { label: "AI Agent",    href: "/ai-agent",    icon: Bot },
    ],
  },
  {
    label: "Configure",
    items: [
      { label: "Reports",  href: "/reports",  icon: BarChart2 },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const q = query.toLowerCase().trim();

  const filteredGroups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      !q || item.label.toLowerCase().includes(q)
    ),
  })).filter((g) => g.items.length > 0);

  const navigate = (href: string, soon?: boolean) => {
    if (soon) return;
    router.push(href);
    onClose();
  };

  if (!open) return null;

  const palette = (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      style={{ backdropFilter: "blur(4px)", backgroundColor: "rgba(0,0,0,0.4)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <kbd className="shrink-0 text-[11px] text-muted-foreground font-medium">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[380px] overflow-y-auto py-2">
          {filteredGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No results found.</p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                {group.items.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => navigate(item.href, item.soon)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                      item.soon
                        ? "cursor-default text-muted-foreground"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.soon && (
                      <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-px font-medium">
                        SOON
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return typeof window !== "undefined"
    ? createPortal(palette, document.body)
    : null;
}
