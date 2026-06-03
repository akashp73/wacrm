'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { Plus, Loader2, Zap, Users, ToggleLeft, ToggleRight, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';

interface DripCampaign {
  id: string;
  name: string;
  trigger_type: 'new_contact' | 'tag_added' | 'manual';
  is_active: boolean;
  created_at: string;
  enrollments_count?: number;
}

const TRIGGER_LABEL: Record<string, string> = {
  new_contact: 'New contact created',
  tag_added: 'Tag added to contact',
  manual: 'Manual enrollment',
};

export default function DripPage() {
  const router = useRouter();
  const supabase = createClient();
  const { ownerId } = useAuth();

  const [campaigns, setCampaigns] = useState<DripCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DripCampaign | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchCampaigns = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('drip_campaigns')
      .select('*')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Failed to load drip campaigns');
    } else {
      // Fetch enrollment counts
      const ids = (data ?? []).map((c) => c.id);
      const counts: Record<string, number> = {};
      if (ids.length > 0) {
        const { data: enrollRows } = await supabase
          .from('drip_enrollments')
          .select('drip_campaign_id')
          .in('drip_campaign_id', ids)
          .eq('status', 'active');
        (enrollRows ?? []).forEach((r) => {
          counts[r.drip_campaign_id] = (counts[r.drip_campaign_id] ?? 0) + 1;
        });
      }
      setCampaigns((data ?? []).map((c) => ({ ...c, enrollments_count: counts[c.id] ?? 0 })));
    }
    setLoading(false);
  }, [ownerId, supabase]);

  useEffect(() => { fetchCampaigns(); }, [fetchCampaigns]);

  async function toggleActive(campaign: DripCampaign) {
    const { error } = await supabase
      .from('drip_campaigns')
      .update({ is_active: !campaign.is_active })
      .eq('id', campaign.id);
    if (error) {
      toast.error('Failed to update campaign');
    } else {
      setCampaigns((prev) =>
        prev.map((c) => (c.id === campaign.id ? { ...c, is_active: !c.is_active } : c)),
      );
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from('drip_campaigns').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Failed to delete campaign');
    } else {
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success('Campaign deleted');
    }
    setDeleting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Drip Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated multi-step message sequences for your contacts.
          </p>
        </div>
        <Link href="/drip/new" className={cn(buttonVariants(), 'bg-foreground hover:bg-foreground/90 text-background gap-1.5')}>
          <Plus className="size-4" />
          New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <Card className="bg-card border-border ring-0">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Zap className="size-12 text-muted-foreground mb-4" />
            <p className="text-foreground/70 font-medium">No drip campaigns yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              Create automated sequences that send messages over time.
            </p>
            <Link href="/drip/new" className={cn(buttonVariants(), 'bg-foreground hover:bg-foreground/90 text-background gap-1.5')}>
              <Plus className="size-4" />
              Create your first campaign
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((campaign) => (
            <Card key={campaign.id} className="bg-card border-border ring-0 hover:border-foreground/40 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/drip/${campaign.id}`}
                      className="font-semibold text-foreground hover:text-foreground transition-colors truncate block"
                    >
                      {campaign.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {TRIGGER_LABEL[campaign.trigger_type] ?? campaign.trigger_type}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Campaign options"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => router.push(`/drip/${campaign.id}`)} className="text-foreground focus:bg-muted">
                        <Pencil className="size-4" />
                        View / Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(campaign)}
                        className="text-red-400 focus:bg-muted focus:text-red-400"
                      >
                        <Trash2 className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3.5" />
                      {campaign.enrollments_count ?? 0} active
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>{formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}</span>
                  </div>

                  <button
                    onClick={() => toggleActive(campaign)}
                    className="flex items-center gap-1.5 text-xs font-medium transition-colors"
                    aria-label={campaign.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {campaign.is_active ? (
                      <>
                        <ToggleRight className="size-5 text-emerald-500" />
                        <span className="text-emerald-400">Active</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft className="size-5 text-muted-foreground" />
                        <span className="text-muted-foreground">Inactive</span>
                      </>
                    )}
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Delete Campaign</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Delete <strong className="text-foreground">{deleteTarget?.name}</strong>? This will also remove all
              enrollments. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="border-border text-foreground/70 hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleDelete} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-foreground">
              {deleting ? <Loader2 className="size-4 animate-spin" /> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
