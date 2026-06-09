"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, LayoutTemplate, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AISuggestions } from "./ai-suggestions";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types";

interface MessageComposerProps {
  conversationId: string;
  sessionExpired: boolean;
  onSend: (text: string) => void;
  onOpenTemplates: () => void;
  onSendMedia?: (url: string, type: "image" | "video" | "document", caption?: string) => void;
  messages?: Message[];
  contactName?: string;
}

export function MessageComposer({
  conversationId,
  sessionExpired,
  onSend,
  onOpenTemplates,
  onSendMedia,
  messages = [],
  contactName,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    // Max 4 lines (~96px)
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || sessionExpired) return;

    setSending(true);
    try {
      onSend(trimmed);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } finally {
      setSending(false);
    }
  }, [text, sending, sessionExpired, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);
      adjustHeight();
    },
    [adjustHeight]
  );

  const handleSuggestionSelect = useCallback((suggestion: string) => {
    setText(suggestion);
    setTimeout(() => {
      textareaRef.current?.focus();
      adjustHeight();
    }, 0);
  }, [adjustHeight]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onSendMedia) return;

      // Reset so the same file can be re-selected
      e.target.value = "";

      const mimeToType = (mime: string): "image" | "video" | "document" | null => {
        if (mime.startsWith("image/")) return "image";
        if (mime.startsWith("video/")) return "video";
        if (mime === "application/pdf") return "document";
        return null;
      };

      const mediaType = mimeToType(file.type);
      if (!mediaType) return;

      setUploading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const path = `${user.id}/inbox/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("template-media")
          .upload(path, file);

        if (uploadError) {
          console.error("Upload failed:", uploadError);
          return;
        }

        const { data: urlData } = supabase.storage
          .from("template-media")
          .getPublicUrl(path);

        onSendMedia(urlData.publicUrl, mediaType, undefined);
      } finally {
        setUploading(false);
      }
    },
    [onSendMedia]
  );

  return (
    <div className="border-t border-border bg-card">
      {/* AI suggestions strip */}
      <AISuggestions
        conversationId={conversationId}
        contactName={contactName}
        messages={messages}
        onSelect={handleSuggestionSelect}
      />
      <div className="p-3">
      {sessionExpired && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-amber-500/10 px-3 py-2">
          <p className="text-xs text-amber-400">
            24-hour session expired. Use a template to re-engage.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-amber-400 hover:text-amber-300"
            onClick={onOpenTemplates}
          >
            <LayoutTemplate className="mr-1 h-3 w-3" />
            Templates
          </Button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          onClick={onOpenTemplates}
          title="Send template"
        >
          <LayoutTemplate className="h-4 w-4" />
        </Button>

        {onSendMedia && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/3gpp,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || sessionExpired}
              title="Send file"
            >
              {uploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>
          </>
        )}

        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={
            sessionExpired
              ? "Session expired - use a template"
              : "Type a message... (Shift+Enter for new line)"
          }
          disabled={sessionExpired}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder-slate-500 outline-none transition-colors focus:border-foreground/50",
            sessionExpired && "cursor-not-allowed opacity-50"
          )}
        />

        <Button
          size="sm"
          className="h-9 w-9 shrink-0 bg-foreground p-0 hover:bg-foreground disabled:opacity-40"
          disabled={!text.trim() || sessionExpired || sending}
          onClick={handleSend}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Hint sits outside the flex row so its height doesn't push
          `items-end` buttons below the textarea. Indented to line up
          under the textarea left edge (w-9 button + gap-2 = 44px). */}
      <p className="mt-1 pl-11 text-[10px] text-muted-foreground">
        Type &apos;/&apos; for quick replies
      </p>
      </div>
    </div>
  );
}
