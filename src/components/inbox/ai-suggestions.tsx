'use client';

import { useState, useCallback } from 'react';
import { Sparkles, RefreshCw, X, Loader2 } from 'lucide-react';
import type { Message } from '@/types';

interface AISuggestionsProps {
  conversationId: string;
  contactName?: string;
  messages: Message[];
  onSelect: (text: string) => void;
}

type State = 'idle' | 'loading' | 'done' | 'error';

export function AISuggestions({
  conversationId,
  contactName,
  messages,
  onSelect,
}: AISuggestionsProps) {
  const [state, setState] = useState<State>('idle');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [visible, setVisible] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setState('loading');
    setVisible(true);
    try {
      const res = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          contactName: contactName ?? 'Customer',
          messages: messages.slice(-10).map((m) => ({
            sender_type: m.sender_type,
            content_text: m.content_text,
            created_at: m.created_at,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'AI error');
      setSuggestions(data.suggestions ?? []);
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to get suggestions');
      setState('error');
    }
  }, [conversationId, contactName, messages]);

  if (!visible) {
    return (
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={fetchSuggestions}
          className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI Suggestions
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-border px-3 py-2.5 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[12px] font-medium text-muted-foreground">AI Suggestions</span>
        </div>
        <div className="flex items-center gap-1">
          {state === 'done' && (
            <button
              onClick={fetchSuggestions}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title="Regenerate"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          )}
          <button
            onClick={() => { setVisible(false); setState('idle'); setSuggestions([]); }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Loading skeleton */}
      {state === 'loading' && (
        <div className="flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span className="text-[12px] text-muted-foreground">Generating suggestions…</span>
        </div>
      )}

      {/* Error state */}
      {state === 'error' && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-red-500">{errorMsg}.</span>
          <button
            onClick={fetchSuggestions}
            className="text-[12px] font-medium text-foreground underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Suggestion chips */}
      {state === 'done' && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSelect(s)}
              title={s}
              className="max-w-[200px] truncate rounded-full border border-border bg-card px-3 py-1 text-[12px] text-foreground hover:bg-muted hover:border-foreground/20 transition-colors text-left"
            >
              {s.length > 45 ? s.slice(0, 42) + '…' : s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
