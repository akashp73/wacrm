"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation, ConversationStatus } from "@/types";
import { Search, SlidersHorizontal, ChevronDown } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (conversation: Conversation) => void;
  conversations: Conversation[];
  onConversationsLoaded: (conversations: Conversation[]) => void;
}

const STATUS_COLORS: Record<ConversationStatus, string> = {
  open: "bg-foreground",
  pending: "bg-amber-500",
  closed: "bg-slate-500",
};

const FILTER_OPTIONS: { label: string; value: ConversationStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Pending", value: "pending" },
  { label: "Closed", value: "closed" },
];

export function ConversationList({
  activeConversationId,
  onSelect,
  conversations,
  onConversationsLoaded,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationStatus | "all">("all");
  const [loading, setLoading] = useState(true);

  // Keep the latest callback in a ref so the fetch effect below can
  // have a stable, empty-dep identity. Previously the fetch useCallback
  // depended on `onConversationsLoaded`, which depends on the parent's
  // `deepLinkConvId` — so every URL change (including one the parent
  // triggered via router.replace after a click) caused a fresh
  // conversations fetch. That extra refetch was the trigger for the
  // deep-link auto-select running a second time and wiping the active
  // thread's messages.
  // Mutation lives in an effect (not render) per React 19's refs rule;
  // the fetch runs once on mount so it's fine to read the slightly
  // older value — the very next render updates the ref for any
  // subsequent async completion.
  const onConversationsLoadedRef = useRef(onConversationsLoaded);
  useEffect(() => {
    onConversationsLoadedRef.current = onConversationsLoaded;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contact:contacts(*)")
        .order("last_message_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        // Supabase errors have non-enumerable properties — log fields explicitly
        console.error("Failed to fetch conversations:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        setLoading(false);
        return;
      }

      onConversationsLoadedRef.current(data ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let result = conversations;

    if (filter !== "all") {
      result = result.filter((c) => c.status === filter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const name = c.contact?.name?.toLowerCase() ?? "";
        const phone = c.contact?.phone?.toLowerCase() ?? "";
        const lastMsg = c.last_message_text?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || lastMsg.includes(q);
      });
    }

    return result;
  }, [conversations, filter, search]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
    },
    []
  );

  const handleSelect = useCallback(
    (conv: Conversation) => {
      onSelect(conv);
    },
    [onSelect]
  );

  const activeFilter = FILTER_OPTIONS.find((o) => o.value === filter);

  return (
    <div className="flex h-full w-full flex-col border-r border-border bg-white dark:border-border dark:bg-card lg:w-80">
      {/* DoubleTick-style header row */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:border-border">
        <h2 className="text-[15px] font-semibold text-foreground dark:text-foreground">My Chats</h2>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-muted dark:hover:bg-muted">
              {activeFilter?.label ?? "All"}
              <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border-border dark:border-border">
              {FILTER_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setFilter(opt.value)}
                className={cn(
                  "text-sm",
                  filter === opt.value
                    ? "text-foreground"
                    : "text-foreground/70"
                )}
              >
                {opt.label}
              </DropdownMenuItem>
            ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            aria-label="Search"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted dark:hover:bg-muted"
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            aria-label="Filter"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted dark:hover:bg-muted"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="border-b border-border px-3 py-2 dark:border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={handleSearchChange}
            placeholder="Search or start new chat"
            className="rounded-lg border-border bg-muted pl-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-foreground dark:border-border dark:bg-muted dark:text-foreground"
          />
        </div>
      </div>

      {/* Conversation Items */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">No conversations found</p>
          </div>
        ) : (
          <div className="flex flex-col">
            {filtered.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onSelect={handleSelect}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onSelect: (conversation: Conversation) => void;
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const contact = conversation.contact;
  const displayName = contact?.name || contact?.phone || "Unknown";
  const initials = displayName.charAt(0).toUpperCase();

  const handleClick = useCallback(() => {
    onSelect(conversation);
  }, [onSelect, conversation]);

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: false,
      })
    : "";

  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
        isActive
          ? "border-l-[3px] border-l-foreground bg-muted dark:bg-muted"
          : "border-l-[3px] border-l-transparent hover:bg-muted dark:hover:bg-muted/50",
      )}
    >
      {/* Avatar — green circle with initial, DoubleTick style */}
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-white">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={displayName}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-foreground dark:text-foreground">
            {displayName}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground dark:text-muted-foreground">{timeAgo}</span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {conversation.last_message_source && conversation.last_message_source !== "manual" && (
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                {conversation.last_message_source === "bot_studio" ? "🤖"
                  : conversation.last_message_source === "automation" ? "⚡"
                  : conversation.last_message_source === "drip" ? "💧"
                  : conversation.last_message_source === "ai_agent" ? "✨"
                  : conversation.last_message_source === "broadcast" ? "📢"
                  : null}
              </span>
            )}
            <p className="truncate text-[12px] text-muted-foreground dark:text-muted-foreground">
              {conversation.last_message_text || "No messages yet"}
            </p>
          </div>
          {conversation.unread_count > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-white">
              {conversation.unread_count > 99 ? "99+" : conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
