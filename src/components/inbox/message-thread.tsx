"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Conversation, Message, Contact, ConversationStatus } from "@/types";
import {
  MessageSquare,
  ChevronDown,
  UserPlus,
  Clock,
  ArrowLeft,
  X,
  Search,
} from "lucide-react";
import { format, isToday, isYesterday, differenceInHours } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { MessageBubble } from "./message-bubble";
import { MessageComposer } from "./message-composer";
import { toast } from "sonner";

interface MessageTemplate {
  id: string;
  name: string;
  language: string;
  body_text: string;
  header_type?: string | null;
  header_content?: string | null;
  footer_text?: string | null;
  status: string;
}

function extractVariables(text: string): number[] {
  const matches = text.matchAll(/\{\{(\d+)\}\}/g);
  const nums = new Set<number>();
  for (const m of matches) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}

interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSend: (name: string, language: string, params: string[]) => void;
}

function TemplatePickerModal({ open, onClose, onSend }: TemplatePickerModalProps) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setParams([]);
    setSearch("");

    const supabase = createClient();
    setLoading(true);
    supabase
      .from("message_templates")
      .select("id, name, language, body_text, header_type, header_content, footer_text, status")
      .in("status", ["Approved", "approved"])
      .order("name")
      .then(({ data }) => {
        setTemplates(data ?? []);
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, search]);

  const handleSelect = (t: MessageTemplate) => {
    const vars = extractVariables(t.body_text);
    setSelected(t);
    setParams(vars.map(() => ""));
  };

  const handleSend = () => {
    if (!selected) return;
    onSend(selected.name, selected.language || "en_US", params);
  };

  const variableNums = selected ? extractVariables(selected.body_text) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            {selected ? "Fill variables" : "Select template"}
          </DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="flex flex-col">
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
            <ScrollArea className="h-72">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {templates.length === 0
                    ? "No approved templates found. Approve a template in Templates settings first."
                    : "No templates match your search."}
                </div>
              ) : (
                <div className="flex flex-col divide-y divide-border">
                  {filtered.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleSelect(t)}
                      className="flex flex-col items-start gap-0.5 px-4 py-3 text-left hover:bg-muted transition-colors"
                    >
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                      <span className="text-xs text-muted-foreground line-clamp-2">
                        {t.body_text}
                      </span>
                      <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t.language || "en_US"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="rounded-lg bg-muted px-3 py-2.5 text-sm text-foreground whitespace-pre-wrap">
              {selected.body_text}
            </div>

            {variableNums.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Fill in variables:</p>
                {variableNums.map((n, idx) => (
                  <div key={n} className="flex items-center gap-2">
                    <span className="w-8 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center text-[11px] font-mono text-muted-foreground">
                      {`{{${n}}}`}
                    </span>
                    <Input
                      value={params[idx] ?? ""}
                      onChange={(e) => {
                        const next = [...params];
                        next[idx] = e.target.value;
                        setParams(next);
                      }}
                      placeholder={`Variable ${n}`}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Back
              </Button>
              <Button size="sm" onClick={handleSend}>
                Send Template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface MessageThreadProps {
  conversation: Conversation | null;
  contact: Contact | null;
  messages: Message[];
  onMessagesLoaded: (messages: Message[]) => void;
  onNewMessage: (message: Message) => void;
  onUpdateMessage: (id: string, updates: Partial<Message>) => void;
  onStatusChange: (conversationId: string, status: ConversationStatus) => void;
  /**
   * On mobile, the thread is shown full-screen with the conversation list
   * hidden. This callback lets the page deselect the active conversation
   * and reveal the list again. Rendered as a back-arrow in the header on
   * mobile only.
   */
  onBack?: () => void;
}

function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

function groupMessagesByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const day = format(new Date(msg.created_at), "yyyy-MM-dd");
    if (day !== currentDate) {
      currentDate = day;
      groups.push({ date: msg.created_at, messages: [msg] });
    } else {
      groups[groups.length - 1].messages.push(msg);
    }
  }

  return groups;
}

const STATUS_OPTIONS: { label: string; value: ConversationStatus; color: string }[] = [
  { label: "Open", value: "open", color: "text-foreground" },
  { label: "Pending", value: "pending", color: "text-amber-400" },
  { label: "Closed", value: "closed", color: "text-muted-foreground" },
];

export function MessageThread({
  conversation,
  contact,
  messages,
  onMessagesLoaded,
  onNewMessage,
  onUpdateMessage,
  onStatusChange,
  onBack,
}: MessageThreadProps) {
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);

  // 24-hour session timer
  const sessionInfo = useMemo(() => {
    if (!messages.length) return { expired: false, remaining: "" };

    // Find last customer message
    const lastCustomerMsg = [...messages]
      .reverse()
      .find((m) => m.sender_type === "customer");

    if (!lastCustomerMsg) return { expired: true, remaining: "No customer messages" };

    const hoursSince = differenceInHours(new Date(), new Date(lastCustomerMsg.created_at));
    const expired = hoursSince >= 24;

    if (expired) {
      return { expired: true, remaining: "Expired" };
    }

    const hoursLeft = 24 - hoursSince;
    const remaining =
      hoursLeft >= 1
        ? `${Math.floor(hoursLeft)}h remaining`
        : `${Math.floor(hoursLeft * 60)}m remaining`;

    return { expired, remaining };
  }, [messages]);

  // Store latest callback in a ref so fetchMessages doesn't need to
  // depend on `onMessagesLoaded` — otherwise parent re-renders cause
  // fetchMessages to change → useEffect re-fires → refetch → realtime
  // UPDATE on conversations.unread_count → parent re-renders → LOOP.
  // The ref is written inside an effect so the mutation doesn't happen
  // during render (React 19 refs rule); consumers only read `.current`
  // inside the async fetch completion, which runs after the render.
  const onMessagesLoadedRef = useRef(onMessagesLoaded);
  useEffect(() => {
    onMessagesLoadedRef.current = onMessagesLoaded;
  });

  const conversationId = conversation?.id;
  const hasUnread = (conversation?.unread_count ?? 0) > 0;

  // Fetch messages whenever the selected conversation changes. Kept
  // separate from the unread-reset effect so that incoming messages
  // arriving while the thread is open don't trigger a full refetch —
  // they only flip hasUnread, which only the reset effect listens to.
  useEffect(() => {
    if (!conversationId) return;

    const supabase = createClient();
    let cancelled = false;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch messages:", error);
      } else {
        onMessagesLoadedRef.current(data ?? []);
      }

      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  // Reset the server-side unread_count to 0 whenever an unread count
  // surfaces on the active conversation — covers both (a) opening a
  // conversation that had unread messages and (b) new messages arriving
  // while the user is already viewing the thread (webhook server-bumps
  // unread_count to N+1; the realtime UPDATE propagates it into the
  // client, which re-runs this effect and flips it back to 0).
  //
  // Guarding on hasUnread prevents the eq-update loop: once unread_count
  // is 0 the condition is false, so no further UPDATE is issued.
  useEffect(() => {
    if (!conversationId || !hasUnread) return;
    const supabase = createClient();
    supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId)
      .then(({ error }) => {
        if (error) console.error("Failed to reset unread_count:", error);
      });
  }, [conversationId, hasUnread]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;

      // Optimistic update — shows the message immediately with "sending" status
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "text",
        content_text: text,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "text",
            content_text: text,
          }),
        });

        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          console.error("Failed to send message:", reason);
          toast.error(`Failed to send: ${reason}`);
          // Mark the optimistic bubble as failed so the user sees what happened
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }

        // Success — the realtime INSERT event will replace the temp bubble
        // with the real DB row. If realtime hasn't arrived yet, at least
        // flip status to 'sent' so the UI stops showing "sending".
        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        console.error("Failed to send message:", err);
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleStatusChange = useCallback(
    async (status: ConversationStatus) => {
      if (!conversation) return;

      const supabase = createClient();
      await supabase
        .from("conversations")
        .update({ status })
        .eq("id", conversation.id);

      onStatusChange(conversation.id, status);
    },
    [conversation, onStatusChange]
  );

  const handleOpenTemplates = useCallback(() => {
    setTemplateModalOpen(true);
  }, []);

  const handleSendTemplate = useCallback(
    async (templateName: string, language: string, params: string[]) => {
      setTemplateModalOpen(false);
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: "template",
        content_text: `[template:${templateName}]`,
        template_name: templateName,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: "template",
            template_name: templateName,
            template_language: language,
            template_params: params,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          toast.error(`Failed to send template: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }
        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send template: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  const handleSendMedia = useCallback(
    async (mediaUrl: string, mediaType: "image" | "video" | "document", caption?: string) => {
      if (!conversation) return;

      const tempId = `temp-${Date.now()}`;
      const optimisticMsg: Message = {
        id: tempId,
        conversation_id: conversation.id,
        sender_type: "agent",
        content_type: mediaType,
        content_text: caption || undefined,
        media_url: mediaUrl,
        status: "sending",
        created_at: new Date().toISOString(),
      };
      onNewMessage(optimisticMsg);

      try {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation_id: conversation.id,
            message_type: mediaType,
            media_url: mediaUrl,
            content_text: caption || undefined,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const reason = payload?.error || `HTTP ${res.status}`;
          toast.error(`Failed to send file: ${reason}`);
          onUpdateMessage(tempId, { status: "failed" });
          return;
        }
        onUpdateMessage(tempId, { status: "sent" });
      } catch (err) {
        const reason = err instanceof Error ? err.message : "network error";
        toast.error(`Failed to send file: ${reason}`);
        onUpdateMessage(tempId, { status: "failed" });
      }
    },
    [conversation, onNewMessage, onUpdateMessage]
  );

  // Empty state — DoubleTick-style
  if (!conversation || !contact) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-background dark:bg-background">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-foreground/10">
          <MessageSquare className="h-10 w-10 text-foreground" />
        </div>
        <h3 className="mt-5 text-base font-semibold text-foreground dark:text-foreground">
          Start by clicking any chat
        </h3>
        <p className="mt-1 max-w-xs text-center text-sm text-muted-foreground dark:text-muted-foreground">
          Select a conversation from the list to read and reply to messages.
        </p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const messageGroups = groupMessagesByDate(messages);
  const currentStatus = STATUS_OPTIONS.find(
    (s) => s.value === conversation.status
  );

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-card px-3 py-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Back-to-list button — mobile only. Hidden on lg+ where the
              conversation list is always visible next to the thread. */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to conversations"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-muted hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-foreground">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{displayName}</h2>
            <p className="truncate text-xs text-muted-foreground">{contact.phone}</p>
          </div>
          {/* Session timer badge — hidden on the narrowest phones so
              the name + back arrow keep their room. */}
          <Badge
            variant="outline"
            className={cn(
              "ml-1 hidden gap-1 border-border text-[10px] sm:inline-flex sm:ml-2",
              sessionInfo.expired ? "text-red-400" : "text-foreground"
            )}
          >
            <Clock className="h-3 w-3" />
            {sessionInfo.remaining}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(
                  "inline-flex items-center justify-center h-7 gap-1 px-2 text-xs rounded-md hover:bg-muted",
                  currentStatus?.color ?? "text-muted-foreground"
                )}>
                {currentStatus?.label ?? "Status"}
                <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-border bg-muted"
            >
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={cn("text-sm", opt.color)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Assign button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <UserPlus className="h-3 w-3" />
            Assign
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">
              Send a template to start the conversation
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messageGroups.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-4 flex items-center justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {formatDateSeparator(group.date)}
                  </span>
                </div>
                {/* Messages */}
                <div className="space-y-2">
                  {group.messages.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        conversationId={conversation.id}
        sessionExpired={sessionInfo.expired}
        onSend={handleSend}
        onOpenTemplates={handleOpenTemplates}
        onSendMedia={handleSendMedia}
        messages={messages}
        contactName={contact.name ?? contact.phone}
      />

      <TemplatePickerModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSend={handleSendTemplate}
      />
    </div>
  );
}
