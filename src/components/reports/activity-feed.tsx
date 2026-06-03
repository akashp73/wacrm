'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, MessageSquare, Users, GitBranch, Radio, Zap, Tag, User } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import type { DateRange } from './date-range-picker';
import { dateRangeToISO } from './date-range-picker';

interface ActivityRow {
  id: string;
  entity_type: string;
  action: string;
  metadata: Record<string, string>;
  created_at: string;
}

const ENTITY_ICON: Record<string, React.ElementType> = {
  contact: Users,
  conversation: MessageSquare,
  deal: GitBranch,
  broadcast: Radio,
  automation: Zap,
  tag: Tag,
  message: MessageSquare,
};

const ACTION_LABEL: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  message_sent: 'Message sent',
  message_received: 'Message received',
  deal_moved: 'Deal moved',
  deal_closed: 'Deal closed',
  tag_added: 'Tag added',
  tag_removed: 'Tag removed',
  campaign_sent: 'Campaign sent',
  automation_triggered: 'Automation triggered',
  conversation_assigned: 'Conversation assigned',
  conversation_closed: 'Conversation closed',
};

const PAGE_SIZE = 25;

interface ActivityFeedProps {
  range: DateRange;
}

export function ActivityFeed({ range }: ActivityFeedProps) {
  const supabase = createClient();
  const { ownerId } = useAuth();

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchRows = useCallback(async (pageNum: number) => {
    if (!ownerId) return;
    setLoading(true);
    const since = dateRangeToISO(range);
    const { data, error } = await supabase
      .from('activity_log')
      .select('id, entity_type, action, metadata, created_at')
      .eq('user_id', ownerId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE);

    if (!error && data) {
      if (pageNum === 0) {
        setRows(data);
      } else {
        setRows((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === PAGE_SIZE + 1);
    }
    setLoading(false);
  }, [ownerId, range, supabase]);

  useEffect(() => {
    setPage(0);
    setRows([]);
    fetchRows(0);
  }, [fetchRows]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No activity in this period.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {rows.slice(0, page * PAGE_SIZE + PAGE_SIZE).map((row) => {
        const Icon = ENTITY_ICON[row.entity_type] ?? User;
        const label = ACTION_LABEL[row.action] ?? row.action;
        const name = row.metadata?.name || row.metadata?.title || row.entity_type;

        return (
          <div key={row.id} className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground/10">
              <Icon className="size-3.5 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">
                <span className="font-medium">{label}</span>
                {name && <span className="text-muted-foreground"> — {name}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
              </p>
            </div>
          </div>
        );
      })}

      {hasMore && (
        <div className="pt-2 text-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const next = page + 1;
              setPage(next);
              fetchRows(next);
            }}
            disabled={loading}
            className="border-border text-foreground/70 hover:bg-muted"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
}
